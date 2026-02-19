import type { AssessmentData } from '../types/assessment';
import type { AuditAgent, AuditMessage, AuditDiscrepancy, ThinkingConfig, SelfReviewConfig, FAAConfig, AuditorQuestionAnswer, PaperworkReviewContext } from '../types/auditSimulation';
import type { AgentKnowledgeBases } from '../types/project';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import type { ClaudeMessageContent } from './claudeProxy';
import { createClaudeMessage } from './claudeProxy';

export type AttachedImage = { media_type: string; data: string };
import {
  FAA_PART_SCOPE_CONTENT,
  getInspectionTypeById,
  getSpecialtyById,
  DEFAULT_FAA_CONFIG,
} from '../data/faaInspectorTypes';

export const AUDIT_AGENTS: AuditAgent[] = [
  {
    id: 'faa-inspector',
    name: 'FAA Inspector',
    role: 'Federal Aviation Administration Principal Inspector',
    avatar: '🛡️',
    color: 'from-blue-500 to-blue-700',
  },
  {
    id: 'shop-owner',
    name: 'Shop Owner',
    role: 'Repair Station Certificate Holder / Accountable Manager',
    avatar: '🔧',
    color: 'from-amber-500 to-amber-700',
  },
  {
    id: 'audited-entity',
    name: 'Audited Entity',
    role: 'Organization under audit (assessment & entity documents)',
    avatar: '🏢',
    color: 'from-slate-500 to-slate-700',
  },
  {
    id: 'isbao-auditor',
    name: 'IS-BAO Auditor',
    role: 'International Standard for Business Aircraft Operations Auditor',
    avatar: '🌐',
    color: 'from-emerald-500 to-emerald-700',
  },
  {
    id: 'easa-inspector',
    name: 'EASA Inspector',
    role: 'European Aviation Safety Agency Part-145 Inspector',
    avatar: '🇪🇺',
    color: 'from-indigo-500 to-indigo-700',
  },
  {
    id: 'as9100-auditor',
    name: 'AS9100 Auditor',
    role: 'Aerospace Quality Management System Lead Auditor',
    avatar: '📋',
    color: 'from-violet-500 to-violet-700',
  },
  {
    id: 'sms-consultant',
    name: 'SMS Consultant',
    role: 'Safety Management System Implementation Specialist',
    avatar: '📊',
    color: 'from-teal-500 to-teal-700',
  },
  {
    id: 'safety-auditor',
    name: 'Third-Party Safety Auditor',
    role: 'ARGUS / Wyvern Third-Party Safety Auditor',
    avatar: '🔍',
    color: 'from-rose-500 to-rose-700',
  },
];

const MAX_CHARS_PER_DOC = 18000;

function buildDocumentContentSection(uploadedDocuments: Array<{ name: string; text: string }>): string {
  const docsWithText = uploadedDocuments.filter((d) => d.text.length > 0);
  if (docsWithText.length === 0) return '';
  const sections = docsWithText.map(
    (d) => `## ${d.name}\n${d.text.substring(0, MAX_CHARS_PER_DOC)}`
  );
  return `\n\n# DOCUMENTS PROVIDED BY THE AUDIT HOST\nThe following documents have been provided during the audit for review. Reference them when relevant.\n\n${sections.join('\n\n')}`;
}

function buildPaperworkReviewSection(reviews: PaperworkReviewContext[]): string {
  if (reviews.length === 0) return '';
  const sections = reviews.map((r, i) => {
    const findingsText = r.findings.length > 0
      ? r.findings.map((f, j) => `  ${j + 1}. [${f.severity.toUpperCase()}]${f.location ? ` (${f.location})` : ''} ${f.description}`).join('\n')
      : '  No findings recorded.';
    return [
      `## Review ${i + 1}: ${r.documentUnderReview}`,
      `- **Compared against:** ${r.referenceDocuments.join(', ') || 'Unknown reference'}`,
      `- **Verdict:** ${r.verdict.toUpperCase()}`,
      r.reviewScope ? `- **Scope:** ${r.reviewScope}` : '',
      r.completedAt ? `- **Completed:** ${r.completedAt}` : '',
      `- **Findings:**`,
      findingsText,
      r.notes ? `- **Reviewer notes:** ${r.notes}` : '',
    ].filter(Boolean).join('\n');
  });
  return `\n\n# COMPLETED PAPERWORK REVIEWS\nThe following paperwork reviews have been completed for this project. Each review compares a document under review against one or more reference standards. Use these findings as input — reference them when discussing compliance gaps, validate them with your own expertise, and incorporate them into your audit observations.\n\n${sections.join('\n\n')}`;
}

const QUESTION_FOR_HOST_INSTRUCTION = `

# ASKING THE AUDIT HOST
If you need to ask the audit host (the person running the simulation) a clarifying question — for example to request a document, confirm a fact, or get a yes/no — end your response with exactly one line in this format:
[QUESTION_FOR_HOST: your question here]
Keep your main response above this line. Use this only when you genuinely need input from the host to proceed.`;

const NO_ROLEPLAY_INSTRUCTION = `

# RESPONSE STYLE — NO ROLEPLAY OR NARRATIVE
- Output only what your role would say: findings, questions, answers, and recommendations. Do NOT describe physical actions or stage directions (e.g. "stands up", "nods", "looks at the document", "the inspector walks to the whiteboard").
- Do NOT use narrative or *asterisk* stage directions. The user does not need to be told that actions are happening — just state the substance (what is said or decided).`;

/** Build a section that constrains the model to only the participants actually in this audit (prevents hallucinating other inspectors/auditors). */
function buildParticipantsInAuditSection(participantAgentIds: AuditAgent['id'][]): string {
  const names = participantAgentIds
    .map((id) => AUDIT_AGENTS.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) return '';
  const list = names.join(', ');
  return `

# PARTICIPANTS IN THIS AUDIT (CRITICAL)
Only the following participants are in this audit: ${list}.
- Speak ONLY as your own role. Do NOT speak as, quote, or attribute statements to any other person or role.
- Do NOT introduce or reference an FAA Inspector, EASA Inspector, or any other auditor/inspector who is not in the list above. If they are not listed, they are not in the room.
- Address only the participants listed above. Do not say things like "as the FAA might say" or "the FAA inspector would note" unless "FAA Inspector" is in the list above.`;
}

function buildRegulatoryEntitySection(
  docs: Array<{ name: string; text?: string }>,
  title: string
): string {
  const withText = docs.filter((d) => d.text && d.text.length > 0);
  if (withText.length === 0) return '';
  const sections = withText.map(
    (d) => `## ${d.name}\n${(d.text || '').substring(0, MAX_CHARS_PER_DOC)}`
  );
  return `\n\n# ${title}\nReference these documents when citing requirements.\n\n${sections.join('\n\n')}`;
}

export type RegulatoryEntityDoc = { name: string; text?: string };

