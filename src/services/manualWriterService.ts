import type { AssessmentData } from '../types/assessment';
import type { ClaudeMessageParams } from './claudeProxy';
import { createClaudeMessage, createClaudeMessageStream, type ClaudeMessageStreamCallbacks } from './claudeProxy';
import type { ManualDefinition } from './manualDocxGenerator';

// ---------------------------------------------------------------------------
// Standards registry
// ---------------------------------------------------------------------------

export interface StandardDefinition {
  id: string;
  label: string;
  agentKbId: string;
  cfrParts?: string[];
  citationStyle: string;
}

export const AVAILABLE_STANDARDS: StandardDefinition[] = [
  { id: 'faa', label: '14 CFR / FAA', agentKbId: 'faa-inspector', cfrParts: ['43', '91', '119', '121', '135', '145'], citationStyle: '§145.211(a)(1)' },
  { id: 'faa-sas', label: 'FAA SAS / DCT', agentKbId: 'faa-inspector', cfrParts: ['119', '121', '135', '145'], citationStyle: 'SAS DCT Safety Attribute: Procedures' },
  { id: 'isbao', label: 'IS-BAO', agentKbId: 'isbao-auditor', citationStyle: 'IS-BAO §5.3.2' },
  { id: 'as9100', label: 'AS9100 / AS9110', agentKbId: 'as9100-auditor', citationStyle: 'AS9100D Clause 8.5.1' },
  { id: 'wyvern', label: 'ARGUS / Wyvern', agentKbId: 'safety-auditor', citationStyle: 'Wyvern PASS Item X' },
  { id: 'sms', label: 'SMS / ICAO', agentKbId: 'sms-consultant', citationStyle: 'ICAO Doc 9859 Pillar 2' },
  { id: 'easa', label: 'EASA', agentKbId: 'easa-inspector', citationStyle: 'EASA Part-145 AMC 145.A.70' },
  { id: 'nasa', label: 'NASA', agentKbId: 'nasa-auditor', citationStyle: 'NASA-STD-8739.4' },
  { id: 'nbaa', label: 'NBAA', agentKbId: 'safety-auditor', citationStyle: 'NBAA MBR Criterion X' },
];

// ---------------------------------------------------------------------------
// Manual type → CFR parts mapping
// ---------------------------------------------------------------------------

export interface ManualTypeDefinition {
  id: string;
  label: string;
  cfrParts: string[];
  refDocType: string;
}

export const MANUAL_TYPES: ManualTypeDefinition[] = [
  { id: 'part-145-manual', label: 'Part 145 Repair Station Manual', cfrParts: ['145', '43'], refDocType: 'part-145-manual' },
  { id: 'gmm', label: 'General Maintenance Manual (GMM)', cfrParts: ['145', '43'], refDocType: 'gmm' },
  { id: 'qcm', label: 'Quality Control Manual (QCM)', cfrParts: ['145'], refDocType: 'qcm' },
  { id: 'training-program', label: 'Training Program Manual', cfrParts: ['145'], refDocType: 'training-program' },
  { id: 'part-135-manual', label: 'Part 135 Operations Manual', cfrParts: ['135', '91'], refDocType: 'part-135-manual' },
  { id: 'sms-manual', label: 'SMS Manual', cfrParts: ['5', '119'], refDocType: 'sms-manual' },
  { id: 'ops-specs', label: 'Operations Specifications', cfrParts: ['119', '135'], refDocType: 'ops-specs' },
  { id: 'ipm', label: 'Inspection Procedures Manual (IPM)', cfrParts: ['145', '43'], refDocType: 'ipm' },
  { id: 'hazmat-manual', label: 'Hazmat Training Manual', cfrParts: ['121'], refDocType: 'hazmat-manual' },
  { id: 'tool-calibration', label: 'Tool Calibration Manual', cfrParts: ['145'], refDocType: 'tool-calibration' },
];

// ---------------------------------------------------------------------------
// Writing style registry
// ---------------------------------------------------------------------------

export type WritingStyle = 'formal' | 'professional' | 'semi-formal' | 'accessible' | 'light';

export interface WritingStyleDefinition {
  id: WritingStyle;
  label: string;
  description: string;
}

