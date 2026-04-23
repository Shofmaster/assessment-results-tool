export type SeoSection = {
  heading: string;
  body: string;
};

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  type: 'service' | 'product' | 'guide' | 'article';
  sections: SeoSection[];
  faq?: Array<{ question: string; answer: string }>;
  internalLinks: Array<{ href: string; label: string }>;
};

const base = 'https://www.aerogaptechnologies.com';

export const SEO_PAGES: SeoPage[] = [
  {
    path: '/aviation-compliance-audit-services',
    title: 'Aviation Compliance Audit Services | AeroGap',
    description:
      'US-focused aviation compliance audit services for FAA, AS9100, and internal readiness programs with evidence-backed findings and corrective action support.',
    h1: 'Aviation compliance audit services for operators, MROs, and quality teams',
    intro:
      'AeroGap helps aviation organizations run structured compliance audits with clear requirement mapping, defensible findings, and practical closure plans.',
    primaryKeyword: 'aviation compliance audit services',
    secondaryKeywords: ['FAA compliance audit', 'internal aviation audit support', 'aviation quality audit'],
    type: 'service',
    sections: [
      {
        heading: 'Scope and objective definition',
        body:
          'Each engagement starts with a scope matrix by operation type, manuals, and applicable rules so audits are aligned before fieldwork begins.',
      },
      {
        heading: 'Evidence-grounded assessment',
        body:
          'Findings are tied to exact document and record evidence, with requirement citations and risk-weighted prioritization for leadership review.',
      },
      {
        heading: 'Corrective action follow-through',
        body:
          'We support closure discipline with accountable owners, due dates, and re-verification evidence so corrective actions survive regulatory scrutiny.',
      },
    ],
    faq: [
      {
        question: 'Do you support FAA Part 145 and Part 135 environments?',
        answer:
          'Yes. Our audit scope can cover maintenance and operational programs, provided your manuals and records are available for review.',
      },
      {
        question: 'Can we use your process for internal readiness before regulator visits?',
        answer:
          'Yes. Many teams use this workflow for pre-audit readiness, then keep it as an ongoing internal control process.',
      },
    ],
    internalLinks: [
      { href: '/aviation-audit-readiness', label: 'Aviation audit readiness framework' },
      { href: '/faa-repair-station-audit-checklist', label: 'FAA repair station checklist' },
    ],
  },
  {
    path: '/aviation-quality-software',
    title: 'Aviation Quality Software for Compliance Teams | AeroGap',
    description:
      'Aviation quality software for audits, evidence review, checklists, and compliance workflows. Designed for US aviation operations and maintenance teams.',
    h1: 'Aviation quality software for faster, defensible compliance workflows',
    intro:
      'AeroGap centralizes manuals, records, and audit evidence so quality teams can run repeatable compliance workflows with human-controlled decision making.',
    primaryKeyword: 'aviation quality software',
    secondaryKeywords: ['aviation compliance software', 'audit evidence management', 'quality workflow tool'],
    type: 'product',
    sections: [
      {
        heading: 'Single system for manuals and evidence',
        body:
          'Store standards, policies, manuals, and records in one workspace to reduce version confusion and improve audit traceability.',
      },
      {
        heading: 'Structured review and issue tracking',
        body:
          'Run guided assessments, log findings, and track corrective actions by owner and due date with status views for management.',
      },
      {
        heading: 'Human approval at every critical step',
        body:
          'AeroGap supports teams with assistive analysis but keeps final acceptance decisions with authorized personnel.',
      },
    ],
    internalLinks: [
      { href: '/as9100-internal-audit-software', label: 'AS9100 internal audit software use case' },
      { href: '/manual-audits-vs-software-assisted-audits', label: 'Manual vs software-assisted audits' },
    ],
  },
  {
    path: '/aviation-quality',
    title: 'Aviation Quality: Programs, Audits, and Software | AeroGap',
    description:
      'A practical guide to aviation quality management: build quality assurance programs, run defensible audits, and improve readiness with measurable controls.',
    h1: 'Aviation quality programs that hold up in FAA and AS9100 environments',
    intro:
      'Aviation quality is a managed system, not a one-time audit event. This guide outlines how teams build repeatable controls, prove execution with evidence, and sustain readiness over time.',
    primaryKeyword: 'aviation quality',
    secondaryKeywords: ['aviation quality management', 'aviation quality assurance', 'aerospace quality program'],
    type: 'guide',
    sections: [
      {
        heading: 'Define aviation quality in operational terms',
        body:
          'Treat aviation quality as the ability to consistently meet regulatory, customer, and internal requirements with objective evidence. Clear definitions reduce disagreement during audits and management review.',
      },
      {
        heading: 'Build a controlled requirements baseline',
        body:
          'Consolidate FAA obligations, AS9100 clauses, customer requirements, and company procedures into one controlled reference. This baseline prevents blind spots and gives teams one source of truth.',
      },
      {
        heading: 'Run recurring internal audit cycles',
        body:
          'Schedule recurring internal audits for high-risk processes, not just annual check-the-box events. Frequent checkpoints improve detection speed and keep corrective actions aligned with risk.',
      },
      {
        heading: 'Raise evidence quality standards',
        body:
          'Define acceptance criteria for objective evidence, including source, date, owner, and requirement mapping. Strong evidence discipline reduces finding disputes and speeds regulator response.',
      },
      {
        heading: 'Close findings with effectiveness checks',
        body:
          'Closure quality matters as much as closure speed. Use root-cause expectations, accountable owners, due dates, and re-verification so corrective actions prevent recurrence.',
      },
      {
        heading: 'Track quality performance with weekly KPIs',
        body:
          'Use weekly indicators such as closure velocity, aged findings, recurrence rates, and evidence completeness. A consistent KPI cadence helps leadership detect drift before it becomes a major nonconformity.',
      },
      {
        heading: 'Use software to improve consistency',
        body:
          'Software-assisted workflows help teams organize requirements, evidence, and corrective actions in one place. This reduces process variation and improves defensibility under audit pressure.',
      },
    ],
    faq: [
      {
        question: 'What is aviation quality management?',
        answer:
          'Aviation quality management is the system of policies, procedures, audits, and corrective-action controls used to ensure operations consistently meet regulatory and organizational requirements.',
      },
      {
        question: 'How is aviation quality assurance different from inspection?',
        answer:
          'Inspection checks individual outputs, while quality assurance governs the process and controls that produce those outputs. Strong programs use both, with traceable evidence and follow-through.',
      },
      {
        question: 'Can one quality system support both FAA and AS9100 expectations?',
        answer:
          'Yes. Many organizations use a shared baseline with mapped requirements, then apply additional controls where FAA and AS9100 expectations differ.',
      },
    ],
    internalLinks: [
      { href: '/aviation-quality-software', label: 'Aviation quality software' },
      { href: '/aviation-compliance-audit-services', label: 'Aviation compliance audit services' },
      { href: '/faa-repair-station-audit-checklist', label: 'FAA Part 145 audit checklist' },
      { href: '/as9100-internal-audit-software', label: 'AS9100 internal audit software' },
      { href: '/aviation-audit-readiness', label: 'Aviation audit readiness framework' },
      { href: '/aviation-compliance-kpis', label: 'Weekly aviation compliance KPIs' },
    ],
  },
  {
    path: '/faa-repair-station-audit-checklist',
    title: 'FAA Repair Station Audit Checklist (Part 145) | AeroGap',
    description:
      'Practical FAA Part 145 repair station audit checklist with evidence expectations, recurring risk areas, and corrective action guidance.',
    h1: 'FAA repair station audit checklist for Part 145 readiness',
    intro:
      'Use this checklist to assess manual control, training, records, tooling, and oversight practices before surveillance events or internal audits.',
    primaryKeyword: 'FAA repair station audit checklist',
    secondaryKeywords: ['Part 145 checklist', 'repair station compliance audit', 'FAA maintenance audit prep'],
    type: 'guide',
    sections: [
      {
        heading: 'Manual and procedure control',
        body:
          'Confirm current, approved procedures are available and matched to actual execution across shifts and facilities.',
      },
      {
        heading: 'Training, authorizations, and records',
        body:
          'Verify personnel qualification records, recurrent training completion, and authorization controls are complete and retrievable.',
      },
      {
        heading: 'Corrective action and recurrence prevention',
        body:
          'Evaluate whether prior findings were closed with objective evidence and systemic controls that prevent repeat nonconformities.',
      },
    ],
    internalLinks: [
      { href: '/aviation-compliance-audit-services', label: 'Compliance audit services' },
      { href: '/aviation-audit-readiness', label: 'Audit readiness process' },
    ],
  },
  {
    path: '/as9100-internal-audit-software',
    title: 'AS9100 Internal Audit Software | AeroGap',
    description:
      'AS9100 internal audit software for clause mapping, evidence capture, nonconformity tracking, and management review readiness.',
    h1: 'AS9100 internal audit software for quality system discipline',
    intro:
      'AeroGap helps aerospace quality teams organize clause-level evidence, run repeatable internal audits, and document closure outcomes with traceability.',
    primaryKeyword: 'AS9100 internal audit software',
    secondaryKeywords: ['AS9100 audit tool', 'aerospace QMS audit software', 'clause evidence tracking'],
    type: 'product',
    sections: [
      {
        heading: 'Clause-to-evidence traceability',
        body:
          'Map each clause expectation to objective evidence and assigned process owners to improve audit coverage and consistency.',
      },
      {
        heading: 'Nonconformity and CAPA workflow',
        body:
          'Track findings through containment, root cause, action implementation, and effectiveness checks with clear ownership.',
      },
      {
        heading: 'Management review support',
        body:
          'Provide leadership with trend visibility, open risk areas, and closure confidence before external audit events.',
      },
    ],
    internalLinks: [
      { href: '/aviation-quality-software', label: 'Aviation quality software overview' },
      { href: '/audit-evidence-management-best-practices', label: 'Evidence management best practices' },
    ],
  },
  {
    path: '/aviation-audit-readiness',
    title: 'Aviation Audit Readiness Framework | AeroGap',
    description:
      'Build aviation audit readiness with structured preparation, evidence discipline, and recurring review cadences for US-focused operations.',
    h1: 'Aviation audit readiness with repeatable controls and evidence discipline',
    intro:
      'Audit readiness is not a one-week push. This framework helps teams build an ongoing readiness loop across manuals, records, and corrective actions.',
    primaryKeyword: 'aviation audit readiness',
    secondaryKeywords: ['audit readiness framework', 'aviation compliance preparation', 'internal readiness checks'],
    type: 'guide',
    sections: [
      {
        heading: 'Build a requirements register',
        body:
          'Consolidate obligations from regulations, standards, and internal procedures into one controlled reference used across teams.',
      },
      {
        heading: 'Run recurring internal checkpoints',
        body:
          'Set calendar-based reviews for high-risk processes and record objective evidence that supports ongoing compliance confidence.',
      },
      {
        heading: 'Use closure quality standards',
        body:
          'Define what complete closure looks like so corrective actions address systemic causes, not only immediate findings.',
      },
    ],
    internalLinks: [
      { href: '/aviation-compliance-audit-services', label: 'Service support for readiness' },
      { href: '/manual-audits-vs-software-assisted-audits', label: 'Manual vs assisted approach' },
    ],
  },
  {
    path: '/manual-audits-vs-software-assisted-audits',
    title: 'Manual Audits vs Software-Assisted Audits | AeroGap',
    description:
      'Compare manual audit processes with software-assisted audit workflows for aviation quality teams focused on speed and defensibility.',
    h1: 'Manual audits vs software-assisted audits: what changes in practice',
    intro:
      'Manual methods can work, but scaling consistency and traceability is difficult. This comparison outlines practical tradeoffs and when to modernize.',
    primaryKeyword: 'manual audits vs software-assisted audits',
    secondaryKeywords: ['audit process comparison', 'aviation audit modernization', 'quality audit efficiency'],
    type: 'article',
    sections: [
      {
        heading: 'Consistency and repeatability',
        body: 'Software-assisted workflows enforce process discipline and reduce variation between auditors and audit cycles.',
      },
      {
        heading: 'Evidence retrieval speed',
        body: 'Centralized evidence indexing shortens investigation time and improves responsiveness during regulator and customer audits.',
      },
      {
        heading: 'Risk of missed obligations',
        body: 'Structured requirement mapping reduces blind spots that can happen when control tracking is fragmented across files.',
      },
    ],
    internalLinks: [{ href: '/aviation-quality-software', label: 'See the software approach' }],
  },
  {
    path: '/audit-evidence-management-best-practices',
    title: 'Audit Evidence Management Best Practices | AeroGap',
    description:
      'Audit evidence management best practices for aviation teams: traceability, version control, ownership, and retrieval speed.',
    h1: 'Audit evidence management best practices for aviation compliance',
    intro:
      'Evidence quality often determines audit outcomes. These practices improve confidence in completeness, traceability, and retrieval under pressure.',
    primaryKeyword: 'audit evidence management best practices',
    secondaryKeywords: ['compliance evidence management', 'audit traceability', 'quality records control'],
    type: 'article',
    sections: [
      {
        heading: 'Define evidence acceptance criteria',
        body: 'Set explicit standards for what qualifies as objective evidence, including source, date, owner, and control reference.',
      },
      {
        heading: 'Apply version and retention controls',
        body: 'Use disciplined version management and retention rules so records remain defensible during historical lookbacks.',
      },
      {
        heading: 'Design for fast retrieval',
        body: 'Tag and group records by obligation, process, and audit cycle to reduce delay during requests.',
      },
    ],
    internalLinks: [{ href: '/aviation-audit-readiness', label: 'Apply these practices to readiness' }],
  },
  {
    path: '/faa-as9100-readiness-roadmap',
    title: 'FAA and AS9100 Readiness Roadmap | AeroGap',
    description:
      'FAA and AS9100 readiness roadmap for organizations balancing regulatory obligations and quality management system requirements.',
    h1: 'FAA and AS9100 readiness roadmap for integrated compliance',
    intro:
      'Organizations operating under both regulatory and QMS expectations need a coordinated roadmap to avoid duplicated effort and missed controls.',
    primaryKeyword: 'FAA and AS9100 readiness roadmap',
    secondaryKeywords: ['integrated compliance roadmap', 'FAA AS9100 alignment', 'aviation QMS readiness'],
    type: 'article',
    sections: [
      {
        heading: 'Map overlap and differences',
        body: 'Identify where obligations reinforce each other and where separate controls are required to avoid false assumptions.',
      },
      {
        heading: 'Prioritize high-risk controls first',
        body: 'Focus early cycles on controls with direct safety, airworthiness, and customer-impact implications.',
      },
      {
        heading: 'Track management accountability',
        body: 'Assign owners for each requirement family with regular progress reviews and objective closure criteria.',
      },
    ],
    internalLinks: [{ href: '/as9100-internal-audit-software', label: 'Support roadmap execution with software' }],
  },
  {
    path: '/aviation-compliance-kpis',
    title: 'Aviation Compliance KPIs to Track Weekly | AeroGap',
    description:
      'Track aviation compliance KPIs weekly: closure rate, aging findings, evidence completeness, and audit readiness indicators.',
    h1: 'Aviation compliance KPIs worth tracking every week',
    intro:
      'The right weekly KPIs help quality leaders detect drift early and focus corrective effort where it matters most.',
    primaryKeyword: 'aviation compliance KPIs',
    secondaryKeywords: ['audit readiness metrics', 'quality compliance dashboard', 'corrective action KPIs'],
    type: 'article',
    sections: [
      {
        heading: 'Closure velocity and quality',
        body: 'Measure both closure speed and effectiveness to avoid fast but weak corrective actions.',
      },
      {
        heading: 'Aging and recurrence indicators',
        body: 'Track overdue items and repeated issue themes to identify systemic weaknesses needing leadership action.',
      },
      {
        heading: 'Evidence completeness score',
        body: 'Monitor how many findings and controls have complete supporting evidence ready for independent review.',
      },
    ],
    internalLinks: [{ href: '/aviation-audit-readiness', label: 'Use KPIs in your readiness loop' }],
  },
];

export const SEO_PAGE_BY_PATH = new Map(SEO_PAGES.map((page) => [page.path, page]));

export const SEO_INDEXABLE_PATHS = SEO_PAGES.map((page) => page.path);

export function absoluteUrl(path: string): string {
  return `${base}${path}`;
}
