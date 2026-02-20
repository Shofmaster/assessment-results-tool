import type { FAAPartScope, FAAConfig, FAAInspectorSpecialty } from '../types/auditSimulation';

/** Per-part regulatory and focus content for prompt building when user selects 121, 135, and/or 145 */
export const FAA_PART_SCOPE_CONTENT: Record<
  FAAPartScope,
  { label: string; regulations: string[]; focusAreas: string[] }
> = {
  '121': {
    label: 'Part 121',
    regulations: [
      '14 CFR Part 121 — Operating Requirements: Domestic, Flag, and Supplemental Operations',
      '14 CFR Part 121 Subpart L — Maintenance, preventive maintenance, and alterations',
      '14 CFR Part 121 Subpart T — Flight operations (crew duty, rest, training)',
      '14 CFR Part 121 Subpart G — Manual requirements, MEL, dispatch',
      'FAA Order 8900.1 Vol 3 — Flight Standards (air carrier oversight)',
    ],
    focusAreas: [
      'Dispatch and operational control',
      'MEL (Minimum Equipment List) compliance and deferrals',
      'Crew duty time, rest, and fatigue risk',
      'Training programs and crew qualification records',
      'Maintenance program and aircraft reliability',
      'Quality assurance and safety management',
    ],
  },
  '135': {
    label: 'Part 135',
    regulations: [
      '14 CFR Part 135 — Operating Requirements: Commuter and On-Demand Operations',
      '14 CFR Part 135 Subpart E — Flight crewmember requirements',
      '14 CFR Part 135 Subpart J — Maintenance, preventive maintenance, and alterations',
      'Operations Specifications (Ops Specs)',
      'FAA Order 8900.1 Vol 3 — Flight Standards (commuter/on-demand)',
    ],
    focusAreas: [
      'Ops Specs compliance and limitations',
      'Pilot records, training, and qualification currency',
      'Aircraft maintenance tracking and inspection programs',
      'Duty time and flight time limitations',
      'Drug and alcohol program (Part 120) where applicable',
    ],
  },
  '145': {
    label: 'Part 145',
    regulations: [
      '14 CFR Part 145 — Repair Stations',
      '14 CFR 145.151–145.163 — Personnel, supervisory, inspection, training',
      '14 CFR 145.201–145.221 — Privileges, manual, quality control, capability list, contract maintenance, recordkeeping, SDR',
      '14 CFR Part 43 — Maintenance, preventive maintenance, rebuilding, alteration',
      'AC 145-9, AC 43-9C',
      'FAA Order 8900.1 Vol 2 Ch 7 — Repair station surveillance',
    ],
    focusAreas: [
      'Personnel and supervisory requirements',
      'Training program and records',
      'Quality control system and procedures',
      'Repair station manual and capability list',
      'Contract maintenance and outsourcing',
      'Recordkeeping and return-to-service documentation',
      'Service difficulty reporting (SDR)',
    ],
  },
};

const part145Routine: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part145-routine-surveillance',
  name: 'Part 145 Routine Surveillance',
  description: 'Scheduled periodic inspection per FAA Order 8900.1 Vol 2, Ch 7.',
  applicableParts: ['145'],
  regulations: ['14 CFR Part 145', 'FAA Order 8900.1 Vol 2 Ch 7'],
  focusAreas: ['Personnel', 'Training', 'Quality control', 'Recordkeeping', 'Capability list', 'Contract maintenance', 'Facility/equipment'],
};
const part145Initial: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part145-initial-certification',
  name: 'Part 145 Initial Certification',
  description: 'First-time certification evaluation.',
  applicableParts: ['145'],
  regulations: ['14 CFR Part 145', 'FAA Order 8900.1'],
  focusAreas: ['Facility', 'Capability', 'Personnel', 'Manual', 'Quality system'],
};
const part145Renewal: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part145-renewal-amendment',
  name: 'Part 145 Renewal / Amendment',
  description: 'OpSpec changes, rating additions, capability list expansion.',
  applicableParts: ['145'],
  regulations: ['14 CFR Part 145', 'FAA Order 8900.1'],
  focusAreas: ['OpSpec/rating changes', 'Capability list', 'Manual revisions'],
};
const part43Records: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part43-maintenance-records',
  name: 'Part 43 Maintenance Records Audit',
  description: 'Return-to-service records, 337 forms, AD compliance, work order documentation.',
  applicableParts: ['121', '135', '145'],
  regulations: ['14 CFR Part 43', 'Part 145.219', 'Part 121/135 maintenance subparts'],
  focusAreas: ['Return-to-service', 'Form 337', 'AD compliance', 'Work orders'],
};
const adCompliance: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'ad-compliance',
  name: 'Airworthiness Directive (AD) Compliance',
  description: 'AD tracking, compliance status, repetitive ADs, AMOCs.',
  applicableParts: ['121', '135', '145'],
  regulations: ['14 CFR Part 39', 'Part 43', 'Part 121/135/145 maintenance'],
  focusAreas: ['AD tracking', 'Compliance status', 'Repetitive ADs', 'AMOCs'],
};
const unannounced: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'unannounced-spot',
  name: 'Unannounced / Spot Inspection',
  description: 'Targeted, no-notice inspection on specific concerns or random surveillance.',
  applicableParts: ['121', '135', '145'],
  regulations: ['FAA Order 8900.1', '14 CFR as applicable'],
  focusAreas: ['Targeted areas', 'Random surveillance', 'Specific concerns'],
};
const forCause: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'for-cause-investigation',
  name: 'For-Cause Investigation',
  description: 'Triggered by accident, incident, complaint, or SDR trends.',
  applicableParts: ['121', '135', '145'],
  regulations: ['14 CFR as applicable', 'FAA Order 8900.1'],
  focusAreas: ['Root cause', 'Corrective action', 'Compliance history'],
};
const drugAlcohol: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'drug-alcohol-program',
  name: 'Drug and Alcohol Program Review',
  description: '14 CFR Part 120 compliance, random testing rates, program documentation.',
  applicableParts: ['121', '135'],
  regulations: ['14 CFR Part 120'],
  focusAreas: ['Random testing', 'Program documentation', 'Training', 'Violations'],
};

