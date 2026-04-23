export type LogbookReviewStandard =
  | 'part_43_general'
  | 'part_91'
  | 'part_121'
  | 'part_125'
  | 'part_135'
  | 'part_145'
  | 'easa_part_m'
  | 'easa_part_145';

export interface CompanyContextPacket {
  repairStation?: {
    companyName?: string;
    certNumber?: string;
    certTypesHeld?: string[];
    easaApprovalRef?: string;
    operationsScope?: string;
  };
  opSpecs?: Array<{
    certPart?: string;
    paragraph?: string;
    title?: string;
    notes?: string;
    isActive?: boolean;
  }>;
  capabilityList?: Array<{
    clNumber?: string;
    articleDescription: string;
    make?: string;
    model?: string;
    partNumber?: string;
    authorizedFunctions?: string[];
    isActive?: boolean;
  }>;
  roster?: Array<{
    fullName: string;
    roleTitle?: string;
    certificateNumber?: string;
    capabilities?: string[];
    isActive?: boolean;
  }>;
  manuals?: Array<{
    title: string;
    currentRevision?: string;
    manualType?: string;
  }>;
  sharedReferences?: Array<{
    name: string;
    documentType?: string;
    source?: string;
  }>;
}

const MAX_ITEMS_PER_SECTION = 40;
const MAX_STRING = 240;

function trimString(s: unknown, max = MAX_STRING): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function trimStringArray(values: unknown, maxItems = 8, maxChars = 64): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values
    .map((v) => trimString(v, maxChars))
    .filter((v): v is string => Boolean(v))
    .slice(0, maxItems);
  return out.length ? out : undefined;
}

function certPartFromStandard(standard: LogbookReviewStandard): string | undefined {
  switch (standard) {
    case 'part_121':
      return '121';
    case 'part_125':
      return '125';
    case 'part_135':
      return '135';
    case 'part_145':
      return '145';
    default:
      return undefined;
  }
}

export function compactCompanyContext(
  input: CompanyContextPacket | null | undefined,
  standard: LogbookReviewStandard,
): CompanyContextPacket {
  if (!input) return {};
  const certPart = certPartFromStandard(standard);
  const opSpecs = (input.opSpecs ?? [])
    .filter((row) => (certPart ? String(row.certPart ?? '').trim() === certPart : true))
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((row) => ({
      certPart: trimString(row.certPart, 12),
      paragraph: trimString(row.paragraph, 24),
      title: trimString(row.title, 140),
      notes: trimString(row.notes, 140),
      isActive: row.isActive !== false,
    }));

  const capabilityList = (input.capabilityList ?? [])
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((row) => ({
      clNumber: trimString(row.clNumber, 32),
      articleDescription: trimString(row.articleDescription, 140) ?? 'Unspecified article',
      make: trimString(row.make, 64),
      model: trimString(row.model, 64),
      partNumber: trimString(row.partNumber, 64),
      authorizedFunctions: trimStringArray(row.authorizedFunctions, 8, 64),
      isActive: row.isActive !== false,
    }));

  const roster = (input.roster ?? [])
    .filter((row) => row.isActive !== false)
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((row) => ({
      fullName: trimString(row.fullName, 80) ?? 'Unknown person',
      roleTitle: trimString(row.roleTitle, 64),
      certificateNumber: trimString(row.certificateNumber, 48),
      capabilities: trimStringArray(row.capabilities, 10, 48),
      isActive: true,
    }));

  const manuals = (input.manuals ?? [])
    .slice(0, 20)
    .map((row) => ({
      title: trimString(row.title, 120) ?? 'Untitled',
      currentRevision: trimString(row.currentRevision, 32),
      manualType: trimString(row.manualType, 48),
    }));

  const sharedReferences = (input.sharedReferences ?? [])
    .slice(0, 25)
    .map((row) => ({
      name: trimString(row.name, 120) ?? 'Unnamed reference',
      documentType: trimString(row.documentType, 40),
      source: trimString(row.source, 40),
    }));

  return {
    repairStation: input.repairStation
      ? {
          companyName: trimString(input.repairStation.companyName, 120),
          certNumber: trimString(input.repairStation.certNumber, 48),
          certTypesHeld: trimStringArray(input.repairStation.certTypesHeld, 12, 12),
          easaApprovalRef: trimString(input.repairStation.easaApprovalRef, 48),
          operationsScope: trimString(input.repairStation.operationsScope, 180),
        }
      : undefined,
    opSpecs,
    capabilityList,
    roster,
    manuals,
    sharedReferences,
  };
}

