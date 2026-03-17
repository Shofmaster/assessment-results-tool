import type { AuditorCoverageAgentId } from './auditorDocumentRequirements';

export interface CoveragePilotScenario {
  id: string;
  label: string;
  auditors: AuditorCoverageAgentId[];
}

export interface CoverageSuccessMetric {
  id: string;
  label: string;
  targetDirection: 'up' | 'down';
}

export const COVERAGE_PILOT_SCENARIOS: CoveragePilotScenario[] = [
  {
    id: 'regulator-heavy',
    label: 'FAA + EASA + AS9100',
    auditors: ['faa-inspector', 'easa-inspector', 'as9100-auditor'],
  },
  {
    id: 'sms-heavy',
    label: 'SMS Consultant + Safety Auditor + Safety Manager',
    auditors: ['sms-consultant', 'safety-auditor', 'entity-safety-manager'],
  },
  {
    id: 'entity-leadership',
    label: 'Shop Owner + DOM + Chief Inspector + General Manager',
    auditors: ['shop-owner', 'dom-maintenance-manager', 'chief-inspector-quality-manager', 'general-manager'],
  },
];

export const COVERAGE_SUCCESS_METRICS: CoverageSuccessMetric[] = [
  {
    id: 'uploads-to-full-coverage',
    label: 'Average uploads to full required coverage',
    targetDirection: 'down',
  },
  {
    id: 'duplicate-uploads',
    label: 'Duplicate upload rate',
    targetDirection: 'down',
  },
  {
    id: 'time-to-ready-simulation',
    label: 'Time to ready-for-simulation status',
    targetDirection: 'down',
  },
  {
    id: 'auditor-coverage-at-upload',
    label: 'Auditor coverage percent per upload action',
    targetDirection: 'up',
  },
];