export const WRITING_STYLES: WritingStyleDefinition[] = [
  {
    id: 'formal',
    label: 'Formal',
    description: 'Dense, authoritative regulatory prose. Third-person passive. Part 121-grade.',
  },
  {
    id: 'professional',
    label: 'Professional',
    description: 'Clear and direct. Active voice preferred. IS-BAO Stage 2 quality.',
  },
  {
    id: 'semi-formal',
    label: 'Semi-Formal',
    description: 'Readable and structured. Shorter paragraphs. NBAA / Wyvern appropriate.',
  },
  {
    id: 'accessible',
    label: 'Accessible',
    description: 'Plain language. Short sentences. Suited for technician-facing procedures.',
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Conversational structure. Internal guidance feel. Small MRO use.',
  },
];

export function buildStyleDirective(style: WritingStyle | undefined): string {
  switch (style) {
    case 'formal':
      return `WRITING STYLE — FORMAL:
Write in dense, authoritative regulatory prose. Use third-person passive construction where aviation convention demands ("shall be," "is required to," "must be maintained"). Sentence structures are complex; paragraphs are long. Every procedural requirement is stated as an absolute obligation. This is the standard expected in a Part 121 air carrier operations manual or a formal FAA-compliant repair station manual.`;

    case 'professional':
      return `WRITING STYLE — PROFESSIONAL:
Write in clear, direct regulatory language. Prefer active voice ("The Chief Inspector shall review") but use passive construction where aviation convention dictates. Paragraphs are moderate length. Requirements are stated precisely without excess legal hedging. This is appropriate for a well-regarded repair station or IS-BAO Stage 2 operator.`;

    case 'semi-formal':
      return `WRITING STYLE — SEMI-FORMAL:
Write in a structured but readable style. Use active voice throughout. Paragraphs are shorter; subheadings appear more frequently to aid navigation. Requirements are stated with precision but explained in plain terms where helpful. Suitable for IS-BAO, NBAA, and Wyvern-audited business aviation operations.`;

    case 'accessible':
      return `WRITING STYLE — ACCESSIBLE:
Write in plain language that a trained aviation technician or line pilot can read without legal training. Use short sentences and active voice. Avoid legal constructions. Procedures appear as numbered steps. Technical terms are defined inline or referenced to the Definitions section. This style is preferred for technician-facing sections and small repair stations.`;

    case 'light':
      return `WRITING STYLE — LIGHT:
Write conversationally but retain procedural structure. Sections feel like well-organized internal guidance rather than official regulation text. Use "we" where natural. Numbered lists are preferred over dense paragraphs. Suitable for small MROs, internal quality manuals, and first-draft content prior to formal review.`;

    default:
      return buildStyleDirective('formal');
  }
}

// ---------------------------------------------------------------------------
// Pre-generation interview helpers
// ---------------------------------------------------------------------------

export async function generateInterviewQuestions(
  manualType: ManualTypeDefinition,
  sectionTitle: string,
  sectionNumber: string | undefined,
  activeStandards: StandardDefinition[],
  companyName: string,
  assessmentSummary: string,
  model: string
): Promise<string[]> {
  const standardsList = activeStandards.map((s) => s.label).join(', ') || 'General';

  const params: ClaudeMessageParams = {
    model,
    max_tokens: 1024,
    temperature: 0.4,
    system: `You are an aviation compliance expert preparing to help draft a manual section.
Generate 3 to 5 targeted, practical questions that will collect organization-specific details needed to write a precise, non-generic section.

Rules:
- Questions must be answerable in 1-3 sentences by a maintenance manager or quality director
- Questions must be specific to the section topic — not generic aviation questions
- Each question should uncover a detail that varies between organizations (names, numbers, frequencies, equipment, procedures)
- Do NOT ask about regulatory requirements — those are already known
- Return ONLY a JSON array of question strings, no explanation, no markdown fences`,
    messages: [
      {
        role: 'user',
        content: `Manual type: ${manualType.label}
Section: "${sectionTitle}"${sectionNumber ? ` (${sectionNumber})` : ''}
Standards: ${standardsList}
Company: ${companyName}
Assessment context: ${assessmentSummary.slice(0, 1000)}

Generate the questions now.`,
      },
    ],
  };

  const response = await createClaudeMessage(params);
  const text =
    response.content
      ?.filter((b) => b.type === 'text' && b.text)
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('') ?? '[]';

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.filter((q): q is string => typeof q === 'string').slice(0, 5);
    }
  } catch {
    // fall through to static fallbacks
  }

  return getStaticInterviewQuestions(sectionTitle, manualType.id);
}