/** Minimal assessment used when no assessment is selected for simulation. */
export function getMinimalAssessmentData(): AssessmentData {
  return {
    companyName: 'Organization',
    location: '',
    employeeCount: '',
    annualRevenue: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    certifications: [],
    as9100Rev: '',
    argusLevel: '',
    aircraftCategories: [],
    specificAircraftTypes: '',
    servicesOffered: [],
    operationsScope: '',
    oemAuthorizations: [],
    specialCapabilities: [],
    maintenanceTrackingSoftware: '',
    softwareSatisfaction: '',
    hasDefinedProcess: '',
    processDocumented: '',
    processFollowed: '',
    processEffectiveness: '',
    partsInventoryMethod: '',
    partsTrackingSystem: '',
    inventoryAccuracy: '',
    shelfLifeTracking: '',
    qualityMethodologies: [],
    continuousImprovementActive: '',
    toolControlMethod: '',
    toolControlDescription: '',
    toolControlErrors: '',
    toolControlErrorFrequency: '',
    hasSMS: '',
    smsProgram: '',
    smsMaturity: '',
    challenges: [],
    trainingProgramType: '',
    trainingTracking: '',
    initialTrainingDuration: '',
    recurrentTrainingFrequency: '',
    competencyVerification: '',
    timeToCompetency: '',
    calibrationProgram: '',
    calibrationTracking: '',
    overdueCalibrations: '',
    outOfToleranceFrequency: '',
    outOfToleranceResponse: '',
    capaSystemStatus: '',
    discrepancyTracking: '',
    capaClosureTime: '',
    repeatDiscrepancies: '',
    capaAuthority: '',
    lastFAASurveillance: '',
    auditFindingsCount: '',
    findingSeverity: '',
    recurringFindings: '',
    findingClosureStatus: '',
    certificateActions: [],
    workOrderSystem: '',
    scheduleAdherence: '',
    productionBottlenecks: [],
    wipVisibility: '',
    routineInspectionDays: '',
    typicalRepairDays: '',
    majorOverhaulDays: '',
    capacityUtilization: '',
    productionPlanning: '',
    firstPassRate: '',
    warrantyRate: '',
    repeatMaintenanceRate: '',
    jobMargin: '',
    revenuePerTech: '',
    scrapReworkCost: '',
    partsWaitDays: '',
    inspectionWaitHours: '',
    approvalTurnaroundDays: '',
    auditHistory: '',
    turnoverRate: '',
    reworkRate: '',
    upcomingAudits: '',
    specificConcerns: '',
  };
}

function buildFAASystemPrompt(
  assessment: AssessmentData,
  regulatoryDocs: RegulatoryEntityDoc[],
  entityDocs: RegulatoryEntityDoc[],
  smsDocs: RegulatoryEntityDoc[],
  faaConfig?: FAAConfig | null
): string {
  const regContent = buildRegulatoryEntitySection(regulatoryDocs, 'FAA REGULATORY DOCUMENT CONTENT (your only source for citing requirements)');
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (organization under audit)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA (organization under audit)');

  const config = faaConfig && faaConfig.partsScope?.length ? faaConfig : null;

  if (!config) {
    // Backwards compat: generic FAA prompt
    return `You are an FAA Principal Inspector conducting a surveillance audit of "${assessment.companyName}". You are thorough, formal, and regulation-focused.

# YOUR IDENTITY & AUTHORITY
- FAA Principal Inspector assigned to this repair station
- You enforce 14 CFR Part 145 (Repair Stations), Part 43 (Maintenance, Preventive Maintenance, Rebuilding, and Alteration), and Part 121/135 as applicable
- You reference Advisory Circulars (AC 145-9, AC 43-9C, etc.) and FAA Order 8900.1
- You have the authority to issue findings, require corrective action, or recommend certificate action

# YOUR REGULATORY FRAMEWORK (Key Areas)
- 14 CFR 145.151 — Personnel requirements
- 14 CFR 145.153 — Supervisory personnel requirements
- 14 CFR 145.155 — Inspection personnel requirements
- 14 CFR 145.157 — Repairman certificate holders
- 14 CFR 145.159 — Reputation requirements
- 14 CFR 145.161 — Training requirements
- 14 CFR 145.163 — Training program
- 14 CFR 145.201 — Privileges and limitations
- 14 CFR 145.205 — Maintenance, preventive maintenance, and alterations performed for certificate holders
- 14 CFR 145.207 — Repair station manual
- 14 CFR 145.209 — Repair station manual contents
- 14 CFR 145.211 — Quality control system
- 14 CFR 145.213 — Performance standards (tools, equipment, materials)
- 14 CFR 145.215 — Capability list
- 14 CFR 145.217 — Contract maintenance
- 14 CFR 145.219 — Recordkeeping
- 14 CFR 145.221 — Service difficulty reports
- 14 CFR Part 43 — Maintenance records, return-to-service

# ASSESSMENT DATA FOR THIS SHOP
${JSON.stringify(assessment, null, 2)}

# REGULATORY DOCUMENTS ON FILE
${regulatoryDocs.map(d => `- ${d.name}`).join('\n')}

# ENTITY DOCUMENTS ON FILE
${entityDocs.map(d => `- ${d.name}`).join('\n')}
${regContent}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Open with specific regulatory concerns based on the assessment data
- Cite specific CFR sections when raising findings
- Be professional but firm — you are protecting safety
- Ask pointed questions about compliance gaps you see in the data
- Challenge vague or incomplete answers from the shop owner
- Acknowledge good practices when you see them
- Keep responses focused and conversational (2-4 paragraphs max)
- Cite only the FAA regulatory documents in the section above when stating requirements; do not cite IS-BAO, EASA, or other standards
- You are speaking directly to the shop owner and other auditors in an audit setting`;
  }

  const partsScope = config.partsScope.length ? config.partsScope : DEFAULT_FAA_CONFIG.partsScope;
  const scopeLabels = partsScope.map((p) => FAA_PART_SCOPE_CONTENT[p].label).join(' and ');
  const scopeLine = `Your scope for this audit includes ${scopeLabels}. Focus your questions and findings on these regulations.`;

  const regulationsByPart = partsScope.map(
    (p) => `## ${FAA_PART_SCOPE_CONTENT[p].label}\n${FAA_PART_SCOPE_CONTENT[p].regulations.map((r) => `- ${r}`).join('\n')}`
  );
  const focusByPart = partsScope.map(
    (p) => `## ${FAA_PART_SCOPE_CONTENT[p].label}\n${FAA_PART_SCOPE_CONTENT[p].focusAreas.map((f) => `- ${f}`).join('\n')}`
  );

  const specialty = getSpecialtyById(config.specialtyId);
  const inspectionType = getInspectionTypeById(config.specialtyId, config.inspectionTypeId);
  const inspectionName = inspectionType?.name ?? 'Surveillance';
  const inspectionRegs = inspectionType?.regulations?.map((r) => `- ${r}`).join('\n') ?? '';
  const inspectionFocus = inspectionType?.focusAreas?.map((f) => `- ${f}`).join('\n') ?? '';

  return `You are an FAA Aviation Safety Inspector (ASI) conducting an audit of "${assessment.companyName}". You are thorough, formal, and regulation-focused.

# YOUR IDENTITY & AUTHORITY
- FAA ${specialty?.name ?? 'Principal'} Inspector conducting this audit
- ${scopeLine}
- You have the authority to issue findings, require corrective action, or recommend certificate action
- You reference Advisory Circulars and FAA Order 8900.1 as applicable

# INSPECTION TYPE
You are conducting: **${inspectionName}**.
${inspectionType?.description ? `\n${inspectionType.description}\n` : ''}
${inspectionRegs ? `\nKey regulations for this inspection:\n${inspectionRegs}\n` : ''}
${inspectionFocus ? `\nFocus areas:\n${inspectionFocus}\n` : ''}

# REGULATORY FRAMEWORK BY PART (Your Scope)
${regulationsByPart.join('\n\n')}

# FOCUS AREAS BY PART
${focusByPart.join('\n\n')}

# ASSESSMENT DATA FOR THIS ENTITY
${JSON.stringify(assessment, null, 2)}

# REGULATORY DOCUMENTS ON FILE
${regulatoryDocs.map(d => `- ${d.name}`).join('\n')}

# ENTITY DOCUMENTS ON FILE
${entityDocs.map(d => `- ${d.name}`).join('\n')}
${regContent}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Open with specific regulatory concerns based on the assessment data and your inspection type
- Cite specific CFR sections when raising findings
- Be professional but firm — you are protecting safety
- Ask pointed questions about compliance gaps you see in the data
- Challenge vague or incomplete answers from the certificate holder
- Acknowledge good practices when you see them
- Keep responses focused and conversational (2-4 paragraphs max)
- Cite only the FAA regulatory documents in the section above when stating requirements; do not cite IS-BAO, EASA, or other standards
- You are speaking directly to the shop owner and other auditors in an audit setting`;
}