const part121Base: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part121-base',
  name: 'Part 121 Base Inspection',
  description: 'Air carrier operational base: dispatch, crew scheduling, MEL, training.',
  applicableParts: ['121'],
  regulations: ['14 CFR Part 121', 'FAA Order 8900.1 Vol 3'],
  focusAreas: ['Dispatch', 'Crew scheduling', 'MEL', 'Training', 'Ops control'],
};
const part121Ramp: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part121-ramp',
  name: 'Part 121 Ramp Inspection',
  description: 'Unannounced aircraft/crew check: airworthiness docs, crew qualifications, MEL.',
  applicableParts: ['121'],
  regulations: ['14 CFR Part 121', 'FAA Order 8900.1'],
  focusAreas: ['Airworthiness docs', 'Crew qualifications', 'MEL items', 'Cabin safety'],
};
const part121EnRoute: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part121-en-route',
  name: 'Part 121 En Route Inspection',
  description: 'In-flight observation of crew procedures, CRM, SOP adherence.',
  applicableParts: ['121'],
  regulations: ['14 CFR Part 121'],
  focusAreas: ['Crew procedures', 'CRM', 'SOP adherence'],
};
const part135Base: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part135-base',
  name: 'Part 135 Base Inspection',
  description: 'Commuter/on-demand base: ops specs, duty time, pilot records.',
  applicableParts: ['135'],
  regulations: ['14 CFR Part 135', 'FAA Order 8900.1 Vol 3'],
  focusAreas: ['Ops specs', 'Duty time', 'Pilot records', 'Aircraft records'],
};
const part135Ramp: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part135-ramp',
  name: 'Part 135 Ramp Inspection',
  description: 'On-demand/charter aircraft and crew spot check.',
  applicableParts: ['135'],
  regulations: ['14 CFR Part 135', 'FAA Order 8900.1'],
  focusAreas: ['Aircraft docs', 'Crew qualifications', 'MEL', 'Weight and balance'],
};
const part91Ramp: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part91-ramp',
  name: 'Part 91 Ramp Inspection',
  description: 'General aviation aircraft airworthiness and documentation check.',
  applicableParts: ['135'],
  regulations: ['14 CFR Part 91', 'Part 43'],
  focusAreas: ['Airworthiness', 'Documentation', 'Pilot/operator compliance'],
};
const part141Training: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part141-142-training',
  name: 'Part 141/142 Training Program Audit',
  description: 'Flight school/training center curriculum, instructor records, stage checks.',
  applicableParts: ['121', '135'],
  regulations: ['14 CFR Part 141', 'Part 142', 'FAA Order 8900.1'],
  focusAreas: ['Curriculum', 'Instructor records', 'Stage checks', 'Facilities'],
};
const provingFlight: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'proving-validation',
  name: 'Proving / Validation Flight',
  description: 'New routes, aircraft types, or operational changes requiring demonstration.',
  applicableParts: ['121', '135'],
  regulations: ['14 CFR Part 121', 'Part 135', 'FAA Order 8900.1'],
  focusAreas: ['Demonstration', 'SOPs', 'Crew qualification', 'Aircraft/route approval'],
};
const hazmat: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'hazmat-inspection',
  name: 'HAZMAT Inspection',
  description: '49 CFR Part 175 compliance, HAZMAT training, acceptance procedures.',
  applicableParts: ['121', '135', '145'],
  regulations: ['49 CFR Part 175', '14 CFR as applicable'],
  focusAreas: ['HAZMAT training', 'Acceptance procedures', 'Documentation'],
};