export function getStaticInterviewQuestions(sectionTitle: string, _manualTypeId: string): string[] {
  const lower = sectionTitle.toLowerCase();

  if (lower.includes('training')) {
    return [
      'Who is responsible for administering your training program (name and title)?',
      'What is the duration of initial training for new technicians (in hours)?',
      'What recurrent training interval do you use (e.g., annually, every 24 months)?',
      'Do you use a third-party training provider, in-house instruction, or both?',
    ];
  }
  if (lower.includes('inspection') || lower.includes('quality')) {
    return [
      'Who is your Chief Inspector or Quality Manager (name and title)?',
      'What is your inspection sampling rate or interval for in-process checks?',
      'List any specific inspection forms or checklists currently in use.',
      'Do you use a computerized maintenance management system (CMMS)? If so, which one?',
    ];
  }
  if (lower.includes('recordkeeping') || lower.includes('records')) {
    return [
      'How long do you retain completed work order records (years)?',
      'Are records stored physically, electronically, or both?',
      'Who is the designated records custodian (title)?',
      'What system do you use to track part traceability documentation?',
    ];
  }
  if (lower.includes('housing') || lower.includes('facilities')) {
    return [
      'Where is your facility located (city, state, airport identifier if applicable)?',
      'What is the approximate square footage of your maintenance workspace?',
      'Do you have dedicated areas for avionics, engine run-up, or other specialized work?',
      'Are any maintenance activities conducted off-site or at customer locations?',
    ];
  }
  if (lower.includes('personnel') || lower.includes('staffing')) {
    return [
      'How many FAA-certificated technicians (A&P, IA) are currently employed?',
      'What is the name and certificate number of your Accountable Manager or Director of Maintenance?',
      'Do you employ any OJT or apprentice technicians? If so, how many?',
    ];
  }
  if (lower.includes('calibration') || lower.includes('tool')) {
    return [
      'What calibration interval do you use for precision measurement tools (e.g., 12 months)?',
      'Which tools in your inventory require calibration certification?',
      'Do you use an in-house calibration lab or a third-party calibration service?',
    ];
  }

  return [
    "What is your organization's name and certificate number (if applicable)?",
    'Who is the manager responsible for this area (name and title)?',
    'Describe any specific procedures or equipment unique to your operation relevant to this section.',
    'What is your facility location and primary scope of maintenance work?',
  ];
}

// ---------------------------------------------------------------------------
// Section templates per manual type + standard
// ---------------------------------------------------------------------------

