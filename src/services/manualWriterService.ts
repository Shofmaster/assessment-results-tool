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
  { id: 'part-121-manual', label: 'Part 121 Air Carrier Operations Manual', cfrParts: ['121', '119', '91'], refDocType: 'part-121-manual' },
  { id: 'part-91-manual', label: 'Part 91 General Operating Manual', cfrParts: ['91', '43'], refDocType: 'part-91-manual' },
  { id: 'part-43-manual', label: 'Part 43 Maintenance & Alterations Manual', cfrParts: ['43', '145'], refDocType: 'part-43-manual' },
  { id: 'part-125-manual', label: 'Part 125 Large Aircraft Operations Manual', cfrParts: ['125', '91'], refDocType: 'part-125-manual' },
  { id: 'part-91k-manual', label: 'Part 91K Fractional Ownership Manual', cfrParts: ['91', '119'], refDocType: 'part-91k-manual' },
  { id: 'part-137-manual', label: 'Part 137 Agricultural Operations Manual', cfrParts: ['137'], refDocType: 'part-137-manual' },
  { id: 'part-147-manual', label: 'Part 147 AMT School Manual', cfrParts: ['147', '65'], refDocType: 'part-147-manual' },
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

export interface SectionTemplate {
  title: string;
  number?: string;
  description?: string;
  requiredElements?: string[];
}

