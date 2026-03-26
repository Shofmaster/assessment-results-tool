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

  // ═══════════════════════════════════════════════════════════════════════
  // Wave 1: Supply Chain, NADCAP, Defense, Airworthiness
  // ═══════════════════════════════════════════════════════════════════════

  {
    framework: "supply-chain",
    label: "Supply Chain / Counterfeit Avoidance",
    version: "2026.03.1",
    variants: [
      {
        id: "as6081-incoming",
        label: "AS6081 Incoming Inspection",
        items: [
          { section: "Purchasing Controls", title: "Verify parts sourced from OCM, OEM, or authorized distributors", requirementRef: "AS6081 §3.1", evidenceHint: "Approved supplier list, purchase orders, OCM certificates", severity: "critical" },
          { section: "Receiving Inspection", title: "Confirm incoming inspection per AS6171 test flows", requirementRef: "AS6081 §3.3 / AS6171", evidenceHint: "Incoming inspection records, visual inspection photos, XRF results", severity: "critical" },
          { section: "Traceability", title: "Validate chain of custody from OCM/OEM to point of use", requirementRef: "AS6081 §3.2", evidenceHint: "CoC documents, lot traceability records, shipping documentation", severity: "major" },
          { section: "Suspect Part Reporting", title: "Verify GIDEP/ERAI reporting process for suspect parts", requirementRef: "AS6081 §3.5 / DFARS 252.246-7007", evidenceHint: "GIDEP reports filed, suspect part log, quarantine records", severity: "major" },
          { section: "Quarantine & Disposition", title: "Confirm suspect parts quarantined and not returned to supply chain", requirementRef: "AS6081 §3.4", evidenceHint: "Quarantine area, disposition records, destruction documentation", severity: "critical" },
          { section: "Training", title: "Ensure counterfeit awareness training is current", requirementRef: "AS6081 §3.6", evidenceHint: "Training records, training material, attendance logs", severity: "major" },
        ],
      },
      {
        id: "distributor-as9120",
        label: "AS9120B Distributor QMS",
        items: [
          { section: "Supplier Evaluation", title: "Document evaluation and selection process for suppliers", requirementRef: "AS9120B §8.4", evidenceHint: "Supplier evaluation forms, approved supplier list, audit records", severity: "major" },
          { section: "Product Traceability", title: "Maintain traceability throughout distribution chain", requirementRef: "AS9120B §8.5.2", evidenceHint: "Lot/batch traceability records, CoC chain", severity: "critical" },
          { section: "Shelf Life Management", title: "Control shelf life items with documented procedures", requirementRef: "AS9120B §8.5.4", evidenceHint: "Shelf life tracking system, FIFO procedures, expiration monitoring", severity: "major" },
          { section: "Storage & Handling", title: "Verify storage conditions protect product integrity", requirementRef: "AS9120B §8.5.4", evidenceHint: "Storage area inspection, ESD controls, climate monitoring", severity: "major" },
          { section: "Customer Property", title: "Control customer-consigned product per documented procedures", requirementRef: "AS9120B §8.5.3", evidenceHint: "Customer property log, condition reports, storage records", severity: "minor" },
        ],
      },
    ],
  },
  {
    framework: "nadcap",
    label: "NADCAP Special Processes",
    version: "2026.03.1",
    variants: [
      {
        id: "ndt",
        label: "NDT (Nondestructive Testing)",
        items: [
          { section: "Personnel Qualification", title: "Verify NDT operator certification per NAS 410 / EN 4179", requirementRef: "AC7114 / NAS 410", evidenceHint: "Certification records, vision test results, experience logs", severity: "critical" },
          { section: "Written Practices", title: "Confirm written practice for each NDT method is current and approved", requirementRef: "AC7114", evidenceHint: "Written practices for PT, MT, UT, RT, ET, VT", severity: "major" },
          { section: "Equipment Calibration", title: "Validate equipment calibration and maintenance records", requirementRef: "AC7114", evidenceHint: "Calibration certificates, maintenance logs, calibration schedules", severity: "major" },
          { section: "Reference Standards", title: "Verify reference standards/test specimens are controlled and current", requirementRef: "AC7114", evidenceHint: "Reference standard inventory, traceability certificates", severity: "major" },
          { section: "Process Control", title: "Confirm acceptance/rejection criteria documented per specification", requirementRef: "AC7114", evidenceHint: "Process control documents, customer specifications, acceptance criteria", severity: "critical" },
        ],
      },
      {
        id: "heat-treat",
        label: "Heat Treating",
        items: [
          { section: "Pyrometry", title: "Verify TUS, SAT, and instrumentation per AMS 2750", requirementRef: "AC7102 / AMS 2750", evidenceHint: "TUS reports, SAT records, thermocouple calibrations", severity: "critical" },
          { section: "Process Control", title: "Confirm process control documents for each material/specification", requirementRef: "AC7102", evidenceHint: "Traveler records, chart recordings, process parameters", severity: "major" },
          { section: "Furnace Classification", title: "Validate furnace class, type, and instrumentation type assignments", requirementRef: "AMS 2750", evidenceHint: "Furnace classification records, equipment list", severity: "major" },
          { section: "Quenchant Control", title: "Verify quench media monitoring, maintenance, and testing", requirementRef: "AC7102", evidenceHint: "Quench analysis logs, cooling curve data, fluid maintenance records", severity: "major" },
          { section: "Load Recording", title: "Confirm load thermocouples and chart recordings per specification", requirementRef: "AC7102 / AMS 2750", evidenceHint: "Load TC records, time-temperature charts, data logs", severity: "critical" },
        ],
      },
      {
        id: "chemical-processing",
        label: "Chemical Processing",
        items: [
          { section: "Solution Control", title: "Verify solution analysis frequency, limits, and corrective actions", requirementRef: "AC7108", evidenceHint: "Solution analysis logs, control charts, lab reports", severity: "critical" },
          { section: "Process Flow", title: "Confirm tank sequencing and immersion times per specification", requirementRef: "AC7108", evidenceHint: "Process flow documents, traveler records, timer logs", severity: "major" },
          { section: "Hydrogen Embrittlement", title: "Validate H2 embrittlement relief baking performed within time limits", requirementRef: "AC7108 / ASTM B850", evidenceHint: "Bake records, time-from-plate to bake tracking", severity: "critical" },
          { section: "Waste Treatment", title: "Confirm waste treatment and environmental compliance", requirementRef: "AC7108", evidenceHint: "Discharge permits, waste manifests, environmental monitoring", severity: "major" },
          { section: "Operator Qualification", title: "Verify operator training and authorization documentation", requirementRef: "AC7108", evidenceHint: "Training records, authorization cards, competency assessments", severity: "major" },
        ],
      },
      {
        id: "welding",
        label: "Welding",
        items: [
          { section: "Welder Qualification", title: "Verify welder certifications per AWS D17.1 or applicable spec", requirementRef: "AC7110 / AWS D17.1", evidenceHint: "Welder qualification test records, certification cards", severity: "critical" },
          { section: "WPS/PQR", title: "Confirm Welding Procedure Specifications and Procedure Qualification Records", requirementRef: "AC7110", evidenceHint: "WPS documents, PQR test results, parameter ranges", severity: "critical" },
          { section: "Shielding Gas", title: "Validate gas purity, flow rates, and dew point controls", requirementRef: "AC7110", evidenceHint: "Gas certificates, flow meter calibrations, dew point logs", severity: "major" },
          { section: "Post-Weld NDE", title: "Confirm post-weld inspection per specification requirements", requirementRef: "AC7110", evidenceHint: "NDE reports, visual inspection records, radiographic films", severity: "major" },
          { section: "Equipment", title: "Verify welding equipment calibration and maintenance", requirementRef: "AC7110", evidenceHint: "Equipment calibration records, maintenance logs", severity: "major" },
        ],
      },
      {
        id: "electronics",
        label: "Electronics (Soldering/Cable/PCB)",
        items: [
          { section: "Soldering Process", title: "Verify soldering per J-STD-001 with applicable class/addendum", requirementRef: "AC7122 / J-STD-001", evidenceHint: "Soldering records, workmanship samples, rework records", severity: "critical" },
          { section: "Operator Certification", title: "Confirm operator IPC certification current per J-STD-001", requirementRef: "AC7122", evidenceHint: "IPC certification cards, recertification schedule", severity: "major" },
          { section: "Cable/Harness", title: "Validate cable and wire harness assembly per IPC/WHMA-A-620", requirementRef: "AC7120 / IPC/WHMA-A-620", evidenceHint: "Assembly records, pull test results, continuity checks", severity: "major" },
          { section: "ESD Control", title: "Verify ESD control program per ANSI/ESD S20.20", requirementRef: "AC7120 / ANSI/ESD S20.20", evidenceHint: "ESD audit records, wrist strap test logs, EPA verification", severity: "major" },
          { section: "Conformal Coating", title: "Confirm conformal coating process control and inspection", requirementRef: "AC7123", evidenceHint: "Coating thickness records, UV inspection results, cure verification", severity: "major" },
        ],
      },
      {
        id: "composites",
        label: "Composites",
        items: [
          { section: "Material Control", title: "Verify receiving inspection, shelf life tracking, and cold storage", requirementRef: "AC7118", evidenceHint: "Material receiving records, freezer logs, shelf life tracking", severity: "critical" },
          { section: "Layup/Placement", title: "Confirm ply orientation, stacking sequence, and placement accuracy", requirementRef: "AC7118", evidenceHint: "Layup records, ply maps, laser projection data", severity: "major" },
          { section: "Cure Monitoring", title: "Validate autoclave/oven cure parameters and documentation", requirementRef: "AC7118", evidenceHint: "Cure cycle charts, thermocouple data, vacuum integrity logs", severity: "critical" },
          { section: "NDI of Laminates", title: "Verify ultrasonic or other NDI of cured laminates", requirementRef: "AC7118", evidenceHint: "UT C-scan images, acceptance criteria, reference standards", severity: "major" },
          { section: "Deviation Handling", title: "Confirm out-of-tolerance cure deviations are dispositioned", requirementRef: "AC7118", evidenceHint: "Nonconformance reports, MRB dispositions, engineering approvals", severity: "major" },
        ],
      },
      {
        id: "coatings",
        label: "Coatings",
        items: [
          { section: "Surface Preparation", title: "Verify surface prep and cleanliness verification before coating", requirementRef: "AC7109", evidenceHint: "Surface prep records, cleanliness test results, water break tests", severity: "critical" },
          { section: "Coating Application", title: "Confirm application parameters per specification", requirementRef: "AC7109", evidenceHint: "Spray records, film thickness measurements, application logs", severity: "major" },
          { section: "Thickness & Adhesion", title: "Validate coating thickness and adhesion testing", requirementRef: "AC7109", evidenceHint: "Thickness gage readings, tape test results, bend test specimens", severity: "major" },
          { section: "Cure/Bake", title: "Confirm cure temperature and time per coating specification", requirementRef: "AC7109", evidenceHint: "Oven charts, time-temperature records", severity: "major" },
          { section: "Masking & Protection", title: "Verify masking procedures protect critical surfaces", requirementRef: "AC7109", evidenceHint: "Masking procedures, post-coating inspection records", severity: "minor" },
        ],
      },
    ],
  },
  {
    framework: "defense",
    label: "Defense Aerospace Quality",
    version: "2026.03.1",
    variants: [
      {
        id: "far-dfars-quality",
        label: "FAR/DFARS Quality Clauses",
        items: [
          { section: "Higher-Level QMS", title: "Verify AS9100/higher-level QMS invoked per FAR 52.246-11", requirementRef: "FAR 52.246-11", evidenceHint: "AS9100 certificate, QMS manual, registration body audit", severity: "critical" },
          { section: "Government Inspection", title: "Confirm GSI access and notification procedures", requirementRef: "FAR 52.246-2", evidenceHint: "GSI notification log, inspection area access, DCMA contact", severity: "major" },
          { section: "Counterfeit Avoidance", title: "Validate counterfeit detection and avoidance system", requirementRef: "DFARS 252.246-7007", evidenceHint: "Counterfeit avoidance plan, GIDEP membership, inspection records", severity: "critical" },
          { section: "Contract Flowdown", title: "Verify quality clause flowdown to subcontractors", requirementRef: "FAR 52.246 / DFARS 252.246", evidenceHint: "Purchase orders, subcontract terms, flowdown matrix", severity: "major" },
          { section: "CDRL/SDRL Management", title: "Confirm deliverable management per contract requirements", requirementRef: "Contract-specific", evidenceHint: "CDRL status tracker, deliverable transmittals, acceptance records", severity: "major" },
        ],
      },
      {
        id: "first-article-as9102",
        label: "First Article Inspection (AS9102)",
        items: [
          { section: "FAI Triggering", title: "Verify FAI triggers identified (new part, design change, 2-yr gap, etc.)", requirementRef: "AS9102 §4.2", evidenceHint: "FAI trigger log, change control records, production gap analysis", severity: "major" },
          { section: "Form 1 - Part Number", title: "Confirm Form 1 completeness with part number and drawing revision", requirementRef: "AS9102 §4.3", evidenceHint: "AS9102 Form 1, drawing index, revision records", severity: "critical" },
          { section: "Form 2 - Product", title: "Validate Form 2 with raw material, special process, and functional test results", requirementRef: "AS9102 §4.4", evidenceHint: "AS9102 Form 2, material certs, process records, test data", severity: "critical" },
          { section: "Form 3 - Characteristics", title: "Verify all design characteristics measured and documented on Form 3", requirementRef: "AS9102 §4.5", evidenceHint: "AS9102 Form 3, CMM reports, dimensional results, ballooned drawings", severity: "critical" },
          { section: "Partial FAI", title: "Confirm partial FAI scope justified and documented when applicable", requirementRef: "AS9102 §4.6", evidenceHint: "Partial FAI justification, affected characteristic identification", severity: "major" },
        ],
      },
      {
        id: "government-property",
        label: "Government Property (FAR 52.245)",
        items: [
          { section: "Property System", title: "Verify documented property management system per FAR 52.245-1", requirementRef: "FAR 52.245-1", evidenceHint: "Property management procedures, system description, DCMA approval", severity: "critical" },
          { section: "Receipt & Records", title: "Confirm receipt, identification, and record maintenance for GFP/GFM", requirementRef: "FAR 52.245-1(f)", evidenceHint: "Receipt records, property tags, database entries", severity: "major" },
          { section: "Physical Inventory", title: "Validate physical inventory and reconciliation procedures", requirementRef: "FAR 52.245-1(f)(1)(vii)", evidenceHint: "Inventory reports, reconciliation records, discrepancy resolution", severity: "major" },
          { section: "Loss/Damage Reporting", title: "Confirm loss, damage, or destruction reporting procedures", requirementRef: "FAR 52.245-1(f)(1)(vi)", evidenceHint: "Incident reports, investigation records, government notifications", severity: "critical" },
          { section: "Subcontractor Flowdown", title: "Verify government property requirements flowed to subcontractors", requirementRef: "FAR 52.245-1(j)", evidenceHint: "Subcontract property terms, sub-tier property records", severity: "major" },
        ],
      },
    ],
  },
  {
    framework: "airworthiness",
    label: "Airworthiness Certification",
    version: "2026.03.1",
    variants: [
      {
        id: "type-cert-fixed-wing",
        label: "Type Certification (Fixed-Wing)",
        items: [
          { section: "Certification Basis", title: "Confirm certification basis (applicable CFR, special conditions, exemptions)", requirementRef: "14 CFR §21.17", evidenceHint: "Type Certificate Data Sheet, certification basis document, CRI list", severity: "critical" },
          { section: "Means of Compliance", title: "Verify means of compliance for each requirement", requirementRef: "14 CFR Part 21 / Part 23/25", evidenceHint: "MOC matrix, compliance checklist, test plans, analysis reports", severity: "critical" },
          { section: "Flight Test", title: "Validate flight test program completeness and results", requirementRef: "14 CFR §21.35", evidenceHint: "Flight test plans, flight test reports, conformity inspection records", severity: "critical" },
          { section: "ICA", title: "Confirm Instructions for Continued Airworthiness (including Airworthiness Limitations)", requirementRef: "14 CFR §21.50 / Part 25 App H", evidenceHint: "ICA documents, Airworthiness Limitations section, CMM references", severity: "critical" },
          { section: "Safety Assessment", title: "Verify system safety assessment per AC 25.1309/23.1309", requirementRef: "§25.1309 / §23.2510", evidenceHint: "FHA, PSSA, SSA documents, DAL allocation", severity: "major" },
        ],
      },
      {
        id: "type-cert-rotorcraft",
        label: "Type Certification (Rotorcraft)",
        items: [
          { section: "Certification Basis", title: "Confirm certification basis (Part 27/29, special conditions)", requirementRef: "14 CFR §21.17 / Part 27/29", evidenceHint: "TCDS, certification basis, CRI/special conditions", severity: "critical" },
          { section: "Rotor System", title: "Verify rotor system substantiation (fatigue, damage tolerance)", requirementRef: "14 CFR §27/29.571", evidenceHint: "Fatigue analysis, damage tolerance evaluation, component life limits", severity: "critical" },
          { section: "Autorotation/OEI", title: "Validate autorotation and OEI performance demonstrations", requirementRef: "14 CFR §27/29.143, §27/29.67", evidenceHint: "Flight test data, HV diagram, OEI performance charts", severity: "critical" },
          { section: "ICA", title: "Confirm ICA and retirement life limits for life-limited parts", requirementRef: "14 CFR §21.50 / §27/29.571", evidenceHint: "Airworthiness Limitations, RLC list, ICA documents", severity: "critical" },
          { section: "Vibration Health", title: "Verify vibration survey and health monitoring provisions", requirementRef: "14 CFR §27/29.251", evidenceHint: "Vibration survey reports, HUMS provisions, ground resonance analysis", severity: "major" },
        ],
      },
      {
        id: "production-approval",
        label: "Production Approval (PC/PMA/TSOA)",
        items: [
          { section: "Quality System", title: "Verify documented quality system per 14 CFR §21.137/21.307", requirementRef: "14 CFR Part 21 Subpart F/G/K/O", evidenceHint: "Quality manual, process procedures, org chart", severity: "critical" },
          { section: "Manufacturing Processes", title: "Confirm manufacturing processes controlled and documented", requirementRef: "14 CFR §21.143/21.309", evidenceHint: "Process specifications, work instructions, special process approvals", severity: "major" },
          { section: "Supplier Control", title: "Validate supplier surveillance and incoming inspection", requirementRef: "14 CFR §21.137(e)", evidenceHint: "Approved supplier list, incoming inspection procedures, supplier audits", severity: "major" },
          { section: "Inspection & Test", title: "Verify inspection and test at each critical manufacturing stage", requirementRef: "14 CFR §21.143", evidenceHint: "Inspection plans, test procedures, acceptance criteria, test results", severity: "critical" },
          { section: "Airworthiness Determination", title: "Confirm each article determination of airworthiness before release", requirementRef: "14 CFR §21.143(d)/21.316", evidenceHint: "FAA Form 8130-3, airworthiness tags, release documentation", severity: "critical" },
        ],
      },
      {
        id: "stc-field-approval",
        label: "STC / Field Approval",
        items: [
          { section: "STC Application", title: "Verify STC application completeness and certification basis", requirementRef: "14 CFR §21.113-21.120", evidenceHint: "STC application, certification plan, affected TCDS", severity: "critical" },
          { section: "Design Substantiation", title: "Confirm design analysis and test substantiation for modified areas", requirementRef: "14 CFR Part 23/25/27/29", evidenceHint: "Stress reports, DTA, test reports, analysis summaries", severity: "critical" },
          { section: "Data Package", title: "Validate STC data package (drawings, specifications, installation instructions)", requirementRef: "14 CFR §21.115", evidenceHint: "Engineering drawings, parts list, installation instructions", severity: "major" },
          { section: "ICA for Modification", title: "Confirm ICA addresses new/modified components from STC", requirementRef: "14 CFR §21.50", evidenceHint: "STC ICA supplement, maintenance manual supplement, AWL changes", severity: "critical" },
          { section: "Conformity Inspection", title: "Verify conformity inspection of prototype installation", requirementRef: "14 CFR §21.33", evidenceHint: "Conformity inspection records, FAA Form 8100-1, photographs", severity: "major" },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Wave 2: DO-178C, DO-254, Systems Safety, Environmental Testing
  // ═══════════════════════════════════════════════════════════════════════

  {
    framework: "do178c",
    label: "DO-178C Software Assurance",
    version: "2026.03.1",
    variants: [
      {
        id: "dal-a",
        label: "DAL A (Catastrophic)",
        items: [
          { section: "Planning", title: "Verify PSAC, SDP, SVP, SCMP, SQAP complete and approved", requirementRef: "DO-178C §4", evidenceHint: "Plan documents, SOI #1 review records", severity: "critical" },
          { section: "Requirements", title: "Confirm HLR/LLR traceability and derived requirements identified", requirementRef: "DO-178C §5.1-5.2", evidenceHint: "Requirements traceability matrix, derived requirements list", severity: "critical" },
          { section: "Verification", title: "Validate MC/DC structural coverage achieved (100% or justified)", requirementRef: "DO-178C §6.4.4.2", evidenceHint: "Structural coverage report, MC/DC analysis, dead code analysis", severity: "critical" },
          { section: "Independence", title: "Confirm verification independence (different person than developer)", requirementRef: "DO-178C Table A-5", evidenceHint: "Verification assignments, independence matrix", severity: "critical" },
          { section: "CM", title: "Verify configuration baselines, change control, and build procedures", requirementRef: "DO-178C §7", evidenceHint: "CM records, baseline index, build procedures", severity: "major" },
          { section: "QA", title: "Confirm QA conformance reviews and transition criteria compliance", requirementRef: "DO-178C §8", evidenceHint: "QA records, conformance review reports, SAS", severity: "major" },
        ],
      },
      {
        id: "dal-b",
        label: "DAL B (Hazardous)",
        items: [
          { section: "Planning", title: "Verify planning documents complete and approved", requirementRef: "DO-178C §4", evidenceHint: "PSAC, SDP, SVP, SCMP, SQAP", severity: "critical" },
          { section: "Requirements", title: "Confirm requirements traceability (HLR and LLR)", requirementRef: "DO-178C §5", evidenceHint: "Traceability matrix, requirements review records", severity: "critical" },
          { section: "Verification", title: "Validate decision coverage achieved", requirementRef: "DO-178C §6.4.4.2", evidenceHint: "Structural coverage report (decision + statement)", severity: "critical" },
          { section: "Testing", title: "Confirm requirements-based testing (normal range and robustness)", requirementRef: "DO-178C §6.4", evidenceHint: "Test procedures, test results, traceability to requirements", severity: "major" },
          { section: "CM & QA", title: "Verify CM and QA processes meet DAL B objectives", requirementRef: "DO-178C §7-8", evidenceHint: "CM records, QA reports, SAS", severity: "major" },
        ],
      },
      {
        id: "dal-c",
        label: "DAL C (Major)",
        items: [
          { section: "Planning", title: "Verify planning documents address DAL C objectives", requirementRef: "DO-178C §4", evidenceHint: "PSAC, development/verification plans", severity: "major" },
          { section: "Requirements", title: "Confirm HLR traceability and review", requirementRef: "DO-178C §5", evidenceHint: "Requirements documents, review records", severity: "major" },
          { section: "Verification", title: "Validate statement coverage achieved", requirementRef: "DO-178C §6.4.4.2", evidenceHint: "Structural coverage report (statement)", severity: "major" },
          { section: "Testing", title: "Confirm requirements-based testing for normal range", requirementRef: "DO-178C §6.4", evidenceHint: "Test procedures, test results", severity: "major" },
        ],
      },
      {
        id: "dal-d",
        label: "DAL D (Minor)",
        items: [
          { section: "Planning", title: "Verify minimal planning addresses DAL D objectives", requirementRef: "DO-178C §4", evidenceHint: "PSAC, high-level plans", severity: "minor" },
          { section: "Development", title: "Confirm development processes followed", requirementRef: "DO-178C §5", evidenceHint: "Development records", severity: "minor" },
          { section: "Verification", title: "Validate requirements-based testing performed (no structural coverage required)", requirementRef: "DO-178C §6", evidenceHint: "Test results, requirements mapping", severity: "minor" },
        ],
      },
      {
        id: "tool-qualification",
        label: "Tool Qualification (DO-330)",
        items: [
          { section: "Tool Classification", title: "Verify tool qualification level (TQL-1 through TQL-5) determined", requirementRef: "DO-330 §2.3 / DO-178C §12.2", evidenceHint: "Tool qualification plan, criteria determination", severity: "critical" },
          { section: "Tool Operational Requirements", title: "Confirm tool operational requirements documented", requirementRef: "DO-330 §5", evidenceHint: "Tool operational requirements document", severity: "major" },
          { section: "Tool Verification", title: "Validate tool verification commensurate with TQL", requirementRef: "DO-330 §6", evidenceHint: "Tool test cases, coverage analysis, tool accomplishment summary", severity: "major" },
        ],
      },
    ],
  },
  {
    framework: "do254",
    label: "DO-254 Hardware Assurance",
    version: "2026.03.1",
    variants: [
      {
        id: "dal-a-b",
        label: "DAL A/B (Catastrophic/Hazardous)",
        items: [
          { section: "Planning", title: "Verify PHAC complete with DAL assignment and lifecycle definition", requirementRef: "DO-254 §3", evidenceHint: "PHAC document, SOI records", severity: "critical" },
          { section: "Requirements", title: "Confirm hardware requirements traced to system requirements", requirementRef: "DO-254 §4", evidenceHint: "Requirements traceability matrix, system-to-hardware allocation", severity: "critical" },
          { section: "Design", title: "Validate conceptual and detailed design documentation", requirementRef: "DO-254 §5", evidenceHint: "Architecture documents, schematics, FPGA RTL, timing analysis", severity: "critical" },
          { section: "Verification", title: "Confirm elemental analysis and requirements-based verification", requirementRef: "DO-254 §6", evidenceHint: "Verification plan, test results, simulation results, coverage analysis", severity: "critical" },
          { section: "COTS Assessment", title: "Verify COTS component usage assessment per §11.2", requirementRef: "DO-254 §11.2 / AC 20-152A", evidenceHint: "COTS assessment reports, errata reviews, usage domain analysis", severity: "major" },
          { section: "CM & Process Assurance", title: "Confirm CM and process assurance for hardware lifecycle", requirementRef: "DO-254 §7-8", evidenceHint: "CM records, process assurance reports, HAS", severity: "major" },
        ],
      },
      {
        id: "dal-c-d",
        label: "DAL C/D (Major/Minor)",
        items: [
          { section: "Planning", title: "Verify PHAC addresses DAL C/D objectives", requirementRef: "DO-254 §3", evidenceHint: "PHAC, hardware development plan", severity: "major" },
          { section: "Requirements & Design", title: "Confirm hardware requirements and design documentation", requirementRef: "DO-254 §4-5", evidenceHint: "Requirements, design documents, schematics", severity: "major" },
          { section: "Verification", title: "Validate basic verification performed per DAL", requirementRef: "DO-254 §6", evidenceHint: "Test results, basic functional verification", severity: "major" },
          { section: "COTS", title: "Confirm COTS components identified and assessed", requirementRef: "DO-254 §11.2", evidenceHint: "COTS list, basic assessment", severity: "minor" },
        ],
      },
    ],
  },
  {
    framework: "systems-safety",
    label: "Systems Safety (ARP4754A / ARP4761)",
    version: "2026.03.1",
    variants: [
      {
        id: "system-level-fha-pssa-ssa",
        label: "System-Level Safety Assessment (FHA/PSSA/SSA)",
        items: [
          { section: "FHA", title: "Verify Functional Hazard Assessment complete with failure condition classification", requirementRef: "ARP4761 §5 / 14 CFR §25.1309", evidenceHint: "Aircraft-level FHA, system-level FHAs, failure condition list", severity: "critical" },
          { section: "PSSA", title: "Confirm Preliminary System Safety Assessment with safety requirements", requirementRef: "ARP4761 §6", evidenceHint: "PSSA document, safety requirements list, fault trees (top-level)", severity: "critical" },
          { section: "SSA", title: "Validate System Safety Assessment shows implementation meets requirements", requirementRef: "ARP4761 §7", evidenceHint: "SSA document, final fault trees, FMEA/FMECA results", severity: "critical" },
          { section: "CCA", title: "Verify Common Cause Analysis (PRA, CMA, ZSA) performed", requirementRef: "ARP4761 §6.2", evidenceHint: "CCA report, zonal analysis, particular risk analysis, CMA results", severity: "critical" },
          { section: "DAL Allocation", title: "Confirm DAL allocation from safety assessment to SW/HW items", requirementRef: "ARP4754A §5.3", evidenceHint: "DAL allocation table, FDAL/IDAL assignments", severity: "major" },
        ],
      },
      {
        id: "subsystem-fmea-fta",
        label: "Subsystem Analysis (FMEA/FTA)",
        items: [
          { section: "FMEA/FMECA", title: "Verify FMEA covers all components with failure modes and effects", requirementRef: "ARP4761 Appendix", evidenceHint: "FMEA worksheets, RPN calculations, severity ratings", severity: "critical" },
          { section: "Fault Tree Analysis", title: "Confirm fault trees developed for hazardous/catastrophic failure conditions", requirementRef: "ARP4761 Appendix", evidenceHint: "Fault tree diagrams, cut set analysis, probability calculations", severity: "critical" },
          { section: "Quantitative Analysis", title: "Validate probability budgets meet 14 CFR §25.1309 targets", requirementRef: "AC 25.1309-1A", evidenceHint: "Probability calculations, failure rate data sources, assumptions", severity: "critical" },
          { section: "Safety Requirements Traceability", title: "Confirm safety requirements traced to implementation and verification", requirementRef: "ARP4754A §5", evidenceHint: "Safety requirements traceability matrix", severity: "major" },
        ],
      },
    ],
  },
  {
    framework: "environmental-test",
    label: "Environmental Testing (DO-160G / MIL-STD-810H)",
    version: "2026.03.1",
    variants: [
      {
        id: "do160-qualification",
        label: "DO-160G Qualification",
        items: [
          { section: "Category Assignment", title: "Verify DO-160G categories assigned based on installation location", requirementRef: "DO-160G §1-3", evidenceHint: "Category assignment document, installation drawings, EQTP", severity: "critical" },
          { section: "Temperature/Altitude", title: "Confirm temp and altitude testing to correct category", requirementRef: "DO-160G §4", evidenceHint: "Test report Section 4, chamber logs, DUT monitoring", severity: "critical" },
          { section: "Vibration", title: "Validate vibration testing per correct category (S/S1/S2/U/U2)", requirementRef: "DO-160G §8", evidenceHint: "Vibration test report, PSD plots, fixture analysis", severity: "critical" },
          { section: "EMI/EMC", title: "Confirm RF emission and susceptibility per Sections 20-21", requirementRef: "DO-160G §20-21", evidenceHint: "EMI/EMC test report, emissions plots, susceptibility thresholds", severity: "major" },
          { section: "Lightning", title: "Verify lightning transient susceptibility testing per Section 22", requirementRef: "DO-160G §22", evidenceHint: "Lightning test report, waveform data, pin injection results", severity: "major" },
          { section: "Lab Accreditation", title: "Confirm test lab accredited (ISO 17025 or NVLAP)", requirementRef: "ISO/IEC 17025", evidenceHint: "Lab accreditation certificate, scope of accreditation", severity: "major" },
        ],
      },
      {
        id: "mil-std-810h",
        label: "MIL-STD-810H Environmental",
        items: [
          { section: "LCEP", title: "Verify Life Cycle Environmental Profile developed", requirementRef: "MIL-STD-810H Part One", evidenceHint: "LCEP document, environmental characterization data", severity: "major" },
          { section: "Climatic Tests", title: "Confirm temperature, humidity, altitude testing per LCEP", requirementRef: "MIL-STD-810H Methods 500-507", evidenceHint: "Test reports, chamber data, DUT performance records", severity: "critical" },
          { section: "Dynamic Tests", title: "Validate vibration and shock testing", requirementRef: "MIL-STD-810H Methods 514, 516", evidenceHint: "Vibration/shock test reports, PSD profiles, shock response spectra", severity: "critical" },
          { section: "Environmental Tests", title: "Confirm sand/dust, salt fog, and other environmental tests", requirementRef: "MIL-STD-810H Methods 509-512", evidenceHint: "Environmental test reports, specimen photographs", severity: "major" },
        ],
      },
      {
        id: "emc-mil-std-461g",
        label: "EMC/EMI (MIL-STD-461G)",
        items: [
          { section: "Conducted Emissions", title: "Verify CE101/CE102 conducted emissions compliance", requirementRef: "MIL-STD-461G CE101/CE102", evidenceHint: "CE test reports, emissions plots vs. limits", severity: "major" },
          { section: "Conducted Susceptibility", title: "Confirm CS101/CS114/CS115/CS116 testing", requirementRef: "MIL-STD-461G CS series", evidenceHint: "CS test reports, injection levels, performance criteria", severity: "major" },
          { section: "Radiated Emissions", title: "Validate RE101/RE102 radiated emissions compliance", requirementRef: "MIL-STD-461G RE101/RE102", evidenceHint: "RE test reports, antenna factor data, emissions plots", severity: "major" },
          { section: "Radiated Susceptibility", title: "Confirm RS103 radiated susceptibility testing", requirementRef: "MIL-STD-461G RS103", evidenceHint: "RS test report, field strength levels, performance criteria", severity: "major" },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Wave 3: Space, Cybersecurity, UAS/eVTOL, Labs, Additive Mfg
  // ═══════════════════════════════════════════════════════════════════════

  {
    framework: "space",
    label: "Space Systems (ECSS / NASA)",
    version: "2026.03.1",
    variants: [
      {
        id: "ecss-product-assurance",
        label: "ECSS Product Assurance (Q-ST-10/20)",
        items: [
          { section: "PA Management", title: "Verify Product Assurance plan per ECSS-Q-ST-10C", requirementRef: "ECSS-Q-ST-10C §5", evidenceHint: "PA plan, PA requirements matrix, supplier PA allocation", severity: "critical" },
          { section: "Quality Assurance", title: "Confirm QA inspections, tests, and nonconformance control", requirementRef: "ECSS-Q-ST-20C", evidenceHint: "Inspection records, test reports, NCR log, MRB minutes", severity: "critical" },
          { section: "EEE Parts", title: "Validate EEE parts management (selection, screening, derating)", requirementRef: "ECSS-Q-ST-60C", evidenceHint: "Declared Components List, screening records, derating analysis", severity: "critical" },
          { section: "Materials & Processes", title: "Verify materials selection, outgassing, and contamination control", requirementRef: "ECSS-Q-ST-70C", evidenceHint: "DMRL, outgassing test data (ECSS-Q-ST-70-02), contamination budgets", severity: "major" },
          { section: "Configuration Management", title: "Confirm CM per ECSS-M-ST-40C", requirementRef: "ECSS-M-ST-40C", evidenceHint: "Configuration item list, change control records, CM audit records", severity: "major" },
        ],
      },
      {
        id: "nasa-workmanship-8739",
        label: "NASA Workmanship (8739 Series)",
        items: [
          { section: "Soldered Connections", title: "Verify soldering per NASA-STD-8739.3 (hand) or .4 (machine)", requirementRef: "NASA-STD-8739.3/4", evidenceHint: "Soldering inspection records, operator certifications, process specs", severity: "critical" },
          { section: "Crimp Connections", title: "Confirm crimped connections per NASA-STD-8739.4", requirementRef: "NASA-STD-8739.4", evidenceHint: "Crimp records, pull test data, tooling calibration", severity: "major" },
          { section: "Fiber Optics", title: "Validate fiber optic cable assembly per NASA-STD-8739.5", requirementRef: "NASA-STD-8739.5", evidenceHint: "Fiber optic assembly records, optical loss measurements", severity: "major" },
          { section: "Fracture Control", title: "Confirm fracture control per NASA-STD-5019 for metallic structures", requirementRef: "NASA-STD-5019A", evidenceHint: "Fracture control plan, NDE records, material certifications", severity: "critical" },
          { section: "NDE", title: "Verify NDE per NASA-STD-5009 for fracture-critical components", requirementRef: "NASA-STD-5009A", evidenceHint: "NDE procedures, inspection records, Level III certifications", severity: "critical" },
        ],
      },
    ],
  },
  {
    framework: "cybersecurity",
    label: "Airborne Cybersecurity (DO-326A / CMMC)",
    version: "2026.03.1",
    variants: [
      {
        id: "airborne-do326a",
        label: "DO-326A Airborne Security",
        items: [
          { section: "Security Risk Assessment", title: "Verify threat assessment and security risk analysis performed", requirementRef: "DO-326A §3", evidenceHint: "Threat model, vulnerability analysis, risk evaluation", severity: "critical" },
          { section: "Security Requirements", title: "Confirm security requirements derived from risk assessment", requirementRef: "DO-326A §4", evidenceHint: "Security requirements document, traceability to threats", severity: "critical" },
          { section: "Security Architecture", title: "Validate security architecture (defense in depth, least privilege)", requirementRef: "DO-326A §5", evidenceHint: "Security architecture document, network diagrams, access controls", severity: "major" },
          { section: "Security Verification", title: "Confirm security testing (penetration test, vulnerability scan)", requirementRef: "DO-326A §6 / DO-356A", evidenceHint: "Penetration test report, vulnerability scan results, code review", severity: "critical" },
          { section: "Lifecycle Management", title: "Verify ongoing security management (patches, incident response)", requirementRef: "DO-326A §7", evidenceHint: "Patch management plan, incident response procedures, CVE tracking", severity: "major" },
        ],
      },
      {
        id: "cmmc-level-2",
        label: "CMMC 2.0 Level 2",
        items: [
          { section: "Access Control", title: "Verify access control per NIST SP 800-171 AC family", requirementRef: "NIST 800-171 §3.1", evidenceHint: "Access control policy, account management, least privilege evidence", severity: "critical" },
          { section: "Audit & Accountability", title: "Confirm audit logging and review per AU family", requirementRef: "NIST 800-171 §3.3", evidenceHint: "Audit logs, log review procedures, event correlation", severity: "major" },
          { section: "Incident Response", title: "Validate incident response capabilities per IR family", requirementRef: "NIST 800-171 §3.6", evidenceHint: "IR plan, IR team, drill records, reporting procedures", severity: "major" },
          { section: "System Protection", title: "Verify system and communications protection per SC family", requirementRef: "NIST 800-171 §3.13", evidenceHint: "Network architecture, encryption, boundary protection, FIPS validation", severity: "critical" },
          { section: "Self-Assessment", title: "Confirm SPRS score calculated and posted (if applicable)", requirementRef: "DFARS 252.204-7019/7020", evidenceHint: "SPRS score, SSP, POA&M for gaps", severity: "major" },
        ],
      },
    ],
  },
  {
    framework: "uas-evtol",
    label: "UAS / eVTOL Certification",
    version: "2026.03.1",
    variants: [
      {
        id: "type-cert-evtol",
        label: "eVTOL Type Certification",
        items: [
          { section: "Certification Basis", title: "Verify certification basis (special conditions, means of compliance)", requirementRef: "14 CFR §21.17(b) / EASA SC-VTOL-01", evidenceHint: "Certification basis document, special conditions, MOC matrix", severity: "critical" },
          { section: "Battery Safety", title: "Confirm battery thermal runaway and propagation analysis/testing", requirementRef: "SC-VTOL / FAA Special Conditions", evidenceHint: "Battery safety analysis, thermal propagation test data, BMS design", severity: "critical" },
          { section: "DEP Redundancy", title: "Validate distributed electric propulsion redundancy analysis", requirementRef: "SC-VTOL", evidenceHint: "Propulsion FMEA, loss-of-thrust analysis, continued safe flight demo", severity: "critical" },
          { section: "Transition Flight", title: "Verify transition flight envelope analysis and testing", requirementRef: "SC-VTOL", evidenceHint: "Transition flight test data, simulation results, envelope analysis", severity: "critical" },
          { section: "Noise", title: "Confirm noise certification compliance", requirementRef: "14 CFR Part 36 / SC-VTOL", evidenceHint: "Noise measurement data, flight test noise profiles", severity: "major" },
        ],
      },
      {
        id: "sora-risk-assessment",
        label: "JARUS SORA Risk Assessment",
        items: [
          { section: "ConOps", title: "Verify Concept of Operations documented", requirementRef: "SORA §2", evidenceHint: "ConOps document, operational area definition, flight profiles", severity: "critical" },
          { section: "Ground Risk", title: "Confirm Ground Risk Class (GRC) properly determined", requirementRef: "SORA §3", evidenceHint: "GRC determination, population density data, sheltering analysis", severity: "critical" },
          { section: "Air Risk", title: "Validate Air Risk Class (ARC) assessment", requirementRef: "SORA §4", evidenceHint: "ARC assessment, airspace analysis, encounter rate data", severity: "critical" },
          { section: "SAIL Determination", title: "Verify SAIL determined from GRC and ARC", requirementRef: "SORA §5", evidenceHint: "SAIL matrix, final SAIL level, applicable OSOs", severity: "major" },
          { section: "OSO Compliance", title: "Confirm Operational Safety Objectives (OSOs) met for SAIL level", requirementRef: "SORA §6 / Annex E", evidenceHint: "OSO compliance matrix, evidence per OSO, robustness levels", severity: "major" },
        ],
      },
      {
        id: "part-107-operations",
        label: "Part 107 Operations",
        items: [
          { section: "Remote Pilot", title: "Verify remote pilot certification and currency", requirementRef: "14 CFR §107.61-79", evidenceHint: "Remote pilot certificate, recurrent testing records", severity: "critical" },
          { section: "Operating Rules", title: "Confirm VLOS, altitude, and airspace compliance", requirementRef: "14 CFR §107.31-51", evidenceHint: "Flight logs, airspace authorizations (LAANC), preflight checklists", severity: "major" },
          { section: "Remote ID", title: "Validate Remote ID compliance per Part 89/ASTM F3548", requirementRef: "14 CFR Part 89 / ASTM F3548", evidenceHint: "Remote ID module serial, broadcast verification, FRIA documentation", severity: "major" },
          { section: "Waivers", title: "Confirm any Part 107 waivers are current and conditions met", requirementRef: "14 CFR §107.200", evidenceHint: "Waiver certificates, condition compliance records", severity: "major" },
        ],
      },
    ],
  },
  {
    framework: "laboratory",
    label: "Laboratory / Calibration (ISO 17025)",
    version: "2026.03.1",
    variants: [
      {
        id: "iso17025-accreditation",
        label: "ISO/IEC 17025 Accreditation",
        items: [
          { section: "Personnel Competence", title: "Verify personnel competence, training, and authorization records", requirementRef: "ISO/IEC 17025 §6.2", evidenceHint: "Training records, competence assessments, authorization matrix", severity: "major" },
          { section: "Equipment", title: "Confirm equipment calibrated and maintained with traceability", requirementRef: "ISO/IEC 17025 §6.4-6.5", evidenceHint: "Calibration certificates, equipment list, intermediate checks", severity: "critical" },
          { section: "Method Validation", title: "Validate test methods validated or verified for intended use", requirementRef: "ISO/IEC 17025 §7.2", evidenceHint: "Method validation reports, verification records", severity: "major" },
          { section: "Measurement Uncertainty", title: "Confirm measurement uncertainty evaluated and documented", requirementRef: "ISO/IEC 17025 §7.6", evidenceHint: "Uncertainty budgets, GUM-based calculations", severity: "major" },
          { section: "Proficiency Testing", title: "Verify participation in proficiency testing / inter-lab comparisons", requirementRef: "ISO/IEC 17025 §7.7", evidenceHint: "PT results, z-scores, corrective actions for unsatisfactory results", severity: "major" },
          { section: "Reporting", title: "Confirm test reports meet §7.8 requirements", requirementRef: "ISO/IEC 17025 §7.8", evidenceHint: "Sample test reports, accreditation mark usage, opinion statements", severity: "minor" },
        ],
      },
      {
        id: "calibration-z540",
        label: "Calibration (ANSI Z540.3)",
        items: [
          { section: "Calibration Intervals", title: "Verify calibration intervals established with documented basis", requirementRef: "ANSI/NCSL Z540.3 §5.3", evidenceHint: "Interval analysis, adjustment rate data, reliability targets", severity: "major" },
          { section: "Decision Risk", title: "Confirm false accept risk ≤2% for calibration decisions", requirementRef: "ANSI/NCSL Z540.3 §5.3", evidenceHint: "Decision risk calculations, guard-banding documentation", severity: "critical" },
          { section: "Procedures", title: "Validate calibration procedures documented and traceable", requirementRef: "ANSI/NCSL Z540.3 §5.2", evidenceHint: "Calibration procedures, reference standard traceability", severity: "major" },
          { section: "Records", title: "Confirm calibration records complete (as-found, as-left, uncertainty)", requirementRef: "ANSI/NCSL Z540.3 §5.4", evidenceHint: "Calibration certificates, as-found/as-left data", severity: "major" },
        ],
      },
    ],
  },
  {
    framework: "additive-mfg",
    label: "Additive Manufacturing",
    version: "2026.03.1",
    variants: [
      {
        id: "lpbf-qualification",
        label: "LPBF Qualification",
        items: [
          { section: "Machine Qualification", title: "Verify machine qualified with build volume characterization", requirementRef: "MSFC-STD-3716 §4.3 / AMS7002", evidenceHint: "Machine qualification report, build volume mapping, witness coupons", severity: "critical" },
          { section: "Powder Management", title: "Confirm powder control (virgin/recycled ratio, chemistry, PSD)", requirementRef: "AMS7002 / MSFC-STD-3716 §4.5", evidenceHint: "Powder lot records, recycling log, chemistry certs, PSD data", severity: "critical" },
          { section: "Process Parameters", title: "Validate locked process parameters with documented qualification", requirementRef: "AMS7002/7003/7004", evidenceHint: "Parameter sets, qualification test results, density measurements", severity: "critical" },
          { section: "Post-Processing", title: "Confirm HIP, heat treatment, and surface finishing per specification", requirementRef: "AMS7002 / MSFC-STD-3716 §4.7", evidenceHint: "HIP records, heat treat charts, surface roughness measurements", severity: "major" },
          { section: "NDE", title: "Verify CT scan or other NDE per part classification", requirementRef: "MSFC-STD-3716 §4.9", evidenceHint: "CT scan reports, conventional NDE results, acceptance criteria", severity: "critical" },
          { section: "Mechanical Testing", title: "Confirm witness coupon tensile/fatigue testing meets minimums", requirementRef: "AMS7002 / ASTM F3301", evidenceHint: "Tensile test data, fatigue test results per build orientation", severity: "critical" },
        ],
      },
      {
        id: "process-control-monitoring",
        label: "Process Control & Monitoring",
        items: [
          { section: "In-Process Monitoring", title: "Verify melt pool or layer monitoring capability and data retention", requirementRef: "MSFC-STD-3716 §4.6", evidenceHint: "Monitoring system specs, data retention policy, anomaly detection", severity: "major" },
          { section: "Environment Control", title: "Confirm inert atmosphere (O2, moisture) monitoring and limits", requirementRef: "AMS7002", evidenceHint: "O2 sensor logs, atmosphere monitoring data, alarm records", severity: "major" },
          { section: "Build Documentation", title: "Validate build file, orientation, and support strategy documented", requirementRef: "MSFC-STD-3716 §4.4", evidenceHint: "Build files, orientation records, support strategy documents", severity: "major" },
          { section: "Traceability", title: "Confirm traceability from powder lot through finished part", requirementRef: "MSFC-STD-3716 §4.10", evidenceHint: "Lot traceability records, build history, serialization", severity: "major" },
          { section: "Deviation Handling", title: "Verify out-of-tolerance builds dispositioned per documented procedures", requirementRef: "MSFC-STD-3716 §4.11", evidenceHint: "Nonconformance reports, MRB actions, engineering dispositions", severity: "major" },
        ],
      },
    ],
  },
];

export function getFrameworkTemplate(framework: string): AuditChecklistFrameworkTemplate | undefined {
  return AUDIT_CHECKLIST_TEMPLATES.find((template) => template.framework === framework);
}