const BASE_SECTIONS: Record<string, Array<{ title: string; number?: string }>> = {
  'part-145-manual': [
    { title: 'Housing and Facilities', number: '145.103' },
    { title: 'Personnel Requirements', number: '145.151' },
    { title: 'Supervisory and Inspection Personnel', number: '145.153' },
    { title: 'Training Requirements', number: '145.163' },
    { title: 'Privileges and Limitations', number: '145.201' },
    { title: 'Repair Station Manual', number: '145.207' },
    { title: 'Quality Control System', number: '145.211' },
    { title: 'Inspection of Maintenance, Preventive Maintenance, and Alterations', number: '145.213' },
    { title: 'Capability List', number: '145.215' },
    { title: 'Contract Maintenance', number: '145.217' },
    { title: 'Recordkeeping', number: '145.219' },
    { title: 'Service Difficulty Reports', number: '145.221' },
  ],
  'gmm': [
    { title: 'General Policies and Procedures' },
    { title: 'Maintenance Program', number: '145.201' },
    { title: 'Inspection Procedures', number: '145.213' },
    { title: 'Parts and Materials Control' },
    { title: 'Tool and Equipment Control' },
    { title: 'Technical Data and Publications' },
    { title: 'Work Order Management' },
    { title: 'Return-to-Service Procedures', number: '43.9' },
  ],
  'qcm': [
    { title: 'Quality Control System Overview', number: '145.211' },
    { title: 'Preliminary Inspection Procedures' },
    { title: 'In-Process Inspection Procedures' },
    { title: 'Final Inspection and Return-to-Service' },
    { title: 'Calibration and Measurement Control' },
    { title: 'Nonconformance and Corrective Action' },
    { title: 'Audit and Self-Assessment Program' },
  ],
  'training-program': [
    { title: 'Training Program Administration', number: '145.163' },
    { title: 'Initial Training' },
    { title: 'Recurrent Training' },
    { title: 'On-the-Job Training (OJT)' },
    { title: 'Authorization and Qualification Records' },
    { title: 'Competency Assessment' },
  ],
  'part-135-manual': [
    { title: 'General Operations' },
    { title: 'Flight Operations', number: '135.243' },
    { title: 'Maintenance Program', number: '135.411' },
    { title: 'Aircraft Requirements', number: '135.25' },
    { title: 'Crew Training', number: '135.341' },
    { title: 'Instrument and Equipment Requirements', number: '135.149' },
  ],
  'sms-manual': [
    { title: 'Safety Policy and Objectives' },
    { title: 'Safety Risk Management' },
    { title: 'Safety Assurance' },
    { title: 'Safety Promotion' },
    { title: 'SPI/SPT Tables' },
    { title: 'Hazard Register' },
    { title: 'Emergency Response Plan' },
  ],
  'ops-specs': [
    { title: 'General Authority' },
    { title: 'Aircraft Authorizations' },
    { title: 'Operational Limitations' },
    { title: 'Maintenance Authorizations' },
  ],
  'ipm': [
    { title: 'Inspection Program Overview' },
    { title: 'Inspection Procedures by Work Type' },
    { title: 'Calibration Requirements' },
    { title: 'Records and Documentation' },
  ],
  'hazmat-manual': [
    { title: 'Hazmat Handling Procedures' },
    { title: 'Training Requirements' },
    { title: 'Emergency Procedures' },
  ],
  'tool-calibration': [
    { title: 'Calibration Program Overview' },
    { title: 'Calibration Intervals and Procedures' },
    { title: 'Out-of-Tolerance Procedures' },
    { title: 'Records and Traceability' },
  ],
};

const STANDARD_SECTIONS: Record<string, Array<{ title: string; number?: string }>> = {
  isbao: [
    { title: 'IS-BAO SMS Requirements', number: 'IS-BAO §3' },
    { title: 'Maintenance and Airworthiness', number: 'IS-BAO §5' },
    { title: 'Approved Maintenance Organization', number: 'IS-BAO §5.3' },
  ],
  as9100: [
    { title: 'AS9110 Operational Planning', number: 'AS9110 8.1' },
    { title: 'AS9110 Production and Service Provision', number: 'AS9110 8.5' },
    { title: 'AS9110 Release of Products and Services', number: 'AS9110 8.6' },
    { title: 'AS9100D Risk-Based Thinking', number: 'AS9100D 6.1' },
    { title: 'AS9100D Performance Evaluation', number: 'AS9100D 9' },
  ],
  wyvern: [
    { title: 'Vendor Qualification Program' },
    { title: 'Parts Traceability and Documentation' },
    { title: 'Technician Training Currency' },
    { title: 'Tool Calibration and Equipment' },
  ],
  sms: [
    { title: 'ICAO Safety Policy and Objectives', number: 'ICAO Pillar 1' },
    { title: 'ICAO Safety Risk Management', number: 'ICAO Pillar 2' },
    { title: 'ICAO Safety Assurance', number: 'ICAO Pillar 3' },
    { title: 'ICAO Safety Promotion', number: 'ICAO Pillar 4' },
  ],
  easa: [
    { title: 'EASA Maintenance Organisation Exposition (MOE)', number: 'AMC 145.A.70' },
    { title: 'EASA Certifying Staff', number: 'EASA 145.A.30' },
    { title: 'EASA Quality System', number: 'EASA 145.A.65' },
  ],
  nasa: [
    { title: 'NASA Workmanship Standards', number: 'NASA-STD-8739' },
    { title: 'NASA Safety Reporting' },
  ],
  nbaa: [
    { title: 'NBAA Business Aviation Safety Criteria' },
    { title: 'NBAA Maintenance Best Practices' },
  ],
  'faa-sas': [
    { title: 'DCT — Management Responsibility', number: 'SAS Safety Attribute 1' },
    { title: 'DCT — Management Authority', number: 'SAS Safety Attribute 2' },
    { title: 'DCT — Procedures', number: 'SAS Safety Attribute 3' },
    { title: 'DCT — Controls (Design DCTs)', number: 'SAS Safety Attribute 4' },
    { title: 'DCT — Process Measurement (Design DCTs)', number: 'SAS Safety Attribute 5' },
    { title: 'DCT — Interfaces', number: 'SAS Safety Attribute 6' },
    { title: 'DCT — Safety Ownership', number: 'SAS Safety Attribute 7' },
    { title: 'DCT — Safety Risk Management (SRM)', number: 'SAS 4.6 SMS' },
    { title: 'DCT — Safety Assurance (SA)', number: 'SAS 4.6 SMS' },
  ],
};