const BASE_SECTIONS: Record<string, SectionTemplate[]> = {
  'part-145-manual': [
    { title: 'Housing and Facilities', number: '145.103',
      description: 'Facility requirements including workspace, storage, environmental controls, and segregation of articles.',
      requiredElements: ['Physical workspace description and adequacy', 'Hazardous materials storage and segregation', 'Environmental controls (lighting, ventilation, temperature)', 'Tool and equipment storage', 'Parts segregation (serviceable vs unserviceable)', 'Facility security and access control'] },
    { title: 'Personnel Requirements', number: '145.151',
      description: 'Staffing requirements including sufficient qualified personnel to perform maintenance and required inspections.',
      requiredElements: ['Staffing levels and adequacy for rated work', 'Employee qualifications and certifications', 'Duty time limitations', 'Roster of management and supervisory personnel', 'Language proficiency requirements'] },
    { title: 'Supervisory and Inspection Personnel', number: '145.153',
      description: 'Qualifications and responsibilities for supervisors and inspectors performing required inspections.',
      requiredElements: ['Supervisor qualifications and experience requirements', 'Inspector qualifications and authorizations', 'Designation process for required inspection items (RII)', 'Inspection authority limitations', 'Separation of duties between performer and inspector'] },
    { title: 'Training Requirements', number: '145.163',
      description: 'Initial and recurrent training program for all repair station employees.',
      requiredElements: ['Initial training curriculum and duration', 'Recurrent training frequency and content', 'New process/procedure training', 'Recordkeeping for training completion', 'Competency assessment methods', 'Human factors training'] },
    { title: 'Privileges and Limitations', number: '145.201',
      description: 'Scope of authorized work and any operating limitations for the repair station.',
      requiredElements: ['Authorized ratings and scope of work', 'Limitations on authorized operations', 'Procedures for work outside current ratings', 'Relationship between ratings and capability list'] },
    { title: 'Repair Station Manual', number: '145.207',
      description: 'Requirements for the repair station manual itself including content, distribution, and revision control.',
      requiredElements: ['Manual content requirements per 145.207(a)-(d)', 'Revision and amendment procedures', 'Distribution and accessibility', 'Review and approval process for changes', 'Method for notifying FAA of manual changes'] },
    { title: 'Quality Control System', number: '145.211',
      description: 'Comprehensive quality system covering preliminary, in-process, and final inspections with procedures for detecting and correcting deficiencies.',
      requiredElements: ['Preliminary inspection procedures', 'In-process inspection procedures', 'Final inspection and return-to-service procedures', 'Inspection recording and documentation', 'Procedures for detecting and correcting deficiencies', 'Buy-back / re-inspection procedures', 'Supplier and vendor evaluation'] },
    { title: 'Inspection of Maintenance, Preventive Maintenance, and Alterations', number: '145.213',
      description: 'Procedures for performing and documenting inspections of all maintenance work.',
      requiredElements: ['Required inspection items (RII) identification', 'Inspection procedures for each work type', 'Conformity inspection procedures', 'Inspection documentation requirements', 'Non-routine inspection handling'] },
    { title: 'Capability List', number: '145.215',
      description: 'List of articles, components, and ratings the repair station is authorized to maintain.',
      requiredElements: ['Format and organization of capability list', 'Procedures for adding or removing capabilities', 'Self-evaluation requirements before adding work', 'Notification requirements to certificate-holding district office', 'Relationship to operations specifications'] },
    { title: 'Contract Maintenance', number: '145.217',
      description: 'Requirements and procedures for maintenance performed by or for the repair station under contract.',
      requiredElements: ['Contract maintenance oversight procedures', 'Contractor qualification and evaluation', 'Quality control of contracted work', 'Documentation and recordkeeping for contract work', 'Accountability and return-to-service authority'] },
    { title: 'Recordkeeping', number: '145.219',
      description: 'Record retention, content requirements, and procedures for all maintenance records.',
      requiredElements: ['Types of records maintained', 'Record retention periods', 'Record content requirements', 'Record storage and security', 'Record transfer and disposal procedures', 'Electronic recordkeeping procedures'] },
    { title: 'Service Difficulty Reports', number: '145.221',
      description: 'Procedures for identifying, reporting, and tracking service difficulties and malfunctions.',
      requiredElements: ['Reportable conditions identification', 'SDR filing procedures and timelines', 'Internal tracking and trend analysis', 'Corrective action from reported difficulties', 'Distribution of SDR information to affected personnel'] },
  ],

  'gmm': [
    { title: 'General Policies and Procedures',
      description: 'Overarching policies governing maintenance operations, organizational structure, and management responsibilities.',
      requiredElements: ['Organizational chart and reporting structure', 'Management responsibilities and authorities', 'Safety policy statement', 'Drug and alcohol testing policy', 'Foreign object damage (FOD) prevention'] },
    { title: 'Maintenance Program', number: '145.201',
      description: 'Description of the overall maintenance program including scheduled and unscheduled maintenance procedures.',
      requiredElements: ['Scheduled maintenance intervals and tasks', 'Unscheduled maintenance procedures', 'Airworthiness directive compliance', 'Service bulletin evaluation and implementation', 'Deferred maintenance procedures'] },
    { title: 'Inspection Procedures', number: '145.213',
      description: 'Detailed inspection procedures for all types of maintenance work performed.',
      requiredElements: ['Receiving inspection procedures', 'In-process inspection checkpoints', 'Final inspection and buy-back procedures', 'Required inspection items (RII)', 'Non-destructive testing procedures'] },
    { title: 'Parts and Materials Control',
      description: 'Procedures for receiving, inspecting, storing, issuing, and tracing aircraft parts and materials.',
      requiredElements: ['Incoming parts inspection and documentation', 'Parts storage and shelf life management', 'Serviceable/unserviceable segregation', 'Parts traceability and documentation', 'Suspected unapproved parts (SUP) procedures', 'Hazardous materials handling'] },
    { title: 'Tool and Equipment Control',
      description: 'Management of tools, test equipment, and ground support equipment used in maintenance.',
      requiredElements: ['Tool inventory and accountability', 'Calibration program overview', 'Tool serviceability verification', 'Ground support equipment maintenance', 'Personal tool control policy'] },
    { title: 'Technical Data and Publications',
      description: 'Procedures for obtaining, maintaining, and distributing current technical data.',
      requiredElements: ['Sources of approved technical data', 'Revision and currency procedures', 'Distribution and accessibility', 'Technical library management', 'Manufacturer data and service information handling'] },
    { title: 'Work Order Management',
      description: 'Work order flow from receipt through completion including documentation and tracking.',
      requiredElements: ['Work order initiation and content', 'Work scope development', 'Work in progress tracking', 'Work order documentation requirements', 'Work order closure procedures'] },
    { title: 'Return-to-Service Procedures', number: '43.9',
      description: 'Procedures and authority for approving aircraft or components for return to service after maintenance.',
      requiredElements: ['Return-to-service authority and designations', 'Maintenance release documentation per 43.9', 'Conformity determination procedures', 'Open item resolution requirements', 'Aircraft logbook entry requirements'] },
  ],

  'qcm': [
    { title: 'Quality Control System Overview', number: '145.211',
      description: 'Overview of the quality system including scope, authority, and organizational structure of the QC department.',
      requiredElements: ['Quality department organization and authority', 'Quality policy statement', 'Independence of inspection function', 'Scope of the quality system', 'Quality system flow chart'] },
    { title: 'Preliminary Inspection Procedures',
      description: 'Procedures for initial receiving and preliminary inspection of articles before maintenance begins.',
      requiredElements: ['Receiving inspection criteria and checklist', 'Incoming article condition assessment', 'Documentation verification requirements', 'Discrepancy identification and recording', 'Acceptance/rejection criteria'] },
    { title: 'In-Process Inspection Procedures',
      description: 'Inspection procedures performed during maintenance to verify conformity at critical stages.',
      requiredElements: ['Critical inspection points by work type', 'Inspection hold points and buy-back requirements', 'Non-routine inspection procedures', 'In-process documentation requirements', 'Procedures for discovering hidden damage'] },
    { title: 'Final Inspection and Return-to-Service',
      description: 'Final inspection procedures and criteria for approving articles for return to service.',
      requiredElements: ['Final inspection checklist and criteria', 'Conformity determination procedures', 'Return-to-service documentation per 43.9', 'Airworthiness release preparation', 'Open item and discrepancy resolution'] },
    { title: 'Calibration and Measurement Control',
      description: 'Control of measuring and test equipment including calibration intervals, traceability, and out-of-tolerance handling.',
      requiredElements: ['Calibration interval establishment', 'Calibration standards traceability (NIST)', 'Out-of-tolerance procedures and impact assessment', 'Calibration status identification and labeling', 'Calibration records and certificates'] },
    { title: 'Nonconformance and Corrective Action',
      description: 'Procedures for identifying, documenting, and resolving nonconforming conditions and preventing recurrence.',
      requiredElements: ['Nonconformance identification and documentation', 'Material Review Board procedures', 'Corrective action process (root cause analysis)', 'Preventive action procedures', 'Effectiveness verification', 'Trend analysis and reporting'] },
    { title: 'Audit and Self-Assessment Program',
      description: 'Internal audit program for evaluating compliance with the quality system and regulatory requirements.',
      requiredElements: ['Audit schedule and frequency', 'Auditor qualifications and independence', 'Audit procedures and checklists', 'Findings classification and tracking', 'Corrective action follow-up', 'Management review of audit results'] },
  ],

  'training-program': [
    { title: 'Training Program Administration', number: '145.163',
      description: 'Administration and management of the training program including oversight, scheduling, and resource allocation.',
      requiredElements: ['Training program manager responsibilities', 'Training needs analysis process', 'Training schedule and planning', 'Budget and resource allocation', 'Training program revision procedures'] },
    { title: 'Initial Training',
      description: 'Required training for newly hired employees before performing maintenance or inspection duties.',
      requiredElements: ['General orientation requirements', 'Task-specific technical training', 'Safety and regulatory awareness training', 'Company policies and procedures training', 'Completion criteria and assessment', 'Supervised practice period requirements'] },
    { title: 'Recurrent Training',
      description: 'Periodic refresher training to maintain proficiency and address regulatory changes.',
      requiredElements: ['Recurrent training frequency and intervals', 'Subject matter for recurrent training', 'New regulation and AD awareness training', 'Accident/incident lessons learned', 'Completion tracking and overdue management'] },
    { title: 'On-the-Job Training (OJT)',
      description: 'Structured hands-on training under supervision of qualified personnel.',
      requiredElements: ['OJT program structure and objectives', 'Mentor/trainer qualifications', 'Task sign-off procedures', 'Progressive authorization levels', 'OJT documentation and records'] },
    { title: 'Authorization and Qualification Records',
      description: 'Documentation of employee qualifications, certifications, and training authorizations.',
      requiredElements: ['Employee qualification files content', 'Authorization matrix by task/aircraft type', 'Certification verification procedures', 'Record retention requirements', 'Authorization renewal procedures'] },
    { title: 'Competency Assessment',
      description: 'Methods for evaluating and verifying employee competency in assigned duties.',
      requiredElements: ['Written examination procedures', 'Practical demonstration requirements', 'Assessment scoring criteria and pass/fail thresholds', 'Remedial training for failed assessments', 'Assessment frequency and triggers'] },
  ],

  'part-135-manual': [
    { title: 'General Operations',
      description: 'General policies, organizational structure, and operational control procedures for the certificate holder.',
      requiredElements: ['Organizational chart and management personnel', 'Operational control responsibilities', 'Duties and responsibilities of key personnel', 'Communication and coordination procedures', 'Manual revision and distribution'] },
    { title: 'Flight Operations', number: '135.243',
      description: 'Flight operations procedures including crew duties, flight planning, and operational limitations.',
      requiredElements: ['Pilot-in-command authority and responsibilities', 'Flight planning and dispatch procedures', 'Weather minimums and operational limitations', 'Crew duty and rest requirements', 'MEL/CDL procedures', 'Passenger briefing requirements'] },
    { title: 'Maintenance Program', number: '135.411',
      description: 'Continuous airworthiness maintenance program (CAMP) or approved maintenance program.',
      requiredElements: ['CAMP or approved inspection program details', 'Maintenance schedule and intervals', 'AD and SB compliance procedures', 'MEL/CDL maintenance procedures', 'Maintenance provider oversight', 'Required maintenance records'] },
    { title: 'Aircraft Requirements', number: '135.25',
      description: 'Aircraft equipment, instrument, and airworthiness requirements for operations.',
      requiredElements: ['Required instruments and equipment by operation type', 'Aircraft performance requirements', 'Airworthiness responsibility procedures', 'Inoperative equipment procedures (135.179)', 'Aircraft configuration management'] },
    { title: 'Crew Training', number: '135.341',
      description: 'Training program for flight crew, flight attendants, and other required personnel.',
      requiredElements: ['Initial training curriculum', 'Transition and upgrade training', 'Recurrent training program', 'Check airman qualifications', 'Training records and completion standards', 'Emergency procedures training'] },
    { title: 'Instrument and Equipment Requirements', number: '135.149',
      description: 'Required instruments, equipment, and their maintenance standards for Part 135 operations.',
      requiredElements: ['Required instruments by flight condition (VFR/IFR)', 'Equipment inspection intervals', 'ELT requirements and testing', 'Communication and navigation equipment', 'Emergency equipment requirements'] },
  ],

  'part-121-manual': [
    { title: 'General Policies and Administration', number: '121.133',
      description: 'Organizational policies, administrative procedures, and management responsibilities for air carrier operations.',
      requiredElements: ['Certificate holder organizational structure', 'Key management personnel and qualifications', 'Manual distribution and revision control', 'Operating authority and limitations', 'Deviation and exemption procedures'] },
    { title: 'Flight Operations', number: '121.135',
      description: 'Flight operations procedures for all phases of flight under Part 121.',
      requiredElements: ['Flight preparation and planning procedures', 'Dispatch and flight release procedures', 'En route procedures and fuel requirements', 'Approach and landing procedures', 'Weather minimums by operation type', 'RVSM, ETOPS, and special operations procedures'] },
    { title: 'Dispatch and Operational Control', number: '121.533',
      description: 'Dispatch procedures and operational control responsibilities between dispatch and flight crew.',
      requiredElements: ['Dispatcher authority and responsibilities', 'Dispatch release procedures and content', 'Redispatch and diversion procedures', 'Communication requirements between dispatch and crew', 'Operational control shared responsibilities'] },
    { title: 'Weight and Balance', number: '121.153',
      description: 'Weight and balance control procedures including loading schedules and CG calculations.',
      requiredElements: ['Weight and balance system description', 'Loading schedule procedures', 'CG calculation methods', 'Crew weight standards', 'Cargo loading and restraint procedures', 'Last-minute change procedures'] },
    { title: 'Aircraft Performance', number: '121.189',
      description: 'Aircraft performance data and procedures for takeoff, en route, and landing.',
      requiredElements: ['Takeoff performance calculations', 'En route one-engine-inoperative performance', 'Landing performance and runway analysis', 'Obstacle clearance procedures', 'Performance data sources and limitations'] },
    { title: 'Crew Qualifications and Training', number: '121.400',
      description: 'Flight crew, cabin crew, and dispatcher qualification standards and training programs.',
      requiredElements: ['Pilot qualification and experience requirements', 'Initial, transition, and upgrade training', 'Recurrent and proficiency check requirements', 'Line Oriented Flight Training (LOFT)', 'Cabin crew training program', 'Dispatcher training requirements'] },
    { title: 'Continuous Airworthiness Maintenance Program (CAMP)', number: '121.363',
      description: 'Comprehensive maintenance program for continuous airworthiness of the air carrier fleet.',
      requiredElements: ['Maintenance program content per 121.367', 'Scheduled maintenance intervals and tasks', 'Reliability program', 'AD and SB compliance management', 'Maintenance provider qualifications', 'Required Inspection Items (RII)'] },
    { title: 'Maintenance Organization', number: '121.365',
      description: 'Maintenance department organization including personnel, facilities, and contract maintenance.',
      requiredElements: ['Maintenance organization chart', 'Director of Maintenance qualifications', 'Chief Inspector qualifications and authority', 'Maintenance base and line station capabilities', 'Contract maintenance oversight', 'Maintenance personnel training'] },
    { title: 'MEL and CDL Procedures', number: '121.628',
      description: 'Minimum Equipment List and Configuration Deviation List procedures for dispatch with inoperative items.',
      requiredElements: ['MEL development and approval process', 'Dispatch with inoperative equipment procedures', 'Maintenance actions required by MEL', 'CDL performance penalties application', 'Tracking and time-limited dispatch'] },
    { title: 'Cabin Safety and Emergency Equipment', number: '121.309',
      description: 'Cabin safety equipment requirements and emergency procedures.',
      requiredElements: ['Emergency equipment requirements and locations', 'Emergency exit procedures and assignments', 'Emergency evacuation procedures', 'Emergency equipment inspection intervals', 'Cabin crew emergency duties', 'Passenger safety briefing procedures'] },
    { title: 'Hazardous Materials', number: '121.135(b)(16)',
      description: 'Procedures for acceptance, handling, and transport of hazardous materials.',
      requiredElements: ['Hazmat acceptance and rejection procedures', 'Hazmat training requirements per 49 CFR', 'Packaging and labeling verification', 'Cargo loading compatibility', 'Incident notification procedures', 'Hazmat records and documentation'] },
    { title: 'Security Procedures', number: '121.538',
      description: 'Security procedures for air carrier operations and personnel.',
      requiredElements: ['Aircraft security procedures', 'Crew member security duties', 'Ground security procedures', 'Security training requirements', 'TSA coordination and compliance'] },
    { title: 'Fatigue Risk Management', number: '121.117',
      description: 'Crew member flight time, duty time, and rest requirements.',
      requiredElements: ['Flight time limitations', 'Duty period limitations', 'Rest requirements', 'Fatigue reporting procedures', 'Augmented crew procedures', 'Scheduling practices and policies'] },
    { title: 'Records and Reporting', number: '121.380',
      description: 'Recordkeeping requirements and reporting obligations for the air carrier.',
      requiredElements: ['Maintenance records requirements', 'Flight records and documentation', 'SDR and accident/incident reporting', 'Mechanical reliability reporting', 'Record retention periods', 'Electronic recordkeeping procedures'] },
    { title: 'CASS — Continuing Analysis and Surveillance System', number: '121.373',
      description: 'System for continuous analysis of maintenance and operations data to identify adverse trends.',
      requiredElements: ['Data collection and analysis procedures', 'Reliability program metrics and alerts', 'Trend monitoring and action thresholds', 'Corrective action tracking', 'Management review procedures', 'Interface with maintenance program changes'] },
  ],

  'part-91-manual': [
    { title: 'General Flight Rules', number: '91.103',
      description: 'General operating and flight rules applicable to all operations under Part 91.',
      requiredElements: ['Preflight action and planning requirements', 'Pilot-in-command responsibility and authority', 'Right-of-way rules', 'Speed restrictions and altitude rules', 'Flight plan requirements'] },
    { title: 'Visual Flight Rules (VFR)', number: '91.151',
      description: 'Procedures and requirements specific to VFR operations.',
      requiredElements: ['VFR weather minimums by airspace class', 'VFR fuel requirements', 'VFR cruising altitudes', 'Special VFR procedures', 'VFR flight plan procedures'] },
    { title: 'Instrument Flight Rules (IFR)', number: '91.167',
      description: 'Procedures and requirements specific to IFR operations.',
      requiredElements: ['IFR fuel requirements', 'IFR alternate airport requirements', 'IFR equipment requirements per 91.205', 'IFR approach procedures', 'Lost communications procedures'] },
    { title: 'Equipment and Instruments', number: '91.205',
      description: 'Required instruments and equipment for various types of operations.',
      requiredElements: ['VFR day required instruments', 'VFR night required instruments', 'IFR required instruments', 'Inoperative equipment procedures per 91.213', 'ELT requirements per 91.207'] },
    { title: 'Maintenance and Inspections', number: '91.403',
      description: 'Owner/operator maintenance responsibilities and required inspections.',
      requiredElements: ['Owner/operator maintenance responsibility per 91.403', 'Annual inspection requirements per 91.409', 'Progressive inspection option', '100-hour inspection for hire operations', 'AD compliance procedures', 'Maintenance records requirements per 91.417'] },
    { title: 'Special Operations', number: '91.501',
      description: 'Procedures for special operations including large aircraft, fractional ownership, and international operations.',
      requiredElements: ['Large and turbine-powered aircraft requirements', 'International operations procedures', 'RVSM authorization and procedures', 'Overwater operations requirements', 'Special flight permits'] },
    { title: 'Aircraft Airworthiness', number: '91.403',
      description: 'Procedures for maintaining aircraft airworthiness and compliance with limitations.',
      requiredElements: ['Airworthiness responsibility', 'Compliance with type design and limitations', 'ATC transponder and altimeter checks per 91.411/413', 'ELT inspections per 91.207', 'Life-limited component tracking'] },
    { title: 'Operational Limitations', number: '91.9',
      description: 'Aircraft operating limitations and required documents aboard the aircraft.',
      requiredElements: ['Operating limitations compliance', 'Required documents aboard aircraft', 'Aircraft flight manual requirements', 'Weight and balance requirements', 'Placards and markings'] },
  ],

  'part-43-manual': [
    { title: 'Eligibility and Authorization', number: '43.3',
      description: 'Who is authorized to perform maintenance, preventive maintenance, and alterations.',
      requiredElements: ['Persons authorized to perform maintenance per 43.3', 'Holder of mechanic certificate authorizations', 'Repair station authorization scope', 'Manufacturer authorization', 'Pilot preventive maintenance authority per 43.7'] },
    { title: 'Performance Rules', number: '43.13',
      description: 'Standards and methods for performing maintenance, preventive maintenance, and alterations.',
      requiredElements: ['Acceptable methods, techniques, and practices', 'Approved data requirements', 'Manufacturer instructions compliance', 'AC 43.13 application guidelines', 'Performance standards by work type'] },
    { title: 'Approval for Return to Service', number: '43.9',
      description: 'Requirements for approving aircraft, airframes, aircraft engines, propellers, and appliances for return to service.',
      requiredElements: ['Who may approve return to service', 'Maintenance record entry requirements per 43.9', 'Content of maintenance entries', 'Form 337 requirements for major repairs/alterations', 'Airworthiness release requirements'] },
    { title: 'Major and Minor Classification', number: '43.Appendix A',
      description: 'Classification of repairs and alterations as major or minor and their respective requirements.',
      requiredElements: ['Major repair definition and examples', 'Major alteration definition and examples', 'Minor repair/alteration criteria', 'Approved data requirements for major work', 'FAA Form 337 procedures', 'DER/DAR involvement requirements'] },
    { title: 'Preventive Maintenance', number: '43.Appendix A',
      description: 'Scope and procedures for preventive maintenance items.',
      requiredElements: ['List of preventive maintenance items per Appendix A', 'Pilot-authorized preventive maintenance', 'Documentation requirements', 'Limitations and restrictions'] },
    { title: 'Maintenance Records', number: '43.11',
      description: 'Content and format requirements for maintenance records.',
      requiredElements: ['Required content of maintenance entries per 43.11', 'Signature and certificate requirements', 'Record retention requirements', 'Record format (paper and electronic)', 'Major repair/alteration record forms', 'Total time and cycle tracking'] },
  ],

  'part-125-manual': [
    { title: 'General Operations', number: '125.1',
      description: 'General policies and operational procedures for large airplane operations under Part 125.',
      requiredElements: ['Applicability and operator responsibilities', 'Organizational structure and personnel', 'Manual content and distribution', 'Operations specifications', 'Deviation authority'] },
    { title: 'Flight Operations', number: '125.261',
      description: 'Flight operations procedures including crew duties, flight planning, and limitations.',
      requiredElements: ['Flight preparation and planning', 'Pilot-in-command authority', 'Weather minimums and limitations', 'En route procedures', 'Approach and landing procedures', 'Passenger information and briefings'] },
    { title: 'Maintenance Program', number: '125.243',
      description: 'Maintenance program for continuous airworthiness under Part 125.',
      requiredElements: ['Inspection program description', 'Maintenance schedule and intervals', 'Required inspection personnel', 'AD compliance procedures', 'Maintenance records requirements', 'Maintenance provider oversight'] },
    { title: 'Crew Training', number: '125.287',
      description: 'Training requirements for flight crew including initial and recurrent training.',
      requiredElements: ['Pilot training curriculum', 'Initial and recurrent training requirements', 'Check ride and proficiency check procedures', 'Emergency procedures training', 'Crew resource management training'] },
    { title: 'Aircraft Equipment', number: '125.203',
      description: 'Instrument and equipment requirements for Part 125 operations.',
      requiredElements: ['Required instruments and equipment', 'Emergency equipment requirements', 'Communication and navigation equipment', 'Equipment inspection requirements', 'Inoperative equipment procedures'] },
    { title: 'Weight and Balance', number: '125.91',
      description: 'Weight and balance procedures for large aircraft operations.',
      requiredElements: ['Weight and balance system description', 'Loading schedule procedures', 'CG computation methods', 'Maximum weight limitations', 'Cargo loading and restraint'] },
    { title: 'MEL Procedures', number: '125.201',
      description: 'Minimum Equipment List procedures for operations with inoperative items.',
      requiredElements: ['MEL authorization and approval', 'Dispatch with inoperative equipment', 'Required crew member notification', 'Maintenance actions and time limits', 'Performance adjustments'] },
    { title: 'Records and Reports', number: '125.401',
      description: 'Recordkeeping and reporting requirements for Part 125 operations.',
      requiredElements: ['Maintenance records requirements', 'Flight records and load manifests', 'Mechanical interruption reports', 'Record retention periods', 'Accident/incident reporting'] },
  ],

  'part-91k-manual': [
    { title: 'Program Management', number: '91.1003',
      description: 'Fractional ownership program management responsibilities and structure.',
      requiredElements: ['Program manager duties and authority', 'Fractional ownership agreement requirements', 'Management specifications', 'Operational control procedures', 'Program manager qualifications'] },
    { title: 'Operational Control', number: '91.1009',
      description: 'Operational control procedures between program manager and fractional owners.',
      requiredElements: ['Operational control responsibilities', 'Flight assignment and scheduling', 'Pilot-in-command authority', 'Deviation procedures', 'Owner notification requirements'] },
    { title: 'Flight Operations', number: '91.1037',
      description: 'Flight operations procedures specific to fractional ownership operations.',
      requiredElements: ['Preflight and flight planning procedures', 'Weather minimums and limitations', 'MEL procedures', 'Passenger service procedures', 'International operations'] },
    { title: 'Crew Qualifications and Training', number: '91.1059',
      description: 'Training requirements for crew members in fractional ownership programs.',
      requiredElements: ['Pilot qualifications and experience', 'Initial and recurrent training', 'Proficiency checks', 'Emergency training', 'Crew duty and rest'] },
    { title: 'Maintenance Program', number: '91.1411',
      description: 'Continuous airworthiness maintenance program for fractional ownership aircraft.',
      requiredElements: ['CAMP requirements and procedures', 'Inspection program details', 'AD compliance management', 'Maintenance records', 'Maintenance provider oversight'] },
    { title: 'Drug and Alcohol Testing', number: '91.1045',
      description: 'Drug and alcohol testing program requirements for fractional ownership programs.',
      requiredElements: ['Testing program description', 'Covered employees', 'Testing procedures and types', 'Reporting and recordkeeping', 'Employee assistance program'] },
  ],

  'part-137-manual': [
    { title: 'Certification and Operations', number: '137.11',
      description: 'Agricultural aircraft operator certification requirements and operational procedures.',
      requiredElements: ['Certificate requirements and application', 'Operating limitations', 'Personnel requirements', 'Aircraft requirements', 'Operating rules and procedures'] },
    { title: 'Dispensing Operations', number: '137.29',
      description: 'Procedures for safe dispensing of agricultural materials.',
      requiredElements: ['Dispensing equipment requirements', 'Loading procedures and weight limits', 'Application procedures by material type', 'Non-target area protection', 'Emergency dump procedures'] },
    { title: 'Aircraft Requirements', number: '137.31',
      description: 'Aircraft airworthiness and equipment requirements for agricultural operations.',
      requiredElements: ['Aircraft type and configuration requirements', 'Required equipment', 'Aircraft inspection requirements', 'Dispersal equipment maintenance', 'Aircraft operating limitations'] },
    { title: 'Safety and Hazard Procedures', number: '137.41',
      description: 'Safety procedures for agricultural operations including chemical handling and congested area operations.',
      requiredElements: ['Chemical handling safety procedures', 'Congested area operations per 137.49', 'Personnel protective equipment', 'Emergency procedures', 'Environmental protection measures'] },
    { title: 'Records and Reports', number: '137.71',
      description: 'Recordkeeping requirements for agricultural operations.',
      requiredElements: ['Operating records requirements', 'Aircraft maintenance records', 'Chemical application records', 'Accident/incident reporting', 'Record retention periods'] },
  ],

  'part-147-manual': [
    { title: 'School Certification', number: '147.3',
      description: 'Certification requirements and standards for aviation maintenance technician schools.',
      requiredElements: ['Certification requirements and ratings', 'School location and satellite facilities', 'Advisory circular compliance', 'Certificate duration and renewal', 'School management structure'] },
    { title: 'Curriculum and Instruction', number: '147.21',
      description: 'Curriculum requirements for A&P certification training.',
      requiredElements: ['General curriculum requirements', 'Airframe curriculum per Appendix B', 'Powerplant curriculum per Appendix C', 'Minimum instruction hours', 'Curriculum revision procedures', 'Practical project requirements'] },
    { title: 'Facilities and Equipment', number: '147.15',
      description: 'Facility, equipment, and material requirements for AMT schools.',
      requiredElements: ['Classroom and shop facilities', 'Training aids and equipment', 'Aircraft and engine availability', 'Current technical data requirements', 'Safety equipment and environment'] },
    { title: 'Instructors and Staff', number: '147.17',
      description: 'Instructor qualification and staffing requirements.',
      requiredElements: ['Instructor qualifications and certifications', 'Student-to-instructor ratios', 'Instructor training and development', 'Guest lecturer qualifications', 'Support staff requirements'] },
    { title: 'Student Records and Testing', number: '147.31',
      description: 'Student enrollment, records, testing, and graduation requirements.',
      requiredElements: ['Enrollment requirements and procedures', 'Attendance tracking', 'Testing procedures and standards', 'Grading criteria and pass/fail thresholds', 'Graduation requirements', 'Record retention and transcripts'] },
    { title: 'Quality Assurance', number: '147.35',
      description: 'Quality assurance procedures for maintaining school standards.',
      requiredElements: ['Quality assurance program description', 'Self-audit procedures', 'Student and employer feedback', 'Corrective action procedures', 'FAA surveillance coordination'] },
  ],

  'sms-manual': [
    { title: 'Safety Policy and Objectives',
      description: 'Top-level safety policy statement, objectives, and management commitment to safety.',
      requiredElements: ['Accountable executive designation', 'Safety policy statement and commitments', 'Safety objectives and performance targets', 'Safety reporting policy (non-punitive)', 'Resource allocation for safety', 'Management review of safety performance'] },
    { title: 'Safety Risk Management',
      description: 'Systematic process for identifying hazards, assessing risk, and implementing mitigations.',
      requiredElements: ['Hazard identification methods and sources', 'Risk assessment methodology (probability x severity)', 'Risk matrix and acceptance criteria', 'Risk mitigation strategies and controls', 'Change management process', 'Documentation of risk decisions'] },
    { title: 'Safety Assurance',
      description: 'Processes for monitoring, measuring, and continuously improving safety performance.',
      requiredElements: ['Safety performance monitoring (SPIs/SPTs)', 'Internal audit and evaluation program', 'Management of change procedures', 'Continuous improvement processes', 'Corrective action tracking', 'Regulatory compliance monitoring'] },
    { title: 'Safety Promotion',
      description: 'Training, communication, and awareness programs that support safety culture.',
      requiredElements: ['Safety training program', 'Safety communication channels', 'Safety awareness campaigns', 'Lessons learned dissemination', 'Safety culture assessment methods', 'Employee safety engagement'] },
    { title: 'SPI/SPT Tables',
      description: 'Safety Performance Indicators and Safety Performance Targets with measurement criteria.',
      requiredElements: ['SPI definitions and data sources', 'SPT values and alert thresholds', 'Measurement frequency and methodology', 'Trend analysis procedures', 'Action triggers when SPTs are breached', 'Annual review and adjustment procedures'] },
    { title: 'Hazard Register',
      description: 'Living register of identified hazards, their risk assessments, and current mitigations.',
      requiredElements: ['Hazard identification number and description', 'Risk assessment for each hazard', 'Current mitigation controls', 'Residual risk rating', 'Hazard owner assignment', 'Review and update procedures'] },
    { title: 'Emergency Response Plan',
      description: 'Procedures for responding to emergencies and transitioning from normal to emergency operations.',
      requiredElements: ['Emergency response organization and roles', 'Emergency classification levels', 'Notification and communication procedures', 'Coordination with external agencies', 'Recovery and return to normal operations', 'Post-event investigation and reporting'] },
  ],

  'ops-specs': [
    { title: 'General Authority',
      description: 'Operations specifications defining the general authority and limitations of the certificate holder.',
      requiredElements: ['Certificate holder identification and type', 'Types of operations authorized', 'Management personnel requirements', 'Operations specifications issuance and amendments', 'Letter of authorization procedures'] },
    { title: 'Aircraft Authorizations',
      description: 'Specific aircraft types, registrations, and configurations authorized for operations.',
      requiredElements: ['Authorized aircraft types and series', 'Aircraft registration requirements', 'Authorized configurations', 'Special equipment authorizations', 'Aircraft interchange agreements'] },
    { title: 'Operational Limitations',
      description: 'Specific limitations on operations including weather, airports, and special authorizations.',
      requiredElements: ['IFR/VFR operation authorizations', 'Special airport authorizations', 'RVSM authorization', 'ETOPS authorization and procedures', 'RNP/RNAV authorizations', 'Category II/III approach authorizations'] },
    { title: 'Maintenance Authorizations',
      description: 'Authorized maintenance programs, facilities, and contract maintenance arrangements.',
      requiredElements: ['Authorized maintenance program type (CAMP/other)', 'Approved maintenance facilities', 'Contract maintenance authorizations', 'Required maintenance items', 'Maintenance program revisions'] },
  ],

  'ipm': [
    { title: 'Inspection Program Overview',
      description: 'Overview of the inspection program including scope, authority, and organizational structure.',
      requiredElements: ['Inspection program scope and applicability', 'Inspection authority hierarchy', 'Types of inspections performed', 'Inspector qualifications and authorizations', 'Inspection program revision procedures'] },
    { title: 'Inspection Procedures by Work Type',
      description: 'Specific inspection procedures for each type of maintenance work performed.',
      requiredElements: ['Airframe inspection procedures', 'Engine/powerplant inspection procedures', 'Avionics/electrical inspection procedures', 'Component and accessory inspection procedures', 'NDT inspection procedures', 'Conformity inspection procedures'] },
    { title: 'Calibration Requirements',
      description: 'Calibration requirements for all inspection and test equipment used in the inspection program.',
      requiredElements: ['Calibration program scope', 'Calibration intervals and justification', 'Calibration standards traceability', 'Out-of-tolerance handling procedures', 'Calibration records and labeling'] },
    { title: 'Records and Documentation',
      description: 'Record and documentation requirements for all inspections performed.',
      requiredElements: ['Inspection record content requirements', 'Documentation format and procedures', 'Record retention and storage', 'Discrepancy recording procedures', 'Statistical data collection and trend analysis'] },
  ],

  'hazmat-manual': [
    { title: 'Hazmat Handling Procedures',
      description: 'Procedures for safe handling, storage, and transport of hazardous materials in aviation.',
      requiredElements: ['Hazmat classification and identification', 'Acceptance and rejection procedures', 'Packaging, marking, and labeling requirements per 49 CFR', 'Storage requirements and compatibility', 'Loading and unloading procedures', 'Spill and leakage procedures'] },
    { title: 'Training Requirements',
      description: 'Training program for personnel involved in hazardous materials handling and transport.',
      requiredElements: ['Initial training curriculum per 49 CFR 172.704', 'Recurrent training frequency (24 months)', 'Function-specific training by job role', 'Security awareness training', 'Training records and documentation', 'Testing and competency verification'] },
    { title: 'Emergency Procedures',
      description: 'Emergency response procedures for hazardous materials incidents.',
      requiredElements: ['Emergency response plan and organization', 'Incident notification procedures', 'Spill containment and cleanup procedures', 'Personnel protective equipment', 'Medical response procedures', 'Post-incident reporting and investigation'] },
  ],

  'tool-calibration': [
    { title: 'Calibration Program Overview',
      description: 'Overview of the calibration program including scope, standards, and organizational responsibilities.',
      requiredElements: ['Program scope and applicability', 'Calibration authority and responsibilities', 'Reference standard hierarchy (NIST traceability)', 'Calibration environment requirements', 'Program review and audit procedures'] },
    { title: 'Calibration Intervals and Procedures',
      description: 'Interval determination and detailed calibration procedures for each equipment type.',
      requiredElements: ['Interval determination methodology', 'Calibration procedures by equipment type', 'Calibration adjustment criteria', 'Environmental condition requirements during calibration', 'Pass/fail criteria and tolerances'] },
    { title: 'Out-of-Tolerance Procedures',
      description: 'Procedures for handling equipment found outside acceptable tolerance limits.',
      requiredElements: ['Out-of-tolerance identification and quarantine', 'Impact assessment of work performed with OOT equipment', 'Recall and re-inspection procedures', 'Root cause analysis requirements', 'Customer notification procedures', 'Documentation and trend tracking'] },
    { title: 'Records and Traceability',
      description: 'Calibration record requirements and traceability chain for all measured values.',
      requiredElements: ['Calibration certificate content requirements', 'Traceability chain documentation', 'Equipment identification and labeling', 'Calibration history records', 'Record retention periods', 'Electronic records management'] },
  ],
};

