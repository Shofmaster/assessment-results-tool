import { FAA_INSPECTOR_SPECIALTIES } from "../data/faaInspectorTypes";

export type ChecklistSeverity = "critical" | "major" | "minor" | "observation";

export interface AuditChecklistTemplateItem {
  section: string;
  title: string;
  description?: string;
  requirementRef?: string;
  evidenceHint?: string;
  severity: ChecklistSeverity;
}

export interface AuditChecklistTemplateVariant {
  id: string;
  label: string;
  items: AuditChecklistTemplateItem[];
}

export interface AuditChecklistFrameworkTemplate {
  framework: string;
  label: string;
  version: string;
  variants: AuditChecklistTemplateVariant[];
}

const coreMaintenanceItems: AuditChecklistTemplateItem[] = [
  {
    section: "Personnel and Qualifications",
    title: "Verify roster, certifications, and role coverage",
    description: "Ensure accountable personnel, inspection staff, and supervisors are current and documented.",
    evidenceHint: "Training matrix, roster, cert copies, role assignments",
    severity: "major",
  },
  {
    section: "Documentation Control",
    title: "Confirm current manuals and controlled revisions",
    description: "Validate all controlled manuals are current, approved, and accessible at point of use.",
    evidenceHint: "Revision logs, distribution list, latest manual snapshots",
    severity: "major",
  },
  {
    section: "Quality and Corrective Action",
    title: "Demonstrate CAPA closure and recurrence control",
    description: "Show that findings have root cause, corrective action, and effectiveness verification.",
    evidenceHint: "CAR log, root cause records, closure evidence",
    severity: "critical",
  },
];

const smsCoreItems: AuditChecklistTemplateItem[] = [
  {
    section: "Safety Policy",
    title: "Document SMS accountabilities and reporting channels",
    evidenceHint: "Safety policy, org chart, reporting workflow",
    severity: "major",
  },
  {
    section: "Risk Management",
    title: "Show current hazard register and risk assessments",
    evidenceHint: "Hazard log, risk matrix, mitigation owners",
    severity: "critical",
  },
  {
    section: "Safety Assurance",
    title: "Prove audit/monitoring closes identified gaps",
    evidenceHint: "Internal audit results, KPI trend reports",
    severity: "major",
  },
];

const thirdPartySafetyItems: AuditChecklistTemplateItem[] = [
  {
    section: "Operational Control",
    title: "Validate SOP adherence and dispatch controls",
    evidenceHint: "Ops control procedures, release records",
    severity: "major",
  },
  {
    section: "Crew and Maintenance Qualification",
    title: "Ensure crew and maintenance qualification currency",
    evidenceHint: "Crew currency records, maintenance authorizations",
    severity: "critical",
  },
  {
    section: "Safety Performance",
    title: "Track trends and pre-audit corrective actions",
    evidenceHint: "Trend dashboards, completed action plans",
    severity: "major",
  },
];

function buildFaaVariants(): AuditChecklistTemplateVariant[] {
  const variants: AuditChecklistTemplateVariant[] = [];
  for (const specialty of FAA_INSPECTOR_SPECIALTIES) {
    for (const inspectionType of specialty.inspectionTypes) {
      variants.push({
        id: inspectionType.id,
        label: `${specialty.name}: ${inspectionType.name}`,
        items: [
          ...coreMaintenanceItems,
          {
            section: "Regulatory Coverage",
            title: `Validate scope readiness for ${inspectionType.name}`,
            description: inspectionType.description,
            requirementRef: inspectionType.regulations.join("; "),
            evidenceHint: `Focus areas: ${inspectionType.focusAreas.join(", ")}`,
            severity: "critical",
          },
          {
            section: "Inspection Focus",
            title: "Confirm high-risk focus areas have objective evidence",
            description: "Use inspection focus areas to verify records and implementation evidence.",
            evidenceHint: inspectionType.focusAreas.join(", "),
            severity: "major",
          },
        ],
      });
    }
  }
  return variants;
}