export function getSectionTemplates(
  manualType: string,
  activeStandards: string[]
): Array<{ title: string; number?: string }> {
  const base = BASE_SECTIONS[manualType] ?? [];
  const extras = activeStandards.flatMap((s) => STANDARD_SECTIONS[s] ?? []);
  return [...base, ...extras];
}

// ---------------------------------------------------------------------------
// eCFR fetch helper (reuses /api/ecfr proxy)
// ---------------------------------------------------------------------------

export async function fetchCfrText(citation: string): Promise<string> {
  try {
    const isSection = /\d+\.\d/.test(citation);
    const param = isSection
      ? `section=${encodeURIComponent(citation)}`
      : `part=${encodeURIComponent(citation)}`;
    const res = await fetch(`/api/ecfr?${param}`);
    const data = await res.json();
    if (!res.ok || data.error) return '';
    return `--- ${data.citation} (eCFR.gov ${data.fetchedAt?.slice(0, 10)}) ---\n${data.text}`;
  } catch {
    return '';
  }
}

export async function fetchCfrForManualType(manualType: string): Promise<string> {
  const mt = MANUAL_TYPES.find((m) => m.id === manualType);
  if (!mt) return '';
  const chunks = await Promise.all(mt.cfrParts.map((p) => fetchCfrText(p)));
  return chunks.filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export interface ManualWriterContext {
  manualType: ManualTypeDefinition;
  sectionTitle: string;
  sectionNumber?: string;
  activeStandards: StandardDefinition[];
  cfrText: string;
  referenceDocText: string;
  standardsKbText: string;
  auditIntelligenceMemory: string;
  approvedPriorSections: string;
  paperworkReviewFindings: string;
  assessmentSummary: string;
  activeCars: string;
  sourceDocumentText: string;
  companyName: string;
  /** When true, the AI rewrites the existing sourceDocumentText section rather than authoring from scratch. */
  rewriteMode?: boolean;
  /** Pre-formatted list of non-conformances to address, assembled from imported audit results. */
  nonConformancesToAddress?: string;
  /** When true (and rewriteMode), the AI first self-identifies gaps before rewriting (no imported findings required). */
  autoAnalyzeMode?: boolean;
  /** Writing style / tone to apply. Defaults to 'formal' when absent. */
  writingStyle?: WritingStyle;
  /** When false, citation markers (§ references) are omitted from generated text. Defaults to true. */
  citationsEnabled?: boolean;
  /** Formatted Q&A block from the pre-generation interview, injected into the prompt for specificity. */
  interviewAnswers?: string;
}

export function buildManualWriterSystemPrompt(ctx: ManualWriterContext): string {
  const standardsList = ctx.activeStandards.map((s) => s.label).join(', ') || 'General';
  const citationExamples = ctx.activeStandards.map((s) => s.citationStyle).join(', ');
  const citationChecklist = ctx.activeStandards.length > 0
    ? ctx.activeStandards.map((s) => `- ${s.label}: use inline format like ${s.citationStyle}`).join('\n')
    : '- Use explicit inline citations for each requirement.';

  const showCitations = ctx.citationsEnabled !== false; // true unless explicitly disabled

  const sections: string[] = [];

  if (ctx.rewriteMode) {
    const analyzeInstruction = ctx.autoAnalyzeMode
      ? '\n- STEP 1: Analyze the existing section content and identify every regulatory gap, ambiguity, and non-conformance\n- STEP 2: Rewrite the section to correct every identified deficiency'
      : '';

    sections.push(`You are an expert aviation compliance manual author performing a compliance remediation rewrite for ${ctx.companyName}'s ${ctx.manualType.label}.

SECTION TO REWRITE: "${ctx.sectionTitle}"${ctx.sectionNumber ? ` (${ctx.sectionNumber})` : ''}
ACTIVE STANDARDS: ${standardsList}

YOUR DIRECTIVES:
- You are NOT writing from scratch — you are rewriting the existing non-conforming section provided below to achieve full compliance${analyzeInstruction}
- Preserve all compliant content and the organization's voice; correct only what is deficient
- Address every identified non-conformance listed below — each one must be resolved in the rewritten text
${showCitations ? `- Cite every requirement inline using the correct citation style for each standard (e.g. ${citationExamples || '§145.211(a)(1)'})` : '- Do NOT include inline citation markers (§ references) — write in plain procedural language; regulatory accuracy is still required'}
- Where multiple standards address the same requirement, note convergence briefly; where one standard adds requirements beyond others, explicitly address the additional items
- Use numbered paragraphs, sub-paragraphs, and lettered lists consistent with aviation manual conventions
- Be thorough and specific — vague language is a finding in every audit
- Do NOT include metadata, headers like "Generated by AI", or commentary — output only the rewritten manual section text
- Do NOT use markdown formatting — write in plain manual-style prose with numbered sections
- OUTPUT FORMAT CONTRACT:
  1) Section heading line with title (and section number if provided)
  2) Numbered policy/procedure paragraphs
  3) Explicit role/accountability statements
  4) Verification/records requirements`);
  } else {
    sections.push(`You are an expert aviation compliance manual author writing a section for ${ctx.companyName}'s ${ctx.manualType.label}.

SECTION TO WRITE: "${ctx.sectionTitle}"${ctx.sectionNumber ? ` (${ctx.sectionNumber})` : ''}
ACTIVE STANDARDS: ${standardsList}

YOUR DIRECTIVES:
- Produce a single, integrated manual section that simultaneously satisfies ALL active standards
- This will be placed directly into the organization's operational manual
${showCitations ? `- Cite every requirement inline using the correct citation style for each standard (e.g. ${citationExamples || '§145.211(a)(1)'})` : '- Do NOT include inline citation markers (§ references) — write in plain procedural language; regulatory accuracy is still required'}
- Where multiple standards address the same requirement, note convergence briefly; where one standard adds requirements beyond others, explicitly address the additional items
- Use numbered paragraphs, sub-paragraphs, and lettered lists consistent with aviation manual conventions
- Be thorough and specific — vague language is a finding in every audit
- Do NOT include metadata, headers like "Generated by AI", or commentary — output only the manual section text
- Do NOT use markdown formatting — write in plain manual-style prose with numbered sections
- OUTPUT FORMAT CONTRACT:
  1) Section heading line with title (and section number if provided)
  2) Numbered policy/procedure paragraphs
  3) Explicit role/accountability statements
  4) Verification/records requirements`);
  }

  // Inject writing style directive
  sections.push(buildStyleDirective(ctx.writingStyle));

  if (showCitations) {
    sections.push(`CITATION COVERAGE CHECKLIST (all must be satisfied):
${citationChecklist}
- Every major requirement statement must include at least one citation.
- Avoid citation-only paragraphs; pair citation with actionable procedural text.`);
  } else {
    sections.push(`CITATION STYLE — CITATIONS DISABLED:
Do NOT include inline citation markers (§145.211, IS-BAO §, AS9100D Clause, etc.) anywhere in the output. Write all requirements in plain procedural language. Regulatory accuracy is still required — ensure every requirement is substantively correct — but citation markers are omitted from the output text.`);
  }

  // Inject pre-generation interview answers if provided
  if (ctx.interviewAnswers) {
    sections.push(`ORGANIZATION-SPECIFIC CONTEXT — ANSWERS PROVIDED BY THE USER:
The user answered targeted questions about this section before generation. Use these answers to customize the output with organization-specific details:
${ctx.interviewAnswers}
Incorporate all details above into the section. Do not use generic placeholder language (e.g., "[Organization Name]", "[insert name here]") where a specific answer was given.`);
  }

  // In rewrite mode, the non-conforming section content comes first so the AI sees the subject before the references.
  if (ctx.rewriteMode && ctx.sourceDocumentText) {
    sections.push(`NON-CONFORMING SECTION CONTENT (this is the existing text you are rewriting — correct every deficiency):
${truncate(ctx.sourceDocumentText, 14000)}`);
  }

  if (ctx.rewriteMode && ctx.nonConformancesToAddress) {
    sections.push(`IDENTIFIED NON-CONFORMANCES — address every item listed below in the rewritten section:
${truncate(ctx.nonConformancesToAddress, 8000)}`);
  }

  if (!ctx.rewriteMode && ctx.sourceDocumentText) {
    sections.push(`CURRENT SOURCE DOCUMENT (existing text being improved — preserve valid content, fix deficiencies):
${truncate(ctx.sourceDocumentText, 12000)}`);
  }

  if (ctx.cfrText) {
    sections.push(`REGULATORY TEXT (live from eCFR.gov — authoritative language to cite):
${truncate(ctx.cfrText, 25000)}`);
  }

  if (ctx.standardsKbText) {
    sections.push(`STANDARDS KNOWLEDGE BASE DOCUMENTS (cite from these for non-CFR standards):
${truncate(ctx.standardsKbText, 20000)}`);
  }

  if (ctx.referenceDocText) {
    sections.push(`KNOWN-GOOD REFERENCE MANUAL (mirror this structure and level of detail):
${truncate(ctx.referenceDocText, 15000)}`);
  }

  if (ctx.auditIntelligenceMemory) {
    sections.push(`HISTORICAL AUDIT FAILURE PATTERNS (write to proactively prevent these):
${truncate(ctx.auditIntelligenceMemory, 6000)}`);
  }

  if (ctx.approvedPriorSections) {
    sections.push(`PREVIOUSLY APPROVED SECTIONS (match accepted language and structure):
${truncate(ctx.approvedPriorSections, 8000)}`);
  }

  if (ctx.paperworkReviewFindings && !ctx.rewriteMode) {
    sections.push(`PAPERWORK REVIEW FINDINGS FOR THIS ORGANIZATION (address every gap):
${truncate(ctx.paperworkReviewFindings, 5000)}`);
  }

  if (ctx.assessmentSummary) {
    sections.push(`ASSESSMENT DATA (organization context):
${truncate(ctx.assessmentSummary, 5000)}`);
  }

  if (ctx.activeCars && !ctx.rewriteMode) {
    sections.push(`ACTIVE CORRECTIVE ACTION REQUESTS (the manual section must address these open findings):
${ctx.activeCars}`);
  }

  const isSasDct = ctx.activeStandards.some((s) => s.id === 'faa-sas');
  if (isSasDct) {
    const dctAttribute = inferDctAttribute(ctx.sectionTitle);
    sections.push(`FAA SAS / DCT COMPLIANCE DIRECTIVES:
This section must satisfy FAA Safety Assurance System (SAS) Data Collection Tool (DCT) requirements. An Aviation Safety Inspector (ASI) will use a DCT to evaluate whether this documented system adequately addresses each Safety Attribute. Write accordingly:

APPLICABLE SAFETY ATTRIBUTE: ${dctAttribute}

MANDATORY STRUCTURE — for each Safety Attribute addressed, the prose must explicitly and verifiably demonstrate:
1. MANAGEMENT RESPONSIBILITY — Identify by title the manager or position responsible for this process. State their duty to ensure the process is designed, implemented, and performing as intended.
2. MANAGEMENT AUTHORITY — State the authority granted to that position to direct personnel, allocate resources, stop unsafe work, and enforce compliance with this process.
3. PROCEDURES — Describe the step-by-step documented procedures that govern this process. Reference the specific manual sections, forms, or work instructions by title and number.
4. CONTROLS — Identify the checks, barriers, and verification steps built into the process to prevent errors or non-conformances from reaching the next stage (applicable to Design DCTs).
5. PROCESS MEASUREMENT — State the metrics, performance indicators, or audit mechanisms used to measure whether this process is performing as designed (applicable to Design DCTs).
6. INTERFACES — Identify every internal department and external organization (contractors, suppliers, regulators) that this process interfaces with, and describe how information or work product is transferred across each interface.
7. SAFETY OWNERSHIP — State how personnel at every level accept responsibility for safety within this process, including how safety concerns are raised, tracked, and resolved without fear of reprisal.
8. SAFETY RISK MANAGEMENT (SRM) — Describe how hazards within this process are identified, analyzed, and mitigated before implementation or change. Reference the organization's SRM procedure. (SAS 4.6 SMS requirement.)
9. SAFETY ASSURANCE (SA) — Describe how the organization monitors this process after implementation to confirm mitigations remain effective and to detect new hazards. Reference safety performance indicators (SPIs) where applicable. (SAS 4.6 SMS requirement.)

DCT LANGUAGE STANDARD:
- Write each attribute as a discrete, numbered sub-section so an ASI can locate and evaluate each one independently.
- Use declarative statements that can be verified as "Yes" (compliant) by an ASI reading only this manual section.
- Avoid vague qualifiers ("as appropriate," "when necessary") — state explicit thresholds, titles, timeframes, and document references.
- Where SAS 4.6 removed Controls/Process Measurement from Performance DCTs and replaced them with SRM/SA questions, ensure the SRM and SA sub-sections are fully developed.`);
  }

  return sections.join('\n\n');
}

const DCT_ATTRIBUTE_MAP: Record<string, string> = {
  'management responsibility': 'Management Responsibility (Safety Attribute 1)',
  'management authority': 'Management Authority (Safety Attribute 2)',
  'procedures': 'Procedures (Safety Attribute 3)',
  'controls': 'Controls (Safety Attribute 4 — Design DCTs)',
  'process measurement': 'Process Measurement (Safety Attribute 5 — Design DCTs)',
  'interfaces': 'Interfaces (Safety Attribute 6)',
  'safety ownership': 'Safety Ownership (Safety Attribute 7)',
  'safety risk management': 'Safety Risk Management / SRM (SAS 4.6 SMS)',
  'safety assurance': 'Safety Assurance / SA (SAS 4.6 SMS)',
};

function inferDctAttribute(sectionTitle: string): string {
  const lower = sectionTitle.toLowerCase();
  for (const [keyword, label] of Object.entries(DCT_ATTRIBUTE_MAP)) {
    if (lower.includes(keyword)) return label;
  }
  return 'All Safety Attributes (comprehensive DCT coverage required)';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '\n[...truncated for prompt budget...]';
}

// ---------------------------------------------------------------------------
// Stream generation
// ---------------------------------------------------------------------------

export async function generateManualSection(
  systemPrompt: string,
  model: string,
  callbacks: ClaudeMessageStreamCallbacks = {},
  userMessage?: string
): Promise<string> {
  const params: ClaudeMessageParams = {
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userMessage ?? 'Write the complete manual section now. Follow all directives in the system prompt exactly.',
      },
    ],
    temperature: 0.3,
  };

  const response = await createClaudeMessageStream(params, callbacks);
  return (
    response.content
      ?.filter((b) => b.type === 'text' && b.text)
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('') ?? ''
  );
}