function standardBlock(standard: LogbookReviewStandard): string {
  switch (standard) {
    case 'part_91':
      return 'Apply 14 CFR Part 91 inspection/operator context and maintenance-record requirements under Part 43.';
    case 'part_121':
      return 'Apply 14 CFR Part 121 operator maintenance program context and records expectations with Part 43 entry rules.';
    case 'part_125':
      return 'Apply 14 CFR Part 125 operator maintenance/inspection context and Part 43 maintenance-entry requirements.';
    case 'part_135':
      return 'Apply 14 CFR Part 135 operator context and Part 43 maintenance-entry requirements.';
    case 'part_145':
      return 'Apply 14 CFR Part 145 repair-station requirements plus Part 43 record entries and RTS signoff expectations.';
    case 'easa_part_m':
      return 'Apply EASA Part-M (M.A.305) continuing airworthiness record requirements.';
    case 'easa_part_145':
      return 'Apply EASA Part-145 (145.A.50 CRS requirements) and maintenance release requirements.';
    default:
      return 'Apply 14 CFR Part 43 maintenance record requirements, including 43.9 and 43.11 where applicable.';
  }
}

export function buildLogbookReviewSystem({ standard }: { standard: LogbookReviewStandard }): string {
  return `You are an expert aviation maintenance records auditor.\n\nPrimary regulatory scope:\n${standardBlock(standard)}\n\nAlways cross-check the entry against provided company context (repair station profile, OpSpecs, capability list, roster, manuals). Flag scope or authorization conflicts.\n\nYou respond ONLY with a JSON object (no markdown) matching this schema:\n{\n  "overallCompliance": "compliant" | "minor_issues" | "major_issues" | "non_compliant",\n  "complianceScore": <integer 0-100>,\n  "regulatoryFramework": "FAA" | "EASA",\n  "findings": [\n    {\n      "severity": "critical" | "major" | "advisory",\n      "category": "missing_field" | "inadequate_description" | "signoff_deficiency" | "regulatory_gap" | "best_practice" | "roster_mismatch" | "capability_scope" | "opspec_scope",\n      "field": "<field name if applicable>",\n      "citation": "<exact CFR/EASA/company cite>",\n      "issue": "<clear description>",\n      "suggestedText": "<optional improved text>"\n    }\n  ],\n  "suggestedWorkPerformed": "<optional>",\n  "suggestedRts": "<optional>"\n}\n\nUse conservative scoring: 100 fully compliant, 85-99 advisory only, 70-84 minor issues, 50-69 major issues, 0-49 non-compliant.`;
}

export function buildLogbookReviewUser(args: {
  mode: 'text' | 'image';
  entryText?: string;
  standard: LogbookReviewStandard;
  companyContext: CompanyContextPacket;
}): string {
  const context = compactCompanyContext(args.companyContext, args.standard);
  const entryText = args.entryText?.trim();
  const intro =
    args.mode === 'image'
      ? 'Review the logbook entry shown in the attached image.'
      : 'Review the following logbook entry text.';
  const entryBlock = entryText ? `\n\nEntry text:\n---\n${entryText}\n---` : '';
  return `${intro}\nSelected standard: ${args.standard}\n\nCompany context JSON:\n${JSON.stringify(context, null, 2)}${entryBlock}\n\nCross-check against both the selected standard and company context. Respond with JSON only.`;
}