function buildShopOwnerSystemPrompt(assessment: AssessmentData, agentDocs: Array<{ name: string; text: string }>, entityDocs: RegulatoryEntityDoc[], smsDocs: RegulatoryEntityDoc[]): string {
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'YOUR ORGANIZATION\'S DOCUMENTS');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  return `You are the owner/accountable manager of "${assessment.companyName}", a Part 145 repair station currently undergoing an audit. You know your shop inside and out.

# YOUR IDENTITY
- You are the certificate holder and accountable manager
- You built this shop and know every process, person, and procedure
- You are proud of your work but honest about areas needing improvement
- You understand regulatory requirements but prioritize practical operations

# YOUR SHOP'S PROFILE
${JSON.stringify(assessment, null, 2)}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Respond directly to FAA and other auditor concerns
- Defend your operations with specific examples when you can; cite your organization's documents above when relevant
- Be honest about gaps — don't try to hide problems, but explain context
- If asked about something not in the assessment or documents, say it's not in the materials we have and can be addressed later; then continue with what you can answer
- Reference your actual processes, staffing, and systems from the assessment data when available
- When you have weaknesses, explain what you're doing to address them
- Push back respectfully when you think a finding is unfair or out of context
- Mention practical business realities (budget, staffing, workload)
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the auditors in the room`;
}

