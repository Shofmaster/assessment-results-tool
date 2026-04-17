/**
 * Static agent metadata definitions — pure data, no logic or prompt strings.
 *
 * Import `AUDIT_AGENTS` (and companion constants) from here rather than from
 * `services/auditAgents`, which also bundles orchestration logic and system
 * prompt builders. Using this file directly avoids pulling the entire service
 * into components that only need agent metadata.
 */
import type { AuditAgent } from '../types/auditSimulation';
import type { PublicUseConfig } from '../types/auditSimulation';

// ── Agent roster ──────────────────────────────────────────────────────────────

export const AUDIT_AGENTS: AuditAgent[] = [
  // ── Regulatory Auditors ──────────────────────────────────────────────
  {
    id: 'faa-inspector',
    name: 'FAA Inspector',
    role: 'Federal Aviation Administration Principal Inspector',
    avatar: '🛡️',
    color: 'from-blue-500 to-blue-700',
    category: 'regulatory',
    description: '14 CFR Parts 21/43/91/121/135/145 surveillance and certification',
  },
  {
    id: 'faa-dct-traceability',
    name: 'FAA DCT Traceability',
    role: 'FAA SAS Design Compliance Tool manual-to-requirement mapping specialist',
    avatar: '📋',
    color: 'from-sky-600 to-blue-800',
    category: 'regulatory',
    description: 'Part 145 manuals vs DCT questions — evidence, gaps, and mismatches',
  },
  {
    id: 'faa-principal-inspector',
    name: 'FAA Principal Inspector (POI/PMI/PAI)',
    role: 'CHDO Principal Inspector operating per FAA Order 8900.1 (FSIMS)',
    avatar: '🛫',
    color: 'from-blue-700 to-sky-900',
    category: 'regulatory',
    description: 'FAA Order 8900.1 FSIMS surveillance, SAS elements, POI/PMI/PAI oversight program',
  },
  {
    id: 'easa-inspector',
    name: 'EASA Inspector',
    role: 'European Aviation Safety Agency Part-145 Inspector',
    avatar: '🇪🇺',
    color: 'from-indigo-500 to-indigo-700',
    category: 'regulatory',
    description: 'EASA Part-145, Part-M, Part-CAMO maintenance organisation approval',
  },
  {
    id: 'isbao-auditor',
    name: 'IS-BAO Auditor',
    role: 'International Standard for Business Aircraft Operations Auditor',
    avatar: '🌐',
    color: 'from-emerald-500 to-emerald-700',
    category: 'regulatory',
    description: 'IS-BAO Stages 1-3, ICAO Annex 6/8, business aviation SMS',
  },
  {
    id: 'as9100-auditor',
    name: 'AS9100 Auditor',
    role: 'Aerospace Quality Management System Lead Auditor',
    avatar: '📋',
    color: 'from-violet-500 to-violet-700',
    category: 'regulatory',
    description: 'AS9100D/AS9110 aerospace QMS, ISO 9001:2015 clauses 4-10',
  },
  {
    id: 'nasa-auditor',
    name: 'NASA Auditor',
    role: 'NASA Safety, Quality, and Mission Assurance Auditor',
    avatar: '🚀',
    color: 'from-zinc-500 to-zinc-700',
    category: 'regulatory',
    description: 'NASA-STD-7919.1 Commercial Aviation Services, NPR 7900.3',
  },
  {
    id: 'sms-consultant',
    name: 'SMS Consultant',
    role: 'Safety Management System Implementation Specialist',
    avatar: '📊',
    color: 'from-teal-500 to-teal-700',
    category: 'regulatory',
    description: 'ICAO Doc 9859, FAA AC 120-92B, four-pillar SMS implementation',
  },
  {
    id: 'safety-auditor',
    name: 'Third-Party Safety Auditor',
    role: 'ARGUS / Wyvern Third-Party Safety Auditor',
    avatar: '🔍',
    color: 'from-rose-500 to-rose-700',
    category: 'regulatory',
    description: 'ARGUS CHEQ, Wyvern PASS/Wingman operator safety ratings',
  },
  {
    id: 'public-use-auditor',
    name: 'Public Use Aircraft Auditor',
    role: 'Government / Public Use Aircraft Operations & Compliance Specialist',
    avatar: '🏛️',
    color: 'from-stone-500 to-stone-700',
    category: 'regulatory',
    description: '49 U.S.C. §40102/40125, government/public use aircraft compliance',
  },
  {
    id: 'airworthiness-auditor',
    name: 'Airworthiness Certification Auditor',
    role: 'Type Certification & Production Approval Specialist',
    avatar: '✈️',
    color: 'from-sky-600 to-sky-800',
    category: 'regulatory',
    description: '14 CFR Part 21/23/25/27/29/33/35, EASA CS series, MSG-3, type/production cert',
  },

  // ── Entity Perspectives ──────────────────────────────────────────────
  {
    id: 'shop-owner',
    name: 'Shop Owner',
    role: 'Repair Station Certificate Holder / Accountable Manager',
    avatar: '🔧',
    color: 'from-amber-500 to-amber-700',
    category: 'entity',
    description: 'Certificate holder leadership, operational feasibility perspective',
  },
  {
    id: 'dom-maintenance-manager',
    name: 'DOM / Maintenance Manager',
    role: 'Director of Maintenance or Maintenance Manager',
    avatar: '🔧',
    color: 'from-slate-500 to-slate-700',
    category: 'entity',
    description: 'Maintenance scheduling, execution, and technical authority',
  },
  {
    id: 'chief-inspector-quality-manager',
    name: 'Chief Inspector / Quality Manager',
    role: 'Chief Inspector or Quality Manager',
    avatar: '📋',
    color: 'from-slate-600 to-slate-800',
    category: 'entity',
    description: 'Quality system oversight, inspection, and compliance monitoring',
  },
  {
    id: 'entity-safety-manager',
    name: 'Safety Manager',
    role: 'Organization Safety Manager (SMS)',
    avatar: '🛡️',
    color: 'from-teal-600 to-teal-800',
    category: 'entity',
    description: 'In-house SMS implementation and safety culture assessment',
  },
  {
    id: 'general-manager',
    name: 'General Manager',
    role: 'General Manager / Accountable Manager',
    avatar: '🏢',
    color: 'from-slate-400 to-slate-600',
    category: 'entity',
    description: 'Business operations, accountability, and resource management',
  },

  // ── Analysis & Orchestration ─────────────────────────────────────────
  {
    id: 'audit-intelligence-analyst',
    name: 'Audit Intelligence Analyst',
    role: 'Cross-Audit Pattern Recognition & Historical Findings Specialist',
    avatar: '🧠',
    color: 'from-purple-500 to-purple-700',
    category: 'analysis',
    description: 'Cross-audit pattern recognition, trend analysis, root cause patterns',
  },

  // ── Software, Hardware & Systems Safety ──────────────────────────────
  {
    id: 'do178c-auditor',
    name: 'DO-178C Software Auditor',
    role: 'Airborne Software Assurance & Certification Specialist (DER)',
    avatar: '💻',
    color: 'from-blue-600 to-blue-800',
    category: 'software-hardware',
    description: 'DO-178C/DO-278A software DAL A-E, DO-330 tool qualification, MC/DC coverage',
  },
  {
    id: 'do254-auditor',
    name: 'DO-254 Hardware Auditor',
    role: 'Airborne Electronic Hardware Assurance Specialist',
    avatar: '🔌',
    color: 'from-red-500 to-red-700',
    category: 'software-hardware',
    description: 'DO-254 hardware DAL A-E, FPGA/ASIC assurance, AC 20-152A',
  },
  {
    id: 'systems-safety-auditor',
    name: 'Systems Safety Auditor',
    role: 'Aircraft Systems Safety Assessment Specialist',
    avatar: '⚠️',
    color: 'from-yellow-600 to-yellow-800',
    category: 'software-hardware',
    description: 'ARP4754A/ARP4761, FHA/PSSA/SSA, FMEA/FTA, MIL-STD-882E',
  },
  {
    id: 'do160-auditor',
    name: 'Environmental Testing Auditor',
    role: 'Environmental Qualification & Testing Specialist',
    avatar: '🌡️',
    color: 'from-amber-600 to-amber-800',
    category: 'software-hardware',
    description: 'DO-160G/H, MIL-STD-810H, MIL-STD-461G EMI/EMC, environmental qualification',
  },

  // ── Special Processes ────────────────────────────────────────────────
  {
    id: 'nadcap-auditor',
    name: 'NADCAP Auditor',
    role: 'National Aerospace & Defense Contractors Accreditation Program Auditor',
    avatar: '⚙️',
    color: 'from-cyan-500 to-cyan-700',
    category: 'special-process',
    description: 'NADCAP NDT, heat treat, chemical processing, welding, electronics, composites, coatings',
  },
  {
    id: 'supply-chain-auditor',
    name: 'Supply Chain / Counterfeit Parts Auditor',
    role: 'Aerospace Supply Chain & Counterfeit Avoidance Specialist',
    avatar: '🔗',
    color: 'from-orange-500 to-orange-700',
    category: 'special-process',
    description: 'AS6081/AS6171/AS9120B counterfeit avoidance, DFARS 252.246-7007/7008',
  },
  {
    id: 'laboratory-auditor',
    name: 'Laboratory / Calibration Auditor',
    role: 'Testing & Calibration Laboratory Accreditation Specialist',
    avatar: '🔬',
    color: 'from-fuchsia-500 to-fuchsia-700',
    category: 'special-process',
    description: 'ISO/IEC 17025, ANSI Z540.3 calibration, NADCAP materials test labs',
  },

  // ── Defense & Space ──────────────────────────────────────────────────
  {
    id: 'defense-auditor',
    name: 'Defense Aerospace Auditor',
    role: 'Defense Contract Quality & FAR/DFARS Compliance Specialist',
    avatar: '🎖️',
    color: 'from-green-700 to-green-900',
    category: 'defense-space',
    description: 'MIL-STD-882E, AS9102 FAI, FAR/DFARS quality clauses, DCMA, government property',
  },
  {
    id: 'space-systems-auditor',
    name: 'Space Systems QA Auditor',
    role: 'Space Hardware & Mission Assurance Quality Specialist',
    avatar: '🛰️',
    color: 'from-indigo-600 to-indigo-800',
    category: 'defense-space',
    description: 'ECSS-Q-ST suite, NASA-STD-5009/5019/6016/8739, space flight hardware QA',
  },

  // ── Emerging Sectors ─────────────────────────────────────────────────
  {
    id: 'cybersecurity-auditor',
    name: 'Cybersecurity Auditor',
    role: 'Airborne & Aerospace Cybersecurity Compliance Specialist',
    avatar: '🔒',
    color: 'from-red-600 to-red-800',
    category: 'emerging',
    description: 'DO-326A/DO-356A airborne security, CMMC 2.0, NIST SP 800-171',
  },
  {
    id: 'uas-evtol-auditor',
    name: 'UAS / eVTOL Auditor',
    role: 'Unmanned & Advanced Air Mobility Certification Specialist',
    avatar: '🚁',
    color: 'from-lime-500 to-lime-700',
    category: 'emerging',
    description: '14 CFR Part 107, ASTM F3548, JARUS SORA, FAA/EASA SC-VTOL',
  },
  {
    id: 'additive-mfg-auditor',
    name: 'Additive Manufacturing Auditor',
    role: 'Aerospace Additive Manufacturing Process & Qualification Specialist',
    avatar: '🖨️',
    color: 'from-pink-500 to-pink-700',
    category: 'emerging',
    description: 'SAE AMS7000-7004, MSFC-STD-3716, ASTM F3055/F3301/F3302, AM qualification',
  },
];

