import type { AssessmentData } from '../types/assessment';
import type { ClaudeMessageParams } from './claudeProxy';
import { createClaudeMessageStream, type ClaudeMessageStreamCallbacks } from './claudeProxy';

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
  { id: 'isbao', label: 'IS-BAO', agentKbId: 'isbao-auditor', citationStyle: 'IS-BAO §5.3.2' },
  { id: 'as9100', label: 'AS9100 / AS9110', agentKbId: 'as9100-auditor', citationStyle: 'AS9100D Clause 8.5.1' },
  { id: 'wyvern', label: 'ARGUS / Wyvern', agentKbId: 'safety-auditor', citationStyle: 'Wyvern PASS Item X' },
  { id: 'sms', label: 'SMS / ICAO', agentKbId: 'sms-consultant', citationStyle: 'ICAO Doc 9859 Pillar 2' },
  { id: 'easa', label: 'EASA', agentKbId: 'easa-inspector', citationStyle: 'EASA Part-145 AMC 145.A.70' },
  { id: 'nasa', label: 'NASA', agentKbId: 'as9100-auditor', citationStyle: 'NASA-STD-8739.4' },
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
}

export function buildManualWriterSystemPrompt(ctx: ManualWriterContext): string {
  const standardsList = ctx.activeStandards.map((s) => s.label).join(', ') || 'General';
  const citationExamples = ctx.activeStandards.map((s) => s.citationStyle).join(', ');

  const sections: string[] = [];

  sections.push(`You are an expert aviation compliance manual author writing a section for ${ctx.companyName}'s ${ctx.manualType.label}.

SECTION TO WRITE: "${ctx.sectionTitle}"${ctx.sectionNumber ? ` (${ctx.sectionNumber})` : ''}
ACTIVE STANDARDS: ${standardsList}

YOUR DIRECTIVES:
- Produce a single, integrated manual section that simultaneously satisfies ALL active standards
- Write in formal manual prose — this will be placed directly into the organization's operational manual
- Cite every requirement inline using the correct citation style for each standard (e.g. ${citationExamples || '§145.211(a)(1)'})
- Where multiple standards address the same requirement, note convergence briefly; where one standard adds requirements beyond others, explicitly address the additional items
- Use numbered paragraphs, sub-paragraphs, and lettered lists consistent with aviation manual conventions
- Be thorough and specific — vague language is a finding in every audit
- Do NOT include metadata, headers like "Generated by AI", or commentary — output only the manual section text
- Do NOT use markdown formatting — write in plain manual-style prose with numbered sections`);

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

  if (ctx.paperworkReviewFindings) {
    sections.push(`PAPERWORK REVIEW FINDINGS FOR THIS ORGANIZATION (address every gap):
${truncate(ctx.paperworkReviewFindings, 5000)}`);
  }

  if (ctx.assessmentSummary) {
    sections.push(`ASSESSMENT DATA (organization context):
${truncate(ctx.assessmentSummary, 5000)}`);
  }

  if (ctx.activeCars) {
    sections.push(`ACTIVE CORRECTIVE ACTION REQUESTS (the manual section must address these open findings):
${ctx.activeCars}`);
  }

  if (ctx.sourceDocumentText) {
    sections.push(`CURRENT SOURCE DOCUMENT (the existing text being improved — preserve valid content, fix deficiencies):
${truncate(ctx.sourceDocumentText, 12000)}`);
  }

  return sections.join('\n\n');
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
  callbacks: ClaudeMessageStreamCallbacks = {}
): Promise<string> {
  const params: ClaudeMessageParams = {
    model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: 'Write the complete manual section now. Follow all directives in the system prompt exactly.',
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