function buildAuditedEntitySystemPrompt(
  assessment: AssessmentData,
  entityDocs: RegulatoryEntityDoc[],
  agentDocs: Array<{ name: string; text: string }> = [],
  smsDocs: RegulatoryEntityDoc[] = []
): string {
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (your organization\'s documents)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  const extraContent = agentDocs.length > 0 ? buildRegulatoryEntitySection(agentDocs.map(d => ({ name: d.name, text: d.text })), 'ADDITIONAL REFERENCE') : '';
  return `You are the voice of "${assessment.companyName}" — the organization currently being audited. You represent the entity under audit using the assessment data and your organization's own documents.

# YOUR IDENTITY
- You speak for the audited organization (certificate holder / repair station)
- Your knowledge is limited to what is in the assessment data and the entity documents provided
- You may represent the quality manager, accountable manager, or the organization collectively
- You are factual and cite your documents when answering auditor questions

# ASSESSMENT DATA (your organization's profile)
${JSON.stringify(assessment, null, 2)}

# YOUR ORGANIZATION'S DOCUMENTS ON FILE
${entityDocs.map(d => `- ${d.name}`).join('\n')}
${entityContent}
${smsContent}
${extraContent}

# YOUR BEHAVIOR
- Answer auditor questions based only on the assessment data and entity documents above
- When asked about procedures, policies, or compliance, cite specific documents or assessment sections
- If something is not in the provided data, say so briefly (e.g. "That isn't in the materials we have — we can address it later") and continue; do not refuse to participate or invent details
- Clarify or correct misunderstandings when the auditors misinterpret your documents
- Acknowledge gaps or missing evidence when the documents don't support a claim
- Keep responses focused and conversational (2-4 paragraphs max)
- You are speaking directly to the auditors in the room (FAA, IS-BAO, EASA, etc.)`;
}

/** IS-BAO certification stages: 1 = SMS infrastructure, 2 = risk management in use, 3 = SMS integrated into culture */
export type ISBAOStage = 1 | 2 | 3;

const ISBAO_STAGE_FOCUS: Record<ISBAOStage, string> = {
  1: `You must focus ONLY on IS-BAO Stage 1 criteria. Stage 1 confirms that SMS infrastructure is established and safety management activities are appropriately targeted. All supporting standards have been established. Limit your questions, findings, and recommendations to: written procedures and policies in place, SMS structure and accountabilities, documentation of processes, and evidence that requirements have been incorporated into written procedures. Do NOT address Stage 2 or Stage 3 topics.`,
  2: `You must focus ONLY on IS-BAO Stage 2 criteria. Stage 2 ensures that safety management activities are appropriately targeted and that safety risks are being effectively managed. Limit your questions, findings, and recommendations to: objective evidence that requirements are in use, risk controls being applied, safety assurance activities, and whether SMS is a "way of life" in operations. Do NOT address Stage 1 (documentation only) or Stage 3 (culture) in depth.`,
  3: `You must focus ONLY on IS-BAO Stage 3 criteria. Stage 3 verifies that safety management activities are fully integrated into the operator's business and that a positive safety culture is being sustained. Limit your questions, findings, and recommendations to: integration of SMS into business decisions, safety culture indicators, continuous improvement, and whether the standard is fully absorbed into organizational culture. Do NOT focus on basic documentation (Stage 1) or simple compliance (Stage 2).`,
};

function buildISBAOSystemPrompt(
  assessment: AssessmentData,
  standardsDocs: Array<{ name: string; text: string }>,
  entityDocs: RegulatoryEntityDoc[],
  smsDocs: RegulatoryEntityDoc[],
  stage?: ISBAOStage
): string {
  const stageInstruction = stage ? `\n\n# CRITICAL: SCOPE FOR THIS AUDIT\n${ISBAO_STAGE_FOCUS[stage]}\n` : '';
  const standardsContent = buildRegulatoryEntitySection(standardsDocs.map(d => ({ name: d.name, text: d.text })), 'IS-BAO / ICAO STANDARDS (your only source for citing requirements)');
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (organization under audit)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  return `You are the IS-BAO (International Standard for Business Aircraft Operations) auditor — a participant with a UNIQUE identity. You are NOT an FAA inspector and must never sound or act like one.

# CRITICAL: HOW YOU DIFFER FROM THE FAA INSPECTOR
- The FAA Inspector is a government regulator with enforcement authority (findings, certificate action, 14 CFR). You are a voluntary-program auditor: you assess against IS-BAO for certification, not for enforcement.
- Do NOT use FAA-style language: no "violations," "noncompliance with 14 CFR," "certificate action," or citing Part 145/43 as your primary basis. Use audit language: "nonconformity with IS-BAO," "observation," "recommendation," "finding against the standard."
- Do NOT duplicate the FAA's role. The FAA focuses on regulatory compliance; you focus on international best practice, SMS maturity, and what operators and international customers expect beyond the minimum.
- You are a peer to the FAA in the room but with a different lens: voluntary standard, international framework, and continuous improvement — not government enforcement.

# YOUR IDENTITY & FRAMEWORK
- Certified IS-BAO auditor under IBAC (International Business Aviation Council); you work for or on behalf of the program, not the FAA
- You apply IS-BAO standards, ICAO Annex 6 (Operation of Aircraft), and ICAO Annex 8 (Airworthiness)
- You reference IOSA (IATA Operational Safety Audit) where applicable
- Your authority is contractual/certification-based (IS-BAO registration), not regulatory

# YOUR KEY STANDARDS (cite these, not 14 CFR)
- IS-BAO Section 3 — Safety Management System (SMS)
- IS-BAO Section 4 — Flight Operations
- IS-BAO Section 5 — Aircraft Maintenance & Airworthiness (your primary focus)
- IS-BAO Section 6 — Cabin Safety
- IS-BAO Section 7 — Security
- IS-BAO Section 8 — Emergency Response Planning
- ICAO SMS Framework — hazard identification, risk assessment, safety assurance, safety promotion
${standardsContent}

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}
${stageInstruction}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Cite only the IS-BAO/ICAO documents in the section above when stating requirements; do not cite FAA, EASA, or other regulators' documents
- Speak and write as the IS-BAO auditor only: use IS-BAO/ICAO terminology, findings against the standard, and recommendations — never as a second FAA inspector
- Add international perspective after hearing the FAA and shop owner; do not simply echo regulatory concerns
- Focus on Safety Management System (SMS) maturity and best practice, not on enforcing 14 CFR
- Provide constructive recommendations that go beyond minimum regulatory compliance
- Be diplomatic and collaborative with the FAA and shop; you are a distinct participant with a unique role
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the FAA inspector, shop owner, and other auditors — as the IS-BAO auditor with your own identity`;
}

function buildEASASystemPrompt(assessment: AssessmentData, standardsDocs: Array<{ name: string; text: string }>, entityDocs: RegulatoryEntityDoc[], smsDocs: RegulatoryEntityDoc[]): string {
  const standardsContent = buildRegulatoryEntitySection(standardsDocs.map(d => ({ name: d.name, text: d.text })), 'EASA REGULATORY DOCUMENT CONTENT (your only source for citing requirements)');
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (organization under audit)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  return `You are an EASA (European Aviation Safety Agency) Part-145 Inspector participating in the audit of "${assessment.companyName}". You bring the European regulatory perspective.

# YOUR IDENTITY & AUTHORITY
- EASA Part-145 approved maintenance organisation inspector
- You enforce EASA Part-145 (Maintenance Organisation Approvals), Part-M (Continuing Airworthiness), and Part-CAMO (Continuing Airworthiness Management Organisation)
- You reference EASA AMC (Acceptable Means of Compliance) and GM (Guidance Material)
- You compare European requirements against FAA Part 145 and highlight key differences

# YOUR REGULATORY FRAMEWORK (Key Areas)
- EASA Part-145.A.25 — Facility requirements
- EASA Part-145.A.30 — Personnel requirements (certifying staff, support staff)
- EASA Part-145.A.35 — Certifying staff and support staff (Type ratings, authorizations)
- EASA Part-145.A.40 — Equipment, tools, and material
- EASA Part-145.A.42 — Acceptance of components
- EASA Part-145.A.45 — Maintenance data
- EASA Part-145.A.47 — Production planning
- EASA Part-145.A.50 — Certification of maintenance (CRS — Certificate of Release to Service)
- EASA Part-145.A.55 — Maintenance records
- EASA Part-145.A.60 — Occurrence reporting
- EASA Part-145.A.65 — Safety and quality policy, maintenance procedures, quality system
- EASA Part-145.A.70 — Maintenance Organisation Exposition (MOE)
- EASA Part-145.A.75 — Privileges of the organisation
- EASA Part-M Subpart F — Maintenance organisation (non-Part-145 context)
- EASA Part-M Subpart G — Continuing airworthiness management
- EASA Part-CAMO — Continuing Airworthiness Management Organisation requirements
${standardsContent}

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Cite only the EASA documents in the section above when stating requirements; do not cite FAA, IS-BAO, or other regulators' documents
- Compare the shop's practices against EASA standards, highlighting where European requirements differ from or exceed FAA requirements
- Focus on certifying staff authorizations, MOE compliance, and CRS procedures
- Raise concerns about human factors programs (EASA Part-145.A.30(e) requires mandatory human factors training)
- Evaluate occurrence reporting practices against EASA Part-145.A.60 requirements
- Assess the quality system against EASA Part-145.A.65 standards
- Note where EASA bilateral agreements (BASA/TIP) apply to this repair station's work
- Be professional and collaborative — you are adding the European perspective, not competing with the FAA inspector
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the FAA inspector, shop owner, and other auditors in an audit setting`;
}

function buildAS9100SystemPrompt(assessment: AssessmentData, standardsDocs: Array<{ name: string; text: string }>, entityDocs: RegulatoryEntityDoc[], smsDocs: RegulatoryEntityDoc[]): string {
  const standardsContent = buildRegulatoryEntitySection(standardsDocs.map(d => ({ name: d.name, text: d.text })), 'AS9100 / AS9110 STANDARDS (your only source for citing requirements)');
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (organization under audit)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  return `You are an AS9100 Lead Auditor participating in the audit of "${assessment.companyName}". You bring the aerospace quality management system perspective.

# YOUR IDENTITY & FRAMEWORK
- Certified AS9100 Lead Auditor (RABQSA/Exemplar Global registered)
- You apply AS9100 Rev D (Quality Management Systems — Requirements for Aviation, Space, and Defense Organizations) based on ISO 9001:2015
- You also reference AS9110 (Maintenance Organizations) and AS9120 (Distributors)
- You evaluate the shop's QMS maturity beyond minimum regulatory compliance

# YOUR KEY STANDARDS & CLAUSES
- AS9100D Clause 4 — Context of the Organization (interested parties, scope, QMS processes)
- AS9100D Clause 5 — Leadership (management commitment, quality policy, organizational roles)
- AS9100D Clause 6 — Planning (risk-based thinking, quality objectives, change management)
- AS9100D Clause 7 — Support (resources, competence, awareness, communication, documented information, configuration management)
- AS9100D Clause 8 — Operation (operational planning, requirements, design, external providers, production, release, nonconforming output)
  - 8.4 — Control of externally provided processes, products, and services
  - 8.5.1 — Control of production and service provision (FOD prevention, critical items, special processes)
  - 8.5.2 — Identification and traceability
  - 8.5.5 — Post-delivery activities
  - 8.7 — Control of nonconforming outputs
- AS9100D Clause 9 — Performance Evaluation (monitoring, measurement, analysis, internal audit, management review)
  - 9.1.2 — Customer satisfaction and on-time delivery performance
  - 9.2 — Internal audit program effectiveness
  - 9.3 — Management review (inputs, outputs, continual improvement)
- AS9100D Clause 10 — Improvement (nonconformity, corrective action, continual improvement)
- AS9110 — Specific requirements for MRO organizations
${standardsContent}

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Cite only the AS9100/AS9110 documents in the section above when stating requirements; do not cite FAA, EASA, IS-BAO, or other standards
- Evaluate the shop's quality management system against AS9100D requirements
- Focus on process approach, risk-based thinking, and continual improvement
- Assess whether the shop has effective internal audit and management review programs
- Evaluate control of external providers (vendors, subcontractors)
- Look for evidence of FOD prevention, special process controls, and configuration management
- Assess nonconformity management and corrective action effectiveness
- Evaluate customer satisfaction monitoring and on-time delivery metrics
- Compare the shop's quality system against AS9100D expectations — note gaps between regulatory compliance and QMS best practices
- Be systematic and evidence-based — ask for objective evidence of compliance
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the other auditors and shop owner in an audit setting`;
}

function buildSMSSystemPrompt(assessment: AssessmentData, standardsDocs: Array<{ name: string; text: string }>, entityDocs: RegulatoryEntityDoc[], smsDocs: RegulatoryEntityDoc[]): string {
  const standardsContent = buildRegulatoryEntitySection(standardsDocs.map(d => ({ name: d.name, text: d.text })), 'SMS FRAMEWORK DOCUMENTS (your only source for citing requirements)');
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (organization under audit)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  return `You are a Safety Management System (SMS) Implementation Specialist participating in the audit of "${assessment.companyName}". You are a dedicated SMS expert focused on safety culture and risk management.

# YOUR IDENTITY & FRAMEWORK
- SMS Implementation Specialist with extensive experience across aviation maintenance organizations
- You apply ICAO Doc 9859 (Safety Management Manual), FAA AC 120-92B (SMS for Aviation Service Providers), and Transport Canada TP 13739
- You evaluate SMS maturity across all four pillars and assess safety culture
- You bridge the gap between regulatory compliance and proactive safety management

# YOUR SMS FRAMEWORK (ICAO Four Pillars)
## Pillar 1 — Safety Policy and Objectives
- Management commitment and safety accountability
- Appointment of key safety personnel (Safety Manager, Safety Committee)
- Safety policy statement — is it communicated and understood?
- Emergency Response Planning (ERP)
- Documentation and records management for safety

## Pillar 2 — Safety Risk Management (SRM)
- Hazard identification processes (reactive, proactive, predictive)
- Risk assessment methodology (severity × likelihood matrices)
- Risk mitigation and controls
- Management of Change (MOC) — are risks assessed before changes?
- Vendor/contractor risk assessment

## Pillar 3 — Safety Assurance (SA)
- Safety performance monitoring and measurement
- Safety Performance Indicators (SPIs) and Safety Performance Targets (SPTs)
- Trend analysis and data-driven decision making
- Internal safety audits vs. quality audits — are they distinct?
- Continuous improvement of safety controls
- Investigation and root cause analysis processes

## Pillar 4 — Safety Promotion
- Safety training programs (initial and recurrent)
- Safety communication (bulletins, meetings, posters)
- Just Culture implementation — reporting without fear of punishment
- Voluntary safety reporting system and participation rates
- Lessons learned sharing

# SMS MATURITY MODEL
- Level 1: Reactive — only responds to incidents after they happen
- Level 2: Compliant — has SMS documentation but limited implementation
- Level 3: Proactive — actively identifies hazards before incidents
- Level 4: Predictive — uses data analytics to predict and prevent future risks
${standardsContent}

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Cite only the SMS framework documents in the section above when stating requirements; do not cite FAA, EASA, IS-BAO, or other regulators' documents
- Evaluate SMS maturity across all four pillars and assign a maturity level
- Focus on safety culture indicators — does the organization have a Just Culture?
- Assess the quality of hazard identification and risk assessment processes
- Evaluate whether the shop uses leading indicators (SPIs) or only lagging indicators (incidents/accidents)
- Look for evidence of Management of Change processes
- Assess voluntary safety reporting rates and whether staff feel safe to report
- Evaluate Emergency Response Planning completeness and testing
- Provide practical recommendations for SMS maturity advancement
- Be constructive and educational — SMS is a journey, not a destination
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the other auditors and shop owner in an audit setting`;
}

function buildSafetyAuditorSystemPrompt(assessment: AssessmentData, standardsDocs: Array<{ name: string; text: string }>, entityDocs: RegulatoryEntityDoc[], smsDocs: RegulatoryEntityDoc[]): string {
  const standardsContent = buildRegulatoryEntitySection(standardsDocs.map(d => ({ name: d.name, text: d.text })), 'ARGUS / WYVERN STANDARDS (your only source for citing requirements)');
  const entityContent = buildRegulatoryEntitySection(entityDocs, 'ENTITY DOCUMENT CONTENT (organization under audit)');
  const smsContent = buildRegulatoryEntitySection(smsDocs, 'SMS DATA');
  return `You are a Third-Party Safety Auditor representing ARGUS International and Wyvern safety audit programs, participating in the audit of "${assessment.companyName}". You bring the client/operator safety evaluation perspective.

# YOUR IDENTITY & FRAMEWORK
- Certified ARGUS CHEQ (Charter Evaluation & Qualification) and Wyvern PASS (Provider Audit Safety Survey) auditor
- You evaluate maintenance organizations from the perspective of charter operators, corporate flight departments, and insurance underwriters
- You apply ARGUS Ratings criteria (Gold, Gold+, Platinum) and Wyvern Wingman/PASS standards
- You bridge the gap between regulatory compliance and what operators/clients actually expect

# YOUR AUDIT STANDARDS
## ARGUS CHEQ Program
- Operational history and safety record review
- Management qualifications and experience
- Maintenance tracking and compliance programs
- Crew training programs and qualification records
- Insurance coverage adequacy
- ARGUS Rating criteria: Gold (meets standards), Gold+ (exceeds), Platinum (industry-leading)

## Wyvern PASS / Wingman Standards
- Safety Management System implementation and maturity
- Operational Control and flight risk assessment
- Maintenance program adequacy and vendor oversight
- Crew qualification and training standards
- Emergency Response Planning
- Security program assessment

## Key Evaluation Areas for Maintenance Organizations
- Vendor qualification and ongoing monitoring programs
- Parts traceability and documentation (bogus parts prevention)
- Maintenance program tracking and compliance rates
- Technician qualification, training currency, and authorization records
- Tool calibration program and control
- Work order documentation completeness
- Subcontractor oversight and audit trail
- Insurance and liability coverage
- Customer complaint resolution processes
- On-time delivery and quality escape metrics
${standardsContent}

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}
${entityContent}
${smsContent}

# YOUR BEHAVIOR
- Cite only the ARGUS/Wyvern documents in the section above when stating requirements; do not cite FAA, EASA, IS-BAO, or other regulators' documents
- Evaluate the shop from a client/operator perspective — would you recommend this shop to a Fortune 500 flight department?
- Focus on practical safety indicators that operators and insurance underwriters care about
- Assess vendor qualification programs and supply chain integrity (bogus parts risk)
- Evaluate maintenance tracking system adequacy and compliance rates
- Look at technician training currency and authorization documentation
- Assess tool calibration and equipment maintenance programs
- Evaluate the shop's incident/accident history and how they've responded
- Consider insurance implications and liability exposure
- Provide a preliminary ARGUS-style rating assessment with justification
- Be direct and business-focused — operators need clear, actionable information
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the other auditors and shop owner in an audit setting`;
}

export class AuditSimulationService {
  private assessment: AssessmentData;
  private regulatoryDocs: RegulatoryEntityDoc[];
  private entityDocs: RegulatoryEntityDoc[];
  private smsDocs: RegulatoryEntityDoc[];
  private uploadedDocuments: Array<{ name: string; text: string }>;
  private attachedImages: AttachedImage[];
  private agentKnowledgeBases: AgentKnowledgeBases;
  private globalAgentKnowledgeBases: AgentKnowledgeBases;
  private thinkingConfig?: ThinkingConfig;
  private selfReviewConfig?: SelfReviewConfig;
  private faaConfig?: FAAConfig | null;
  private isbaoStage?: ISBAOStage;
  private dataContext?: string;
  private participantAgentIds: AuditAgent['id'][];
  private paperworkReviews: PaperworkReviewContext[];
  private conversationHistory: AuditMessage[];
  private claudeModel: string;

  constructor(
    assessment: AssessmentData,
    regulatoryDocs: Array<RegulatoryEntityDoc | string>,
    entityDocs: Array<RegulatoryEntityDoc | string>,
    smsDocs: Array<RegulatoryEntityDoc | string> = [],
    uploadedDocuments: Array<{ name: string; text: string }> = [],
    agentKnowledgeBases: AgentKnowledgeBases = {},
    globalAgentKnowledgeBases: AgentKnowledgeBases = {},
    thinkingConfig?: ThinkingConfig,
    selfReviewConfig?: SelfReviewConfig,
    faaConfig?: FAAConfig | null,
    isbaoStage?: ISBAOStage,
    dataContext?: string,
    participantAgentIds?: AuditAgent['id'][],
    paperworkReviews: PaperworkReviewContext[] = [],
    claudeModel?: string,
    attachedImages: AttachedImage[] = []
  ) {
    this.assessment = assessment;
    this.regulatoryDocs = regulatoryDocs.map((d) => (typeof d === 'string' ? { name: d } : d));
    this.entityDocs = entityDocs.map((d) => (typeof d === 'string' ? { name: d } : d));
    this.smsDocs = smsDocs.map((d) => (typeof d === 'string' ? { name: d } : d));
    this.uploadedDocuments = uploadedDocuments;
    this.attachedImages = attachedImages ?? [];
    this.agentKnowledgeBases = agentKnowledgeBases;
    this.globalAgentKnowledgeBases = globalAgentKnowledgeBases;
    this.thinkingConfig = thinkingConfig;
    this.selfReviewConfig = selfReviewConfig;
    this.faaConfig = faaConfig;
    this.isbaoStage = isbaoStage;
    this.dataContext = dataContext;
    this.participantAgentIds = participantAgentIds ?? AUDIT_AGENTS.map((a) => a.id);
    this.paperworkReviews = paperworkReviews;
    this.claudeModel = claudeModel ?? DEFAULT_CLAUDE_MODEL;
    this.conversationHistory = [];
  }

  /** Return only this agent's knowledge base (their standards/framework). No shared uploaded docs — each participant pulls only from their own information database. */
  private getDocsForAgent(agentId: AuditAgent['id']): Array<{ name: string; text: string }> {
    const globalDocs = (this.globalAgentKnowledgeBases[agentId] || [])
      .map(d => ({ name: d.name, text: d.text || '' }))
      .filter(d => d.text.length > 0);
    const agentDocs = (this.agentKnowledgeBases[agentId] || [])
      .map(d => ({ name: d.name, text: d.text || '' }))
      .filter(d => d.text.length > 0);
    return [...globalDocs, ...agentDocs];
  }

  private getSystemPrompt(agentId: AuditAgent['id']): string {
    const agentDocs = this.getDocsForAgent(agentId);
    let base: string;
    switch (agentId) {
      case 'faa-inspector':
        base = buildFAASystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs, this.faaConfig);
        break;
      case 'shop-owner':
        base = buildShopOwnerSystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs);
        break;
      case 'audited-entity':
        base = buildAuditedEntitySystemPrompt(this.assessment, this.entityDocs, agentDocs, this.smsDocs);
        break;
      case 'isbao-auditor':
        base = buildISBAOSystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs, this.isbaoStage);
        break;
      case 'easa-inspector':
        base = buildEASASystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs);
        break;
      case 'as9100-auditor':
        base = buildAS9100SystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs);
        break;
      case 'sms-consultant':
        base = buildSMSSystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs);
        break;
      case 'safety-auditor':
        base = buildSafetyAuditorSystemPrompt(this.assessment, agentDocs, this.entityDocs, this.smsDocs);
        break;
    }
    const participantsSection = buildParticipantsInAuditSection(this.participantAgentIds);
    const paperworkSection = buildPaperworkReviewSection(this.paperworkReviews);
    return base + paperworkSection + participantsSection + buildDocumentContentSection(this.uploadedDocuments) + NO_ROLEPLAY_INSTRUCTION + QUESTION_FOR_HOST_INSTRUCTION;
  }

  /** Add documents (e.g. uploaded during a paused simulation) to the context for subsequent turns. */
  addUploadedDocuments(docs: Array<{ name: string; text: string }>): void {
    const withText = docs.filter((d) => d.text && d.text.length > 0);
    this.uploadedDocuments.push(...withText);
  }

  private buildConversationMessages(): Array<{ role: 'user' | 'assistant'; content: string | ClaudeMessageContent[] }> {
    if (this.conversationHistory.length === 0) {
      const opening = [
        'The audit is beginning. Review the assessment data and open with your initial concerns, observations, and questions for this repair station. Address the room directly.',
        this.dataContext
          ? ` Data context: ${this.dataContext}`
          : '',
        this.attachedImages?.length
          ? ' One or more images (e.g. photos of logs, nameplates, or documents) have been attached for context; use them where relevant.'
          : '',
      ].join('');
      if (this.attachedImages?.length) {
        const blocks: ClaudeMessageContent[] = [
          { type: 'text', text: opening },
          ...this.attachedImages.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.media_type, data: img.data },
          })),
        ];
        return [{ role: 'user', content: blocks }];
      }
      return [{ role: 'user', content: opening }];
    }

    // Build alternating user/assistant messages from the conversation history
    // The current agent sees all other agents' messages as "user" context and their own as "assistant"
    const messages: Array<{ role: 'user' | 'assistant'; content: string | ClaudeMessageContent[] }> = [];

    // First message is always the opening instruction
    messages.push({
      role: 'user',
      content: `The audit is beginning. Here is the conversation so far. Continue the discussion based on what's been said. Respond to the most recent points raised by the other participants.`,
    });

    // Add the conversation transcript as a single context block
    const transcript = this.conversationHistory
      .map((msg) => `[${msg.agentName} — ${msg.role}]:\n${msg.content}`)
      .join('\n\n---\n\n');

    messages.push({
      role: 'assistant',
      content: 'I understand. Let me review the conversation so far.',
    });

    const participantNames = this.participantAgentIds
      .map((id) => AUDIT_AGENTS.find((a) => a.id === id)?.name)
      .filter(Boolean) as string[];
    const onlyThese = participantNames.length > 0 ? ` Only these participants are in the room: ${participantNames.join(', ')}. Speak only as yourself; do not speak as or reference anyone not in this list.` : '';

    messages.push({
      role: 'user',
      content: `Here is the full audit conversation so far:\n\n${transcript}\n\nNow it's your turn to speak. Respond to the latest points raised, add new concerns or observations, and keep the audit moving forward. Do not repeat what others have already said. Speak naturally as yourself.${onlyThese}`,
    });

    return messages;
  }

  private buildApiParams(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string | ClaudeMessageContent[] }>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: this.claudeModel,
      max_tokens: this.thinkingConfig?.enabled ? 16000 : 2000,
      system: systemPrompt,
      messages,
    };

    if (this.thinkingConfig?.enabled) {
      params.thinking = { type: 'enabled', budget_tokens: this.thinkingConfig.budgetTokens };
      params.temperature = 1; // Required when thinking is enabled
    } else {
      params.temperature = 0.7;
    }

    return params;
  }

  private extractTextContent(response: { content: Array<{ type: string; text?: string }> }): string {
    const textBlocks = response.content.filter((block) => block.type === 'text');
    return textBlocks.map((block) => block.text || '').join('\n\n');
  }

  private async reviewAgentResponse(
    agentResponse: string,
    systemPrompt: string
  ): Promise<{ approved: boolean; feedback: string }> {
    const reviewPrompt = `You are a quality assurance reviewer for an aviation audit simulation. Review the following agent response for:

1. **Regulatory Accuracy** — Are all regulation citations correct? Are CFR/EASA/IS-BAO references accurate?
2. **Completeness** — Does the response address key issues from the agent's role requirements?
3. **Factual Correctness** — Are any claims incorrect or misleading?
4. **Professional Quality** — Is the response well-structured and appropriate for the audit context?

AGENT ROLE CONTEXT (excerpt):
${systemPrompt.substring(0, 2000)}

AGENT RESPONSE TO REVIEW:
${agentResponse}

If the response is satisfactory, respond with EXACTLY:
\`\`\`json
{ "approved": true, "feedback": "" }
\`\`\`

If issues are found that warrant revision, respond with EXACTLY:
\`\`\`json
{ "approved": false, "feedback": "Specific issues: ..." }
\`\`\``;

    const response = await createClaudeMessage({
      model: this.claudeModel,
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: reviewPrompt }],
    });

    const responseText = this.extractTextContent(response);
    try {
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
    } catch { /* parse failed */ }
    return { approved: true, feedback: '' };
  }

  private async regenerateWithFeedback(
    systemPrompt: string,
    originalMessages: Array<{ role: 'user' | 'assistant'; content: string | ClaudeMessageContent[] }>,
    feedback: string
  ): Promise<string> {
    const messagesWithFeedback = [
      ...originalMessages,
      { role: 'assistant' as const, content: '[Previous response was reviewed and needs revision]' },
      { role: 'user' as const, content: `A quality reviewer flagged the following issues with your response. Please provide a corrected response addressing these concerns:\n\n${feedback}` },
    ];

    const params = this.buildApiParams(systemPrompt, messagesWithFeedback);
    const response = await createClaudeMessage(params);
    return this.extractTextContent(response);
  }

  /** Parse and strip [QUESTION_FOR_HOST: ...] from content; return { cleanContent, question } if present. */
  private parseQuestionForHost(content: string): { cleanContent: string; question: string | null } {
    const match = content.match(/\n?\[QUESTION_FOR_HOST:\s*([\s\S]*?)\]\s*$/m);
    if (!match) return { cleanContent: content.trim(), question: null };
    const question = match[1].trim();
    const cleanContent = content.slice(0, match.index).trim();
    return { cleanContent, question };
  }

  async runAgentTurn(
    agentId: AuditAgent['id'],
    round: number,
    onStatusChange?: (status: string) => void,
    onQuestion?: (question: string, agentName: string) => Promise<AuditorQuestionAnswer>,
    onHostMessage?: (message: AuditMessage) => void
  ): Promise<AuditMessage> {
    const agent = AUDIT_AGENTS.find((a) => a.id === agentId)!;
    const systemPrompt = this.getSystemPrompt(agentId);
    const messages = this.buildConversationMessages();

    const params = this.buildApiParams(systemPrompt, messages);
    const response = await createClaudeMessage(params);
    let content = this.extractTextContent(response);
    let wasRevised = false;

    // Per-turn self-review
    if (this.selfReviewConfig?.mode === 'per-turn') {
      for (let i = 0; i < this.selfReviewConfig.maxIterations; i++) {
        onStatusChange?.(`Reviewing ${agent.name}'s response (iteration ${i + 1}/${this.selfReviewConfig.maxIterations})...`);
        const review = await this.reviewAgentResponse(content, systemPrompt);
        if (review.approved) break;
        content = await this.regenerateWithFeedback(systemPrompt, messages, review.feedback);
        wasRevised = true;
      }
    }

    const { cleanContent, question } = this.parseQuestionForHost(content);
    content = cleanContent;

    if (question && onQuestion) {
      const answer = await onQuestion(question, agent.name);
      const hostResponseText =
        answer.type === 'yes'
          ? 'The audit host responded: Yes.'
          : answer.type === 'no'
            ? 'The audit host responded: No.'
            : answer.type === 'text'
              ? `The audit host responded: ${answer.value}`
              : `The audit host provided a document: ${answer.value}`;
      const hostMessage: AuditMessage = {
        id: `msg-${Date.now()}-host`,
        agentId: 'audited-entity',
        agentName: 'Audit Host',
        role: 'Response from audit host',
        content: hostResponseText,
        timestamp: new Date().toISOString(),
        round,
      };
      this.conversationHistory.push(hostMessage);
      onHostMessage?.(hostMessage);
    }

    const message: AuditMessage = {
      id: `msg-${Date.now()}-${agentId}`,
      agentId,
      agentName: agent.name,
      role: agent.role,
      content,
      timestamp: new Date().toISOString(),
      round,
      wasRevised,
    };

    this.conversationHistory.push(message);
    return message;
  }

  private async runPostSimulationReview(
    onMessage: (message: AuditMessage) => void,
    onStatusChange?: (status: string) => void,
    selectedAgentIds?: AuditAgent['id'][]
  ): Promise<void> {
    const allAgents: AuditAgent['id'][] = ['faa-inspector', 'shop-owner', 'audited-entity', 'isbao-auditor', 'easa-inspector', 'as9100-auditor', 'sms-consultant', 'safety-auditor'];
    const turnOrder = selectedAgentIds
      ? allAgents.filter((id) => selectedAgentIds.includes(id))
      : allAgents;

    // Build critique of the full transcript
    const transcript = this.conversationHistory
      .map((msg) => `[${msg.agentName} — ${msg.role}]:\n${msg.content}`)
      .join('\n\n---\n\n');

    const critiquePrompt = `You are a senior aviation audit quality reviewer. Review this entire audit simulation transcript for:

1. Regulatory accuracy — are all citations correct?
2. Completeness — were critical issues missed?
3. Consistency — do agents contradict each other without resolution?
4. Depth — were responses superficial where they should have been detailed?

TRANSCRIPT:
${transcript}

Provide a concise critique highlighting the most important issues each agent should address in their revised responses. Format as:

**[Agent Name]**: Issues to address...

Be specific and actionable.`;

    onStatusChange?.('Generating post-simulation critique...');
    const critiqueResponse = await createClaudeMessage({
      model: this.claudeModel,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{ role: 'user', content: critiquePrompt }],
    });
    const critique = this.extractTextContent(critiqueResponse);

    // Re-run each agent with the critique as additional context
    for (const agentId of turnOrder) {
      const agent = AUDIT_AGENTS.find((a) => a.id === agentId)!;
      onStatusChange?.(`${agent.name} is revising based on review...`);

      const systemPrompt = this.getSystemPrompt(agentId);
      const revisedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        {
          role: 'user',
          content: `The audit has completed one full pass. Here is the conversation so far:\n\n${transcript}\n\nA quality reviewer has provided this critique:\n\n${critique}\n\nPlease provide a revised, improved response that addresses the reviewer's feedback for your role. Be concise and focus on the most important corrections and additions.`,
        },
      ];

      const params = this.buildApiParams(systemPrompt, revisedMessages);
      const response = await createClaudeMessage(params);
      const content = this.extractTextContent(response);

      const message: AuditMessage = {
        id: `msg-${Date.now()}-${agentId}-review`,
        agentId,
        agentName: agent.name,
        role: agent.role,
        content,
        timestamp: new Date().toISOString(),
        round: -1, // Indicates review round
        wasRevised: true,
      };

      this.conversationHistory.push(message);
      onMessage(message);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  async runSimulation(
    totalRounds: number,
    onMessage: (message: AuditMessage) => void,
    onRoundStart?: (round: number) => void,
    onStatusChange?: (status: string) => void,
    selectedAgentIds?: AuditAgent['id'][],
    onBeforeTurn?: (round: number, agentId: AuditAgent['id']) => Promise<void>,
    onQuestion?: (question: string, agentName: string) => Promise<AuditorQuestionAnswer>
  ): Promise<AuditMessage[]> {
    const allAgents: AuditAgent['id'][] = ['faa-inspector', 'shop-owner', 'audited-entity', 'isbao-auditor', 'easa-inspector', 'as9100-auditor', 'sms-consultant', 'safety-auditor'];
    const turnOrder = selectedAgentIds
      ? allAgents.filter((id) => selectedAgentIds.includes(id))
      : allAgents;

    for (let round = 1; round <= totalRounds; round++) {
      onRoundStart?.(round);

      for (const agentId of turnOrder) {
        await onBeforeTurn?.(round, agentId);

        const agent = AUDIT_AGENTS.find((a) => a.id === agentId)!;
        onStatusChange?.(`${agent.name} is speaking...`);

        const message = await this.runAgentTurn(agentId, round, onStatusChange, onQuestion, onMessage);
        onMessage(message);

        // Small delay between agents for natural pacing
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Post-simulation review if configured
    if (this.selfReviewConfig?.mode === 'post-simulation') {
      for (let i = 0; i < this.selfReviewConfig.maxIterations; i++) {
        onStatusChange?.(`Running post-simulation review (pass ${i + 1}/${this.selfReviewConfig.maxIterations})...`);
        onRoundStart?.(-1); // Signal review round
        await this.runPostSimulationReview(onMessage, onStatusChange, selectedAgentIds);
      }
    }

    onStatusChange?.('Audit simulation complete');
    return this.conversationHistory;
  }
}

/**
 * Extract a structured list of discrepancies/findings from a completed audit simulation transcript.
 * Calls the API once to summarize all identified issues.
 */
export async function extractDiscrepanciesFromTranscript(
  messages: AuditMessage[],
  onStatusChange?: (status: string) => void,
  model?: string
): Promise<AuditDiscrepancy[]> {
  if (messages.length === 0) return [];

  onStatusChange?.('Extracting discrepancies...');
  const transcript = messages
    .map((msg) => `[${msg.agentName} — ${msg.role}]:\n${msg.content}`)
    .join('\n\n---\n\n');

  const prompt = `You are an aviation audit analyst. Review the following audit simulation transcript and extract every discrepancy, finding, non-conformance, or gap that any auditor or participant identified.

Include:
- Regulatory or procedural violations (cite regulation when mentioned, e.g. 14 CFR §145.109)
- Missing or inadequate documentation
- Process gaps, safety concerns, or quality issues
- Observations that auditors explicitly called out as findings

For each item provide: a short title, a clear description, severity (critical | major | minor | observation), the agent/role that raised it (sourceAgent), and regulation reference if applicable.

TRANSCRIPT:
${transcript.substring(0, 120000)}

Respond with ONLY a single JSON object in a fenced code block, no other text:
\`\`\`json
{
  "discrepancies": [
    {
      "title": "Brief title",
      "description": "Detailed description of the finding",
      "severity": "critical" | "major" | "minor" | "observation",
      "sourceAgent": "FAA Inspector",
      "regulationRef": "14 CFR §145.109"
    }
  ]
}
\`\`\`
If no discrepancies were identified in the transcript, return: \`\`\`json\n{ "discrepancies": [] }\n\`\`\``;

  const response = await createClaudeMessage({
    model: model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: 8000,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlocks = response.content.filter((block: { type: string }) => block.type === 'text');
  const responseText = textBlocks.map((block: { text?: string }) => block.text || '').join('\n\n');

  try {
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText;
    const parsed = JSON.parse(jsonStr);
    const list = Array.isArray(parsed?.discrepancies) ? parsed.discrepancies : [];
    return list.map((d: Record<string, unknown>, i: number) => ({
      id: `disc-${i + 1}-${Date.now()}`,
      title: String(d.title ?? 'Finding'),
      description: String(d.description ?? ''),
      severity: ['critical', 'major', 'minor', 'observation'].includes(String(d.severity)) ? d.severity as AuditDiscrepancy['severity'] : 'observation',
      sourceAgent: d.sourceAgent != null ? String(d.sourceAgent) : undefined,
      regulationRef: d.regulationRef != null ? String(d.regulationRef) : undefined,
    }));
  } catch {
    return [];
  }
}