const STANDARD_SECTIONS: Record<string, SectionTemplate[]> = {
  isbao: [
    { title: 'IS-BAO SMS Requirements', number: 'IS-BAO §3',
      description: 'Safety management system requirements specific to IS-BAO standards for business aviation.',
      requiredElements: ['Safety policy compliant with IS-BAO §3', 'Safety risk management process', 'Safety assurance monitoring', 'Safety promotion activities', 'IS-BAO stage compliance (I, II, or III)'] },
    { title: 'Maintenance and Airworthiness', number: 'IS-BAO §5',
      description: 'Maintenance standards and airworthiness management per IS-BAO Section 5.',
      requiredElements: ['Continuing airworthiness management', 'Maintenance program compliance', 'MEL procedures per IS-BAO', 'Aircraft status and tracking', 'Approved maintenance organization requirements'] },
    { title: 'Approved Maintenance Organization', number: 'IS-BAO §5.3',
      description: 'Requirements for maintenance organizations providing services to IS-BAO operators.',
      requiredElements: ['AMO qualification criteria', 'Oversight and audit procedures', 'Quality system requirements', 'Contract maintenance controls', 'Performance monitoring'] },
  ],
  as9100: [
    { title: 'AS9110 Operational Planning', number: 'AS9110 8.1',
      description: 'Operational planning and control requirements per AS9110 for MRO organizations.',
      requiredElements: ['Operational planning process', 'Risk and opportunity assessment for operations', 'Resource planning and allocation', 'Work order and job planning procedures', 'Configuration management'] },
    { title: 'AS9110 Production and Service Provision', number: 'AS9110 8.5',
      description: 'Production and service provision controls for aerospace MRO under AS9110.',
      requiredElements: ['Controlled conditions for maintenance', 'Identification and traceability', 'Customer and external provider property', 'Preservation of outputs', 'Post-delivery activities', 'Control of changes'] },
    { title: 'AS9110 Release of Products and Services', number: 'AS9110 8.6',
      description: 'Release criteria and procedures for returning products and services per AS9110.',
      requiredElements: ['Release authority and criteria', 'Inspection and test requirements before release', 'Conformity documentation', 'Traceability to authorization', 'Customer acceptance criteria'] },
    { title: 'AS9100D Risk-Based Thinking', number: 'AS9100D 6.1',
      description: 'Risk-based thinking and planning per AS9100D Clause 6.1.',
      requiredElements: ['Risk and opportunity identification process', 'Risk assessment methodology', 'Actions to address risks and opportunities', 'Integration with quality management system', 'Effectiveness evaluation of risk actions'] },
    { title: 'AS9100D Performance Evaluation', number: 'AS9100D 9',
      description: 'Performance monitoring, measurement, analysis, and evaluation per AS9100D Clause 9.',
      requiredElements: ['Customer satisfaction measurement', 'Internal audit program', 'Management review inputs and outputs', 'KPI monitoring and analysis', 'On-time delivery performance', 'Nonconformance and corrective action metrics'] },
  ],
  wyvern: [
    { title: 'Vendor Qualification Program',
      description: 'Procedures for qualifying, evaluating, and monitoring maintenance vendors and suppliers.',
      requiredElements: ['Vendor evaluation criteria and scoring', 'Initial qualification audit procedures', 'Ongoing performance monitoring', 'Vendor approval and disapproval process', 'Approved vendor list management'] },
    { title: 'Parts Traceability and Documentation',
      description: 'Complete traceability chain for aircraft parts from procurement through installation.',
      requiredElements: ['Parts documentation requirements (8130-3, EASA Form 1)', 'Traceability chain verification', 'Suspected unapproved parts procedures', 'Parts pooling and exchange documentation', 'Serialized parts tracking'] },
    { title: 'Technician Training Currency',
      description: 'Training currency and proficiency requirements aligned with Wyvern/ARGUS standards.',
      requiredElements: ['Currency requirements by task type', 'Proficiency check intervals', 'Training currency tracking system', 'Expired currency remediation', 'Cross-training and multi-type qualifications'] },
    { title: 'Tool Calibration and Equipment',
      description: 'Tool calibration program meeting Wyvern/ARGUS audit standards.',
      requiredElements: ['Calibration program scope per Wyvern standards', 'Calibration interval management', 'Out-of-tolerance impact procedures', 'Calibration records and certificates', 'Measurement uncertainty considerations'] },
  ],
  sms: [
    { title: 'ICAO Safety Policy and Objectives', number: 'ICAO Pillar 1',
      description: 'Safety policy, objectives, and management commitment per ICAO Doc 9859 Component 1.',
      requiredElements: ['Management commitment and responsibility', 'Safety accountabilities', 'Appointment of key safety personnel', 'Emergency response planning coordination', 'SMS documentation and records'] },
    { title: 'ICAO Safety Risk Management', number: 'ICAO Pillar 2',
      description: 'Hazard identification and risk assessment per ICAO Doc 9859 Component 2.',
      requiredElements: ['Hazard identification process', 'Safety risk assessment and mitigation', 'Risk acceptance criteria matrix', 'Change management integration', 'Safety risk documentation'] },
    { title: 'ICAO Safety Assurance', number: 'ICAO Pillar 3',
      description: 'Safety performance monitoring and continuous improvement per ICAO Doc 9859 Component 3.',
      requiredElements: ['Safety performance monitoring indicators', 'Management of change', 'Continuous improvement of the SMS', 'Internal safety investigations', 'Safety audits and surveys'] },
    { title: 'ICAO Safety Promotion', number: 'ICAO Pillar 4',
      description: 'Safety training and communication per ICAO Doc 9859 Component 4.',
      requiredElements: ['Safety training and education', 'Safety communication', 'Safety culture development', 'Information sharing and lessons learned', 'SMS awareness for all personnel'] },
  ],
  easa: [
    { title: 'EASA Maintenance Organisation Exposition (MOE)', number: 'AMC 145.A.70',
      description: 'Maintenance Organisation Exposition content and management per EASA Part-145.',
      requiredElements: ['MOE structure per AMC 145.A.70', 'Corporate commitment and safety policy', 'Scope of work description', 'Notification procedures to competent authority', 'MOE amendment procedures'] },
    { title: 'EASA Certifying Staff', number: 'EASA 145.A.30',
      description: 'Certifying staff requirements, qualifications, and authorization procedures under EASA.',
      requiredElements: ['Certifying staff qualification requirements', 'Type rating and authorization procedures', 'Continuation training requirements', 'Authorization limitations and scope', 'Certifying staff records'] },
    { title: 'EASA Quality System', number: 'EASA 145.A.65',
      description: 'Quality system requirements for EASA Part-145 approved organizations.',
      requiredElements: ['Quality audit program (independent)', 'Quality feedback and corrective action system', 'Quality monitoring of maintenance activities', 'Supplier and subcontractor quality assessment', 'Safety and quality policy integration'] },
  ],
  nasa: [
    { title: 'NASA Workmanship Standards', number: 'NASA-STD-8739',
      description: 'Workmanship standards for soldering, crimping, and other processes per NASA standards.',
      requiredElements: ['Applicable NASA workmanship standards identification', 'Process control procedures', 'Inspection criteria and acceptance standards', 'Training and certification requirements', 'Non-conformance handling per NASA requirements'] },
    { title: 'NASA Safety Reporting',
      description: 'Safety reporting procedures aligned with NASA safety requirements.',
      requiredElements: ['NASA safety reporting channels', 'Mishap reporting procedures', 'Close-call and hazard reporting', 'Investigation and corrective action', 'Integration with SMS safety reporting'] },
  ],
  nbaa: [
    { title: 'NBAA Business Aviation Safety Criteria',
      description: 'Safety criteria and best practices per NBAA Management Guide and safety standards.',
      requiredElements: ['NBAA safety program elements', 'Management responsibility for safety', 'Safety risk management practices', 'Emergency response procedures', 'Safety performance metrics'] },
    { title: 'NBAA Maintenance Best Practices',
      description: 'Maintenance best practices per NBAA guidance for business aviation.',
      requiredElements: ['Maintenance program best practices', 'Vendor and facility selection criteria', 'Parts quality and traceability standards', 'Maintenance records management', 'Continuing airworthiness oversight'] },
  ],
  'faa-sas': [
    { title: 'DCT — Management Responsibility', number: 'SAS Safety Attribute 1',
      description: 'Design/Performance DCT for Safety Attribute 1: Management assigns authority and responsibility for safety.',
      requiredElements: ['Management safety responsibility statement', 'Safety authority delegation', 'Resource allocation for safety', 'Safety accountability chain', 'Management safety review process'] },
    { title: 'DCT — Management Authority', number: 'SAS Safety Attribute 2',
      description: 'Design/Performance DCT for Safety Attribute 2: Management authority structures supporting safety compliance.',
      requiredElements: ['Authority structure documentation', 'Decision-making authority levels', 'Safety authority independent of production', 'Authority to stop work for safety', 'Regulatory compliance authority'] },
    { title: 'DCT — Procedures', number: 'SAS Safety Attribute 3',
      description: 'Design/Performance DCT for Safety Attribute 3: Documented procedures that control safety-related processes.',
      requiredElements: ['Procedure development and approval process', 'Procedure distribution and accessibility', 'Procedure revision control', 'Employee compliance monitoring', 'Procedure effectiveness evaluation'] },
    { title: 'DCT — Controls (Design DCTs)', number: 'SAS Safety Attribute 4',
      description: 'Design/Performance DCT for Safety Attribute 4: Controls that detect and correct deviations from procedures.',
      requiredElements: ['Process control mechanisms', 'Deviation detection methods', 'Corrective action procedures', 'Quality control integration', 'Real-time monitoring capabilities'] },
    { title: 'DCT — Process Measurement (Design DCTs)', number: 'SAS Safety Attribute 5',
      description: 'Design/Performance DCT for Safety Attribute 5: Measurement of process outputs to verify safety compliance.',
      requiredElements: ['Process measurement criteria and methods', 'Data collection and analysis procedures', 'Performance benchmarks and thresholds', 'Trend analysis and reporting', 'Feedback loop to process improvement'] },
    { title: 'DCT — Interfaces', number: 'SAS Safety Attribute 6',
      description: 'Design/Performance DCT for Safety Attribute 6: Management of interfaces between organizational elements.',
      requiredElements: ['Internal interface identification', 'External interface management', 'Communication protocols between units', 'Handoff and coordination procedures', 'Interface risk management'] },
    { title: 'DCT — Safety Ownership', number: 'SAS Safety Attribute 7',
      description: 'Design/Performance DCT for Safety Attribute 7: Employees demonstrate safety ownership in daily operations.',
      requiredElements: ['Employee safety responsibilities', 'Safety reporting culture', 'Safety observation programs', 'Employee safety engagement metrics', 'Recognition and accountability'] },
    { title: 'DCT — Safety Risk Management (SRM)', number: 'SAS 4.6 SMS',
      description: 'SRM component of SAS Element 4.6 for SMS-integrated safety analysis.',
      requiredElements: ['Hazard identification process', 'Risk analysis methodology', 'Risk assessment and prioritization', 'Risk control and mitigation', 'Safety risk documentation and tracking'] },
    { title: 'DCT — Safety Assurance (SA)', number: 'SAS 4.6 SMS',
      description: 'SA component of SAS Element 4.6 for continuous safety monitoring and improvement.',
      requiredElements: ['Safety performance monitoring', 'Safety data analysis', 'System assessment and audit', 'Corrective action effectiveness', 'Continuous improvement mechanisms'] },
  ],
};

export function getSectionTemplates(
  manualType: string,
  activeStandards: string[]
): SectionTemplate[] {
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
  /** 1-2 sentence scope description for the section being generated. */
  sectionDescription?: string;
  /** Must-include content elements for the section. */
  sectionRequiredElements?: string[];
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

  // Inject section scope and required elements when available
  if (ctx.sectionDescription || (ctx.sectionRequiredElements && ctx.sectionRequiredElements.length > 0)) {
    let scopeBlock = `SECTION SCOPE AND REQUIRED ELEMENTS:\nSection: "${ctx.sectionTitle}"${ctx.sectionNumber ? ` (${ctx.sectionNumber})` : ''}`;
    if (ctx.sectionDescription) {
      scopeBlock += `\nScope: ${ctx.sectionDescription}`;
    }
    if (ctx.sectionRequiredElements && ctx.sectionRequiredElements.length > 0) {
      scopeBlock += `\n\nThe following elements MUST be addressed in this section:\n${ctx.sectionRequiredElements.map((el, i) => `${i + 1}. ${el}`).join('\n')}`;
      scopeBlock += `\n\nDo NOT omit any required element. If organization-specific details are unavailable, provide a procedural framework the organization can customize.`;
    }
    sections.push(scopeBlock);
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
