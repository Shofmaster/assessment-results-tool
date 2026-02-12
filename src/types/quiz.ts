// ── Quiz Question & Answer Types ──

export interface QuizOption {
  value: string;
  label: string;
  flagWeight: number; // 0 = no concern, 1 = minor, 2 = major flag
}

export interface QuizQuestion {
  id: string;
  field: string;
  question: string;
  flagArea: string;
  flagLabel: string;
  options: QuizOption[];
}

export interface QuizAnswers {
  [field: string]: string;
}

export interface FlaggedArea {
  area: string;
  label: string;
  severity: 'high' | 'medium';
  description: string;
}

export interface LeadInfo {
  email: string;
  companyName: string;
  contactName: string;
  phone: string;
  consentToContact: boolean;
}

export interface QuizSubmission extends LeadInfo {
  quizAnswers: QuizAnswers;
  flaggedAreas: string[];
  requestedFullReview?: boolean;
  createdAt: string;
}

// ── Quiz Question Definitions (10 questions) ──

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    field: 'hasSMS',
    question: 'Do you have a formal Safety Management System (SMS)?',
    flagArea: 'sms',
    flagLabel: 'Safety Management System',
    options: [
      { value: 'yes_full', label: 'Yes — fully implemented and documented', flagWeight: 0 },
      { value: 'yes_partial', label: 'Partially — in development or informal', flagWeight: 1 },
      { value: 'no', label: 'No', flagWeight: 2 },
      { value: 'not_sure', label: 'Not sure', flagWeight: 2 },
    ],
  },
  {
    id: 'q2',
    field: 'capaSystemStatus',
    question: 'Do you have documented CAPA (corrective action) procedures?',
    flagArea: 'capa',
    flagLabel: 'Corrective Action (CAPA)',
    options: [
      { value: 'fully_documented', label: 'Yes — fully documented and implemented', flagWeight: 0 },
      { value: 'partially_documented', label: 'Partially documented', flagWeight: 1 },
      { value: 'none', label: 'No documented CAPA procedures', flagWeight: 2 },
      { value: 'not_sure', label: 'Not sure', flagWeight: 2 },
    ],
  },
  {
    id: 'q3',
    field: 'trainingTracking',
    question: 'How do you track technician training and competency?',
    flagArea: 'training',
    flagLabel: 'Training & Competency',
    options: [
      { value: 'digital_system', label: 'Digital training management system', flagWeight: 0 },
      { value: 'spreadsheets', label: 'Spreadsheets or basic tracking', flagWeight: 1 },
      { value: 'paper', label: 'Paper-based records', flagWeight: 2 },
      { value: 'none', label: 'No formal tracking', flagWeight: 2 },
    ],
  },
  {
    id: 'q4',
    field: 'hasDefinedProcess',
    question: 'Do you have defined processes for your core operations?',
    flagArea: 'process',
    flagLabel: 'Process & Workflow',
    options: [
      { value: 'yes_documented', label: 'Yes — all documented and followed', flagWeight: 0 },
      { value: 'some_documented', label: 'Some documented, some informal', flagWeight: 1 },
      { value: 'ad_hoc', label: 'Mostly ad-hoc / tribal knowledge', flagWeight: 2 },
      { value: 'none', label: 'No defined processes', flagWeight: 2 },
    ],
  },
  {
    id: 'q5',
    field: 'workOrderSystem',
    question: 'What system do you use for work orders?',
    flagArea: 'workflow',
    flagLabel: 'Work Order Management',
    options: [
      { value: 'digital_mro', label: 'Digital MRO / ERP system', flagWeight: 0 },
      { value: 'basic_software', label: 'Basic software or spreadsheets', flagWeight: 1 },
      { value: 'paper', label: 'Paper-based system', flagWeight: 2 },
      { value: 'none', label: 'No formal system', flagWeight: 2 },
    ],
  },
  {
    id: 'q6',
    field: 'toolControlMethod',
    question: 'How do you manage tool control and accountability?',
    flagArea: 'toolControl',
    flagLabel: 'Tool Control',
    options: [
      { value: 'electronic', label: 'Electronic tracking / RFID system', flagWeight: 0 },
      { value: 'shadow_boards', label: 'Shadow boards and manual logs', flagWeight: 1 },
      { value: 'informal', label: 'Informal / ad-hoc methods', flagWeight: 2 },
      { value: 'none', label: 'No tool control program', flagWeight: 2 },
    ],
  },
  {
    id: 'q7',
    field: 'calibrationProgram',
    question: 'Do you have a calibration program for measuring equipment?',
    flagArea: 'calibration',
    flagLabel: 'Calibration Program',
    options: [
      { value: 'formal', label: 'Yes — formal program with tracking', flagWeight: 0 },
      { value: 'informal', label: 'Informal tracking (spreadsheets, etc.)', flagWeight: 1 },
      { value: 'none', label: 'No calibration program', flagWeight: 2 },
      { value: 'not_applicable', label: 'Not applicable to our operations', flagWeight: 0 },
    ],
  },
  {
    id: 'q8',
    field: 'qualityMethodologies',
    question: 'What quality methodologies do you use?',
    flagArea: 'quality',
    flagLabel: 'Quality Management',
    options: [
      { value: 'multiple', label: 'Multiple (ISO 9001, AS9100, Lean, Six Sigma, etc.)', flagWeight: 0 },
      { value: 'one', label: 'One formal methodology', flagWeight: 0 },
      { value: 'basic', label: 'Basic quality checks only', flagWeight: 1 },
      { value: 'none', label: 'No formal quality methodology', flagWeight: 2 },
    ],
  },
  {
    id: 'q9',
    field: 'continuousImprovementActive',
    question: 'Is continuous improvement actively pursued at your organization?',
    flagArea: 'improvement',
    flagLabel: 'Continuous Improvement',
    options: [
      { value: 'active_program', label: 'Yes — active program with metrics', flagWeight: 0 },
      { value: 'occasional', label: 'Occasionally — when issues arise', flagWeight: 1 },
      { value: 'no', label: 'No formal improvement program', flagWeight: 2 },
      { value: 'not_sure', label: 'Not sure', flagWeight: 2 },
    ],
  },
  {
    id: 'q10',
    field: 'recurringFindings',
    question: 'Do you have recurring or repeat audit findings?',
    flagArea: 'regulatory',
    flagLabel: 'Regulatory & Audit Compliance',
    options: [
      { value: 'none', label: 'No — all findings are resolved and stay closed', flagWeight: 0 },
      { value: 'some', label: 'Some repeat findings', flagWeight: 1 },
      { value: 'many', label: 'Yes — many recurring findings', flagWeight: 2 },
      { value: 'not_sure', label: 'Not sure / haven\'t tracked', flagWeight: 2 },
    ],
  },
];