// ---------------------------------------------------------------------------
// Definitions auto-generation
// ---------------------------------------------------------------------------

export async function generateDefinitions(
  sectionTexts: string[],
  manualTypeLabel: string,
  model: string
): Promise<ManualDefinition[]> {
  const combined = sectionTexts.join('\n\n---\n\n');
  const capped = truncate(combined, 60000);

  const params: ClaudeMessageParams = {
    model,
    max_tokens: 4096,
    system: `You are an aviation compliance expert. Extract all aviation-specific terms, regulatory acronyms, technical abbreviations, and domain-specific definitions from the manual content below.

Return ONLY a valid JSON array where each element has "term" (string) and "definition" (string). Sort alphabetically by term.

Rules:
- Include regulatory references (e.g. CFR, FAR, AD, EASA Part-145)
- Include aviation acronyms (e.g. NDT, RTS, MEL, CDL, SRM, IPC, STC)
- Include organization-specific procedural terms used in the manual
- Definitions should be concise (1-2 sentences) and technically accurate
- Do NOT include generic English words unless they have a specific aviation meaning
- Do NOT wrap the JSON in markdown code fences

MANUAL TYPE: ${manualTypeLabel}`,
    messages: [
      {
        role: 'user',
        content: `Extract all definitions and abbreviations from this manual content:\n\n${capped}`,
      },
    ],
    temperature: 0.2,
  };

  const response = await createClaudeMessage(params);
  const text =
    response.content
      ?.filter((b) => b.type === 'text' && b.text)
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('') ?? '[]';

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((d: any) => typeof d.term === 'string' && typeof d.definition === 'string')
      .map((d: any) => ({ term: d.term.trim(), definition: d.definition.trim() }));
  } catch {
    return [];
  }
}