export const AUDIT_CHECKLIST_TEMPLATES: AuditChecklistFrameworkTemplate[] = [
  {
    framework: "faa",
    label: "FAA Surveillance / Audit",
    version: "2026.03.1",
    variants: buildFaaVariants(),
  },
  {
    framework: "isbao",
    label: "IS-BAO",
    version: "2026.03.1",
    variants: [
      {
        id: "stage-1",
        label: "Stage 1 (SMS Infrastructure)",
        items: [
          ...smsCoreItems,
          {
            section: "IS-BAO Stage",
            title: "Verify Stage 1 governance artifacts are complete",
            requirementRef: "IS-BAO Stage 1",
            severity: "major",
          },
        ],
      },
      {
        id: "stage-2",
        label: "Stage 2 (Risk Management in Use)",
        items: [
          ...smsCoreItems,
          {
            section: "IS-BAO Stage",
            title: "Validate risk controls are operational and evidenced",
            requirementRef: "IS-BAO Stage 2",
            severity: "critical",
          },
        ],
      },
      {
        id: "stage-3",
        label: "Stage 3 (SMS Integrated Culture)",
        items: [
          ...smsCoreItems,
          {
            section: "IS-BAO Stage",
            title: "Show enterprise safety culture integration and improvement",
            requirementRef: "IS-BAO Stage 3",
            severity: "major",
          },
        ],
      },
    ],
  },
  {
    framework: "easa",
    label: "EASA Part-145",
    version: "2026.03.1",
    variants: [
      {
        id: "part-145",
        label: "Part-145 Readiness",
        items: [
          ...coreMaintenanceItems,
          {
            section: "MOE and Compliance",
            title: "Validate MOE completeness and practical implementation",
            requirementRef: "EASA Part-145 / MOE",
            severity: "critical",
          },
        ],
      },
    ],
  },
  {
    framework: "as9100",
    label: "AS9100 / AS9110",
    version: "2026.03.1",
    variants: [
      {
        id: "qms-readiness",
        label: "QMS Readiness",
        items: [
          {
            section: "QMS Governance",
            title: "Confirm process ownership and quality objectives",
            severity: "major",
          },
          {
            section: "Risk and Opportunity",
            title: "Maintain risk/opportunity register with actions",
            severity: "major",
          },
          {
            section: "Product and Service Control",
            title: "Show control of nonconforming outputs and disposition",
            severity: "critical",
          },
        ],
      },
    ],
  },
  {
    framework: "sms",
    label: "SMS / ICAO Readiness",
    version: "2026.03.1",
    variants: [
      {
        id: "sms-maturity",
        label: "SMS Maturity",
        items: smsCoreItems,
      },
    ],
  },
  {
    framework: "third-party-safety",
    label: "Third-Party Safety (ARGUS / Wyvern style)",
    version: "2026.03.1",
    variants: [
      {
        id: "operator-safety",
        label: "Operator Safety Profile",
        items: thirdPartySafetyItems,
      },
    ],
  },
  {
    framework: "public-use",
    label: "Public Use Aircraft",
    version: "2026.03.1",
    variants: [
      {
        id: "public-use-baseline",
        label: "Public Use Baseline",
        items: [
          {
            section: "Authorization Scope",
            title: "Confirm mission and legal authority boundaries",
            severity: "major",
          },
          {
            section: "Maintenance and Airworthiness",
            title: "Validate maintenance planning and release process",
            severity: "critical",
          },
          {
            section: "Operational Readiness",
            title: "Verify crew qualification and risk controls",
            severity: "major",
          },
        ],
      },
    ],
  },
  {
    framework: "iosa",
    label: "IOSA (Planned / Future)",
    version: "planned",
    variants: [
      {
        id: "planned",
        label: "Planned Template (Future)",
        items: [
          {
            section: "Planned Coverage",
            title: "Template reserved for future IOSA implementation",
            description: "Framework recognized but not currently selectable in simulation configuration.",
            severity: "observation",
          },
        ],
      },
    ],
  },
];

export function getFrameworkTemplate(framework: string): AuditChecklistFrameworkTemplate | undefined {
  return AUDIT_CHECKLIST_TEMPLATES.find((template) => template.framework === framework);
}
