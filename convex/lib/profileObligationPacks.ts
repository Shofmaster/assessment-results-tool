export type ObligationRuleSeed = {
  ruleId: string;
  sourceReference?: string;
  intervalType?: string;
  intervalValue?: number;
  gracePolicy?: string;
  anchorPolicy?: string;
  defaultOwnerRole?: string;
  escalationPolicy?: string;
  evidenceRequirement?: string;
  createsChecklistTemplate?: boolean;
  reportSectionMapping?: string;
  severity?: "critical" | "major" | "minor" | "observation";
};

export type ObligationPackSeed = {
  profileCode: string;
  authority: "faa" | "easa" | "isbao" | "as9100" | "icao" | "other";
  certificateType:
    | "part145"
    | "part135"
    | "part121"
    | "part125"
    | "part129"
    | "part133"
    | "part137"
    | "part141"
    | "part142"
    | "part147"
    | "part91k"
    | "part91loa"
    | "easa145"
    | "isbao"
    | "as9100"
    | "custom";
  version: string;
  rules: ObligationRuleSeed[];
};

export const DEFAULT_OBLIGATION_PACKS: ObligationPackSeed[] = [
  {
    profileCode: "faa:part145:default",
    authority: "faa",
    certificateType: "part145",
    version: "v1",
    rules: [
      {
        ruleId: "part145-manual-control-quarterly",
        sourceReference: "14 CFR 145.209",
        intervalType: "calendar",
        intervalValue: 3,
        defaultOwnerRole: "quality_manager",
        evidenceRequirement: "manual_revision_record",
        createsChecklistTemplate: true,
        reportSectionMapping: "manual_control",
        severity: "major",
      },
      {
        ruleId: "part145-training-currency-annual",
        sourceReference: "14 CFR 145.163",
        intervalType: "calendar",
        intervalValue: 12,
        defaultOwnerRole: "chief_inspector",
        evidenceRequirement: "training_record",
        createsChecklistTemplate: true,
        reportSectionMapping: "personnel_currency",
        severity: "major",
      },
    ],
  },
  {
    profileCode: "faa:part135:default",
    authority: "faa",
    certificateType: "part135",
    version: "v1",
    rules: [
      {
        ruleId: "part135-opspec-review-quarterly",
        sourceReference: "FAA OpSpecs Governance",
        intervalType: "calendar",
        intervalValue: 3,
        defaultOwnerRole: "director_of_operations",
        evidenceRequirement: "opspec_review_log",
        createsChecklistTemplate: true,
        reportSectionMapping: "opspec_readiness",
        severity: "major",
      },
      {
        ruleId: "part135-check-airman-cycle",
        sourceReference: "14 CFR Part 135 Training Program",
        intervalType: "calendar",
        intervalValue: 12,
        defaultOwnerRole: "training_manager",
        evidenceRequirement: "qualification_evidence",
        createsChecklistTemplate: true,
        reportSectionMapping: "training_compliance",
        severity: "major",
      },
    ],
  },
  {
    profileCode: "faa:part121:default",
    authority: "faa",
    certificateType: "part121",
    version: "v1",
    rules: [
      {
        ruleId: "part121-manual-distribution-check",
        sourceReference: "14 CFR Part 121 Manual Control",
        intervalType: "calendar",
        intervalValue: 1,
        defaultOwnerRole: "quality_manager",
        evidenceRequirement: "distribution_log",
        createsChecklistTemplate: true,
        reportSectionMapping: "manual_distribution",
        severity: "major",
      },
      {
        ruleId: "part121-audit-cycle-quarterly",
        sourceReference: "Part 121 Internal Oversight",
        intervalType: "calendar",
        intervalValue: 3,
        defaultOwnerRole: "compliance_manager",
        evidenceRequirement: "audit_cycle_record",
        createsChecklistTemplate: true,
        reportSectionMapping: "internal_audit",
        severity: "major",
      },
    ],
  },
  {
    profileCode: "easa:easa145:default",
    authority: "easa",
    certificateType: "easa145",
    version: "v1",
    rules: [
      {
        ruleId: "easa145-moe-review-cycle",
        sourceReference: "EASA Part-145 MOE",
        intervalType: "calendar",
        intervalValue: 6,
        defaultOwnerRole: "quality_manager",
        evidenceRequirement: "moe_revision_log",
        createsChecklistTemplate: true,
        reportSectionMapping: "moe_control",
        severity: "major",
      },
      {
        ruleId: "easa145-certifying-staff-review",
        sourceReference: "EASA Part-145 Personnel",
        intervalType: "calendar",
        intervalValue: 12,
        defaultOwnerRole: "chief_inspector",
        evidenceRequirement: "certifying_staff_matrix",
        createsChecklistTemplate: true,
        reportSectionMapping: "personnel_authorization",
        severity: "major",
      },
    ],
  },
  {
    profileCode: "isbao:isbao:default",
    authority: "isbao",
    certificateType: "isbao",
    version: "v1",
    rules: [
      {
        ruleId: "isbao-sms-review-quarterly",
        sourceReference: "IS-BAO SMS Continuous Improvement",
        intervalType: "calendar",
        intervalValue: 3,
        defaultOwnerRole: "safety_manager",
        evidenceRequirement: "sms_review_minutes",
        createsChecklistTemplate: true,
        reportSectionMapping: "sms_governance",
        severity: "major",
      },
    ],
  },
  {
    profileCode: "as9100:as9100:default",
    authority: "as9100",
    certificateType: "as9100",
    version: "v1",
    rules: [
      {
        ruleId: "as9100-process-audit-quarterly",
        sourceReference: "AS9100 Internal Audit",
        intervalType: "calendar",
        intervalValue: 3,
        defaultOwnerRole: "quality_manager",
        evidenceRequirement: "process_audit_record",
        createsChecklistTemplate: true,
        reportSectionMapping: "process_audit",
        severity: "major",
      },
    ],
  },
];

