import type { AssessmentData } from '../types/assessment';
import type { AuditAgent, AuditMessage, ThinkingConfig, SelfReviewConfig } from '../types/auditSimulation';
import type { AgentKnowledgeBases } from '../types/project';
import { createClaudeMessage } from './claudeProxy';

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

function buildDocumentContentSection(uploadedDocuments: Array<{ name: string; text: string }>): string {
  const docsWithText = uploadedDocuments.filter((d) => d.text.length > 0);
  if (docsWithText.length === 0) return '';
  const sections = docsWithText.map(
    (d) => `## ${d.name}\n${d.text.substring(0, 5000)}`
  );
  return `\n\n# UPLOADED DOCUMENT CONTENT\nThe following documents have been provided for review. Reference them directly in your analysis.\n\n${sections.join('\n\n')}`;
}

function buildFAASystemPrompt(assessment: AssessmentData, regulatoryDocs: string[], entityDocs: string[], uploadedDocuments: Array<{ name: string; text: string }> = []): string {
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
${regulatoryDocs.map(d => `- ${d}`).join('\n')}

# ENTITY DOCUMENTS ON FILE
${entityDocs.map(d => `- ${d}`).join('\n')}

# YOUR BEHAVIOR
- Open with specific regulatory concerns based on the assessment data
- Cite specific CFR sections when raising findings
- Be professional but firm — you are protecting safety
- Ask pointed questions about compliance gaps you see in the data
- Challenge vague or incomplete answers from the shop owner
- Acknowledge good practices when you see them
- Keep responses focused and conversational (2-4 paragraphs max)
- You are speaking directly to the shop owner and IS-BAO auditor in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

function buildShopOwnerSystemPrompt(assessment: AssessmentData, uploadedDocuments: Array<{ name: string; text: string }> = []): string {
  return `You are the owner/accountable manager of "${assessment.companyName}", a Part 145 repair station currently undergoing an audit. You know your shop inside and out.

# YOUR IDENTITY
- You are the certificate holder and accountable manager
- You built this shop and know every process, person, and procedure
- You are proud of your work but honest about areas needing improvement
- You understand regulatory requirements but prioritize practical operations

# YOUR SHOP'S PROFILE
${JSON.stringify(assessment, null, 2)}

# YOUR BEHAVIOR
- Respond directly to FAA and IS-BAO auditor concerns
- Defend your operations with specific examples when you can
- Be honest about gaps — don't try to hide problems, but explain context
- Reference your actual processes, staffing, and systems from the assessment data
- When you have weaknesses, explain what you're doing to address them
- Push back respectfully when you think a finding is unfair or out of context
- Mention practical business realities (budget, staffing, workload)
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the FAA inspector and IS-BAO auditor in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

function buildISBAOSystemPrompt(assessment: AssessmentData, uploadedDocuments: Array<{ name: string; text: string }> = []): string {
  return `You are an IS-BAO (International Standard for Business Aircraft Operations) auditor observing and participating in the audit of "${assessment.companyName}". You bring an international best-practice perspective.

# YOUR IDENTITY & FRAMEWORK
- Certified IS-BAO auditor with IBAC (International Business Aviation Council)
- You apply IS-BAO standards, ICAO Annex 6 (Operation of Aircraft), and ICAO Annex 8 (Airworthiness)
- You also reference IOSA (IATA Operational Safety Audit) standards where applicable
- You bridge domestic FAA requirements with international safety management best practices

# YOUR KEY STANDARDS
- IS-BAO Section 3 — Safety Management System (SMS)
- IS-BAO Section 4 — Flight Operations
- IS-BAO Section 5 — Aircraft Maintenance & Airworthiness (your primary focus)
- IS-BAO Section 6 — Cabin Safety
- IS-BAO Section 7 — Security
- IS-BAO Section 8 — Emergency Response Planning
- ICAO SMS Framework — hazard identification, risk assessment, safety assurance, safety promotion
- Gap analysis between FAA Part 145 and international standards

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# YOUR BEHAVIOR
- Add international perspective after hearing both the FAA and shop owner
- Compare FAA requirements to IS-BAO and ICAO standards — note where international standards are stricter or offer better frameworks
- Focus heavily on Safety Management System (SMS) maturity
- Evaluate whether the shop's quality system meets international best practices
- Provide constructive recommendations that go beyond minimum compliance
- Be diplomatic but incisive — you see both the FAA's regulatory view and the shop's practical reality
- Highlight areas where international operators or customers would expect more
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the FAA inspector and shop owner in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

function buildEASASystemPrompt(assessment: AssessmentData, uploadedDocuments: Array<{ name: string; text: string }> = []): string {
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

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# YOUR BEHAVIOR
- Compare the shop's practices against EASA standards, highlighting where European requirements differ from or exceed FAA requirements
- Focus on certifying staff authorizations, MOE compliance, and CRS procedures
- Raise concerns about human factors programs (EASA Part-145.A.30(e) requires mandatory human factors training)
- Evaluate occurrence reporting practices against EASA Part-145.A.60 requirements
- Assess the quality system against EASA Part-145.A.65 standards
- Note where EASA bilateral agreements (BASA/TIP) apply to this repair station's work
- Be professional and collaborative — you are adding the European perspective, not competing with the FAA inspector
- Keep responses conversational and natural (2-4 paragraphs max)
- You are speaking directly to the FAA inspector, shop owner, and other auditors in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

function buildAS9100SystemPrompt(assessment: AssessmentData, uploadedDocuments: Array<{ name: string; text: string }> = []): string {
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

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# YOUR BEHAVIOR
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
- You are speaking directly to the other auditors and shop owner in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

function buildSMSSystemPrompt(assessment: AssessmentData, uploadedDocuments: Array<{ name: string; text: string }> = []): string {
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

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# YOUR BEHAVIOR
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
- You are speaking directly to the other auditors and shop owner in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

function buildSafetyAuditorSystemPrompt(assessment: AssessmentData, uploadedDocuments: Array<{ name: string; text: string }> = []): string {
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

# ASSESSMENT DATA
${JSON.stringify(assessment, null, 2)}

# YOUR BEHAVIOR
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
- You are speaking directly to the other auditors and shop owner in an audit setting${buildDocumentContentSection(uploadedDocuments)}`;
}

export class AuditSimulationService {
  private assessment: AssessmentData;
  private regulatoryDocs: string[];
  private entityDocs: string[];
  private uploadedDocuments: Array<{ name: string; text: string }>;
  private agentKnowledgeBases: AgentKnowledgeBases;
  private globalAgentKnowledgeBases: AgentKnowledgeBases;
  private thinkingConfig?: ThinkingConfig;
  private selfReviewConfig?: SelfReviewConfig;
  private conversationHistory: AuditMessage[];

  constructor(
    assessment: AssessmentData,
    regulatoryDocs: string[],
    entityDocs: string[],
    uploadedDocuments: Array<{ name: string; text: string }> = [],
    agentKnowledgeBases: AgentKnowledgeBases = {},
    globalAgentKnowledgeBases: AgentKnowledgeBases = {},
    thinkingConfig?: ThinkingConfig,
    selfReviewConfig?: SelfReviewConfig
  ) {
    this.assessment = assessment;
    this.regulatoryDocs = regulatoryDocs;
    this.entityDocs = entityDocs;
    this.uploadedDocuments = uploadedDocuments;
    this.agentKnowledgeBases = agentKnowledgeBases;
    this.globalAgentKnowledgeBases = globalAgentKnowledgeBases;
    this.thinkingConfig = thinkingConfig;
    this.selfReviewConfig = selfReviewConfig;
    this.conversationHistory = [];
  }

  /** Merge global KB docs, project agent-specific docs, and shared uploaded documents */
  private getDocsForAgent(agentId: AuditAgent['id']): Array<{ name: string; text: string }> {
    const globalDocs = (this.globalAgentKnowledgeBases[agentId] || [])
      .map(d => ({ name: d.name, text: d.text || '' }))
      .filter(d => d.text.length > 0);
    const agentDocs = (this.agentKnowledgeBases[agentId] || [])
      .map(d => ({ name: d.name, text: d.text || '' }))
      .filter(d => d.text.length > 0);
    // Global KB docs first (highest priority), then project agent docs, then shared docs
    return [...globalDocs, ...agentDocs, ...this.uploadedDocuments.filter((d) => d.text.length > 0)];
  }

  private getSystemPrompt(agentId: AuditAgent['id']): string {
    const docs = this.getDocsForAgent(agentId);
    switch (agentId) {
      case 'faa-inspector':
        return buildFAASystemPrompt(this.assessment, this.regulatoryDocs, this.entityDocs, docs);
      case 'shop-owner':
        return buildShopOwnerSystemPrompt(this.assessment, docs);
      case 'isbao-auditor':
        return buildISBAOSystemPrompt(this.assessment, docs);
      case 'easa-inspector':
        return buildEASASystemPrompt(this.assessment, docs);
      case 'as9100-auditor':
        return buildAS9100SystemPrompt(this.assessment, docs);
      case 'sms-consultant':
        return buildSMSSystemPrompt(this.assessment, docs);
      case 'safety-auditor':
        return buildSafetyAuditorSystemPrompt(this.assessment, docs);
    }
  }

  private buildConversationMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
    if (this.conversationHistory.length === 0) {
      return [
        {
          role: 'user',
          content: `The audit is beginning. Review the assessment data and open with your initial concerns, observations, and questions for this repair station. Address the room directly.`,
        },
      ];
    }

    // Build alternating user/assistant messages from the conversation history
    // The current agent sees all other agents' messages as "user" context and their own as "assistant"
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

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

    messages.push({
      role: 'user',
      content: `Here is the full audit conversation so far:\n\n${transcript}\n\nNow it's your turn to speak. Respond to the latest points raised, add new concerns or observations, and keep the audit moving forward. Do not repeat what others have already said. Speak naturally as yourself.`,
    });

    return messages;
  }

  private buildApiParams(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      model: 'claude-sonnet-4-5-20250929',
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
      model: 'claude-sonnet-4-5-20250929',
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
    originalMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
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

  async runAgentTurn(
    agentId: AuditAgent['id'],
    round: number,
    onStatusChange?: (status: string) => void
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
    const allAgents: AuditAgent['id'][] = ['faa-inspector', 'shop-owner', 'isbao-auditor', 'easa-inspector', 'as9100-auditor', 'sms-consultant', 'safety-auditor'];
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
      model: 'claude-sonnet-4-5-20250929',
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
    selectedAgentIds?: AuditAgent['id'][]
  ): Promise<AuditMessage[]> {
    const allAgents: AuditAgent['id'][] = ['faa-inspector', 'shop-owner', 'isbao-auditor', 'easa-inspector', 'as9100-auditor', 'sms-consultant', 'safety-auditor'];
    const turnOrder = selectedAgentIds
      ? allAgents.filter((id) => selectedAgentIds.includes(id))
      : allAgents;

    for (let round = 1; round <= totalRounds; round++) {
      onRoundStart?.(round);

      for (const agentId of turnOrder) {
        const agent = AUDIT_AGENTS.find((a) => a.id === agentId)!;
        onStatusChange?.(`${agent.name} is speaking...`);

        const message = await this.runAgentTurn(agentId, round, onStatusChange);
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