// ── Flagging Logic ──

const FLAG_DESCRIPTIONS: Record<string, { high: string; medium: string }> = {
  sms: {
    high: 'Your organization may lack a formal Safety Management System. This is a critical gap for aviation operations and a focus area in FAA/EASA oversight.',
    medium: 'Your SMS appears to be in early stages. Strengthening your safety management framework could reduce risk and improve audit readiness.',
  },
  capa: {
    high: 'Corrective action procedures appear to be missing or undocumented. CAPA is fundamental to regulatory compliance and continuous airworthiness.',
    medium: 'Your CAPA system may have documentation gaps. Ensuring full documentation and implementation helps prevent repeat findings.',
  },
  training: {
    high: 'Training and competency tracking appears informal or absent. Regulatory bodies require documented evidence of technician qualifications.',
    medium: 'Your training tracking methods could be improved. Digital tracking systems reduce compliance risk and audit preparation time.',
  },
  process: {
    high: 'Core operational processes appear to be undocumented or ad-hoc. Defined, documented processes are essential for quality and regulatory compliance.',
    medium: 'Some processes may lack formal documentation. Standardizing all core processes improves consistency and audit performance.',
  },
  workflow: {
    high: 'Work order management appears to lack a formal system. This can lead to missed tasks, traceability gaps, and compliance exposure.',
    medium: 'Your work order system could benefit from modernization. Digital systems improve traceability and reduce errors.',
  },
  toolControl: {
    high: 'Tool control and accountability appears to have significant gaps. Poor tool control is a leading cause of FOD incidents in aviation.',
    medium: 'Your tool control methods could be strengthened. Enhanced tracking reduces FOD risk and improves audit outcomes.',
  },
  calibration: {
    high: 'A calibration program appears to be missing. Uncalibrated measuring equipment can lead to quality escapes and regulatory findings.',
    medium: 'Your calibration tracking may have gaps. Formal tracking programs help ensure equipment accuracy and compliance.',
  },
  quality: {
    high: 'No formal quality methodology was identified. Implementing a recognized quality framework is critical for aviation operations.',
    medium: 'Your quality approach may benefit from a more structured methodology. Formal frameworks provide systematic improvement.',
  },
  improvement: {
    high: 'Continuous improvement does not appear to be actively pursued. Regulatory bodies increasingly expect evidence of proactive improvement.',
    medium: 'Continuous improvement efforts appear reactive rather than proactive. An active program with metrics demonstrates organizational maturity.',
  },
  regulatory: {
    high: 'Recurring audit findings suggest systemic issues that need root cause analysis. This is a significant regulatory risk factor.',
    medium: 'Some repeat findings were indicated. Addressing root causes can prevent escalation and improve your compliance posture.',
  },
};

export function computeFlaggedAreas(answers: QuizAnswers): FlaggedArea[] {
  const flags: FlaggedArea[] = [];

  for (const question of QUIZ_QUESTIONS) {
    const answer = answers[question.field];
    if (!answer) continue;

    const selectedOption = question.options.find((o) => o.value === answer);
    if (!selectedOption) continue;

    if (selectedOption.flagWeight >= 2) {
      const desc = FLAG_DESCRIPTIONS[question.flagArea];
      flags.push({
        area: question.flagArea,
        label: question.flagLabel,
        severity: 'high',
        description: desc?.high ?? 'Potential gap identified in this area.',
      });
    } else if (selectedOption.flagWeight === 1) {
      const desc = FLAG_DESCRIPTIONS[question.flagArea];
      flags.push({
        area: question.flagArea,
        label: question.flagLabel,
        severity: 'medium',
        description: desc?.medium ?? 'Room for improvement identified in this area.',
      });
    }
  }

  return flags;
}