const part21Production: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part21-production',
  name: 'Part 21 Production Approval Inspection',
  description: 'Production certificate, PMA, TSO. Quality system, conformity, test procedures.',
  applicableParts: ['145'],
  regulations: ['14 CFR Part 21', 'FAA Order 8110.4'],
  focusAreas: ['Production certificate', 'PMA', 'TSO', 'Quality system', 'Conformity'],
};
const supplierSurveillance: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'supplier-surveillance',
  name: 'Supplier Surveillance',
  description: 'Vendor/supplier quality, incoming inspection, material traceability.',
  applicableParts: ['121', '135', '145'],
  regulations: ['14 CFR Part 21', 'Part 145', 'Part 121/135'],
  focusAreas: ['Vendor quality', 'Incoming inspection', 'Traceability', 'Sub-tier'],
};
const conformity: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'conformity-inspection',
  name: 'Conformity Inspection',
  description: 'Article conformity to type design, test witnessing, first article.',
  applicableParts: ['145'],
  regulations: ['14 CFR Part 21', 'Part 43', 'Part 145'],
  focusAreas: ['Type design', 'Test witnessing', 'First article inspection'],
};
const pmaTso: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'pma-tso-review',
  name: 'PMA / TSO Authorization Review',
  description: 'Parts Manufacturer Approval or TSO authorization and ongoing compliance.',
  applicableParts: ['145'],
  regulations: ['14 CFR Part 21', 'FAA Order 8110.4'],
  focusAreas: ['PMA', 'TSO', 'Ongoing compliance', 'Design data'],
};

const part147School: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'part147-school',
  name: 'Part 147 Aviation Maintenance Technician School',
  description: 'Aviation maintenance technician school curriculum, facilities, instructor and student records.',
  applicableParts: ['121', '135', '145'],
  regulations: ['14 CFR Part 147', 'FAA Order 8900.1'],
  focusAreas: ['Curriculum', 'Facilities', 'Instructor records', 'Student records', 'Graduation requirements'],
};

const smsProgramAssessment: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'sms-program-assessment',
  name: 'SMS (Safety Management System) Program Assessment',
  description: 'Safety Management System program evaluation per AC 120-92B and FAA Order 8900.1.',
  applicableParts: ['121', '135', '145'],
  regulations: ['FAA AC 120-92B', 'FAA Order 8900.1', '14 CFR as applicable'],
  focusAreas: ['SMS policy', 'Safety assurance', 'Safety promotion', 'Risk management', 'Safety culture'],
};

const cargoWeightBalance: FAAInspectorSpecialty['inspectionTypes'][0] = {
  id: 'cargo-weight-balance-surveillance',
  name: 'Cargo / Weight and Balance Surveillance',
  description: 'Certificate holder cargo, baggage loading, weight and balance program, and related procedures.',
  applicableParts: ['121', '135'],
  regulations: ['14 CFR Part 121', 'Part 135', 'FAA Order 8900.1', 'N 8900.472'],
  focusAreas: ['Cargo loading', 'Baggage procedures', 'Weight and balance program', 'Documentation'],
};

/** Full hierarchy: specialties and inspection types for FAA Inspector sub-menu */
export const FAA_INSPECTOR_SPECIALTIES: FAAInspectorSpecialty[] = [
  {
    id: 'airworthiness-asi',
    name: 'Airworthiness ASI',
    description: 'Maintenance, repair stations, and aircraft airworthiness. Primary: 145; also 121/135 maintenance elements.',
    inspectionTypes: [
      part145Routine,
      part145Initial,
      part145Renewal,
      part43Records,
      adCompliance,
      unannounced,
      forCause,
      drugAlcohol,
      part147School,
      smsProgramAssessment,
    ],
  },
  {
    id: 'operations-asi',
    name: 'Operations ASI',
    description: 'Flight operations, pilot certification, operational compliance. Primary: 121, 135.',
    inspectionTypes: [
      part121Base,
      part121Ramp,
      part121EnRoute,
      part135Base,
      part135Ramp,
      part91Ramp,
      part141Training,
      provingFlight,
      hazmat,
      cargoWeightBalance,
    ],
  },
  {
    id: 'manufacturing-asi',
    name: 'Manufacturing ASI',
    description: 'Production, parts manufacturing, type design. Part 21; relevant when 121/135/145 involve approved parts.',
    inspectionTypes: [part21Production, supplierSurveillance, conformity, pmaTso],
  },
];

export const FAA_PARTS: FAAPartScope[] = ['121', '135', '145'];

/** Default FAA config when user selects FAA Inspector but has not configured sub-menu (backwards compat) */
export const DEFAULT_FAA_CONFIG: FAAConfig = {
  partsScope: ['145'],
  specialtyId: 'airworthiness-asi',
  inspectionTypeId: 'part145-routine-surveillance',
};

export function getInspectionTypeById(specialtyId: string, inspectionTypeId: string) {
  const specialty = FAA_INSPECTOR_SPECIALTIES.find((s) => s.id === specialtyId);
  return specialty?.inspectionTypes.find((t) => t.id === inspectionTypeId);
}

export function getSpecialtyById(specialtyId: string) {
  return FAA_INSPECTOR_SPECIALTIES.find((s) => s.id === specialtyId);
}