// ── Derived agent-ID lists ─────────────────────────────────────────────────────

/** Agent IDs available for paperwork review perspective (generic + all audit agents). */
export const PAPERWORK_REVIEW_AGENT_IDS = ['generic', ...AUDIT_AGENTS.map((a) => a.id)] as const;

/** Perspectives available on the DCT Compliance traceability run. */
export const DCT_TRACEABILITY_AGENT_IDS = ['faa-dct-traceability', 'generic'] as const;

// ── Public-use auditor config ─────────────────────────────────────────────────

/** Default config for Public Use Aircraft Auditor */
export const DEFAULT_PUBLIC_USE_CONFIG: PublicUseConfig = {
  entityType: 'federal',
  auditFocus: 'qualification',
};

export const PUBLIC_USE_ENTITY_TYPE_LABELS: Record<PublicUseConfig['entityType'], string> = {
  'federal': 'Federal Government Agency',
  'state-local': 'State / Local Government',
  'law-enforcement': 'Law Enforcement',
  'fire-rescue': 'Fire / Rescue / EMS',
  'military-support': 'Military Support Operations',
};

export const PUBLIC_USE_AUDIT_FOCUS_LABELS: Record<PublicUseConfig['auditFocus'], string> = {
  'qualification': 'Public Aircraft Qualification Review',
  'maintenance': 'Maintenance Oversight Review',
  'operational': 'Operational Compliance Review',
  'accident-review': 'Accident / Incident Review',
};

// ── IS-BAO stage ──────────────────────────────────────────────────────────────

/** IS-BAO certification stages: 1 = SMS infrastructure, 2 = risk management in use, 3 = SMS integrated into culture */
export type ISBAOStage = 1 | 2 | 3;
