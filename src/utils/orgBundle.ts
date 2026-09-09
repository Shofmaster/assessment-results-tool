export const ORG_BUNDLE_VERSION = '1.0.0';

export const ORG_BUNDLE_SCOPE = {
  includes: [
    'company',
    'entityProfiles',
    'certificateProfiles',
    'classRatings',
    'capabilities',
    'opSpecs',
    'limitedRatings',
    'rosterPersonnel',
    'rosterRequirementTypes',
    'rosterAssignments',
  ],
  excludes: [
    'billing',
    'memberships',
    'projects',
    'manuals',
    'logbooks',
    'fleet',
  ],
} as const;

// ---------------------------------------------------------------------------
// Export types — stripped of internal Convex IDs, using portable string refs
// ---------------------------------------------------------------------------

export type EntityProfileExport = {
  /** Stable key for dedup on import */
  _exportKey: string;
  companyName?: string;
  legalEntityName?: string;
  primaryLocation?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  repairStationType?: string;
  facilitySquareFootage?: number;
  employeeCount?: number;
  operationsScope?: string;
  certifications?: string[];
  aircraftCategories?: string[];
  servicesOffered?: string[];
  hasSms?: boolean;
  smsMaturity?: string;
  designAssuranceLevels?: { softwareDal?: string; hardwareDal?: string };
  nadcapAccreditations?: string[];
  cmmcLevel?: string;
  spacePrograms?: string[];
  isDefenseContractor?: boolean;
  amCapabilities?: string[];
  uasCertifications?: string[];
  labAccreditations?: string[];
  faaCertificateNumber?: string;
  faaChdo?: string;
  faaCertificateDate?: string;
  faaLastAmendmentDate?: string;
  faaPeerGroup?: 'F' | 'G' | 'H';
  faaPart121Certificate?: string;
  faaPart135Certificate?: string;
  faaPart125Certificate?: string;
  faaPart129Certificate?: string;
  faaPart133Certificate?: string;
  faaPart137Certificate?: string;
  faaPart141Certificate?: string;
  faaPart142Certificate?: string;
  faaPart147Certificate?: string;
  faaPart91KCertificate?: string;
  faaCertTypesHeld?: string[];
  part65Authorizations?: string[];
  easaApprovalRef?: string;
  easaCompetentAuthority?: string;
  easaPart145Expiry?: string;
  easaPartCamoRef?: string;
  easaPartCaoRef?: string;
  easaPart147Ref?: string;
  easaPart21Ref?: string;
  easaLineMaintenanceBases?: string[];
  easaForm4PostHolders?: { roleId: string; name: string; email?: string }[];
  qualityStandards?: string[];
  isbaoLevel?: string;
  itarRegistered?: boolean;
  dfarsCompliant?: boolean;
  icaoStateOfRegistry?: string;
  createdAt: string;
  updatedAt: string;
};

export type CertificateProfileExport = {
  /** References an EntityProfileExport._exportKey */
  entityProfileKey?: string;
  profileCode: string;
  authority: string;
  certificateType: string;
  status: string;
  certificateMetadata?: {
    certificateNumber?: string;
    issuedDate?: string;
    expiryDate?: string;
    lastAmendmentDate?: string;
    surveillanceAnchorDate?: string;
  };
  operationalScope?: {
    scopeKey?: string;
    operationClass?: string;
    lineMaintenance?: boolean;
    baseMaintenance?: boolean;
    componentMaintenance?: boolean;
    avionicsMaintenance?: boolean;
    geography?: string;
  };
  obligationSetVersion?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClassRatingExport = {
  entityProfileKey: string;
  authority?: 'faa' | 'easa' | 'other';
  category: string;
  classNumber: number;
  limitations?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CapabilityExport = {
  entityProfileKey: string;
  authority?: 'faa' | 'easa' | 'other';
  clNumber?: string;
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  authorizedFunctions: string[];
  technicalDataRef?: string;
  notes?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OpSpecExport = {
  entityProfileKey: string;
  authority?: 'faa' | 'easa' | 'other';
  certPart?: string;
  docType?: 'opspec' | 'mspec' | 'tspec' | 'loa';
  paragraph: string;
  title?: string;
  acceptedDate?: string;
  expiryDate?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LimitedRatingExport = {
  entityProfileKey: string;
  authority?: 'faa' | 'easa' | 'other';
  ratingKind: string;
  articleDescription: string;
  make?: string;
  model?: string;
  partNumber?: string;
  authorizedFunctions: string[];
  easaCategory?: string;
  easaRating?: string;
  limitations?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonnelExport = {
  /** Stable key for dedup and reportsTo references */
  _exportKey: string;
  fullName: string;
  roleTitle?: string;
  jobDescription?: string;
  department?: string;
  managementLevel?: string;
  cardColor?: string;
  /** References another PersonnelExport._exportKey */
  reportsToKey?: string;
  employeeId?: string;
  certificateNumber?: string;
  capabilities: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RequirementTypeExport = {
  _exportKey: string;
  name: string;
  category?: string;
  description?: string;
  defaultRecurrenceDays?: number;
  defaultGraceDays?: number;
  dueDateStrategy?: 'fixed_days' | 'fixed_interval' | 'calendar_month_end' | 'ia_march_odd_year';
  defaultIntervalValue?: number;
  defaultIntervalUnit?: 'days' | 'months' | 'years';
  defaultCalendarMonths?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentExport = {
  personKey: string;
  requirementTypeKey: string;
  assignedDate?: string;
  lastCompletedDate?: string;
  dueDate?: string;
  recurrenceDaysOverride?: number;
  recurrenceIntervalValueOverride?: number;
  recurrenceIntervalUnitOverride?: 'days' | 'months' | 'years';
  graceDaysOverride?: number;
  notes?: string;
  evidenceLink?: string;
  evidence?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type OrgBundle = {
  version: string;
  exportedAt: string;
  scope: typeof ORG_BUNDLE_SCOPE;
  company: { name: string; slug?: string };
  entityProfiles?: EntityProfileExport[];
  certificateProfiles?: CertificateProfileExport[];
  classRatings?: ClassRatingExport[];
  capabilities?: CapabilityExport[];
  opSpecs?: OpSpecExport[];
  limitedRatings?: LimitedRatingExport[];
  rosterPersonnel?: PersonnelExport[];
  rosterRequirementTypes?: RequirementTypeExport[];
  rosterAssignments?: AssignmentExport[];
};

// ---------------------------------------------------------------------------
// Parse / validate
// ---------------------------------------------------------------------------

export function parseOrgBundle(raw: unknown): OrgBundle {
  if (!raw || typeof raw !== 'object') {
    throw new Error('The file is not a valid AeroGap organization bundle.');
  }
  const bundle = raw as Record<string, unknown>;
  if (bundle.version !== ORG_BUNDLE_VERSION) {
    throw new Error(
      `Unsupported bundle version "${String(bundle.version)}". Expected ${ORG_BUNDLE_VERSION}.`,
    );
  }
  const company = bundle.company as { name?: string; slug?: string } | undefined;
  if (!company?.name?.trim()) {
    throw new Error('The bundle is missing a company name.');
  }
  return bundle as OrgBundle;
}

// ---------------------------------------------------------------------------
// Filename helper
// ---------------------------------------------------------------------------

export function orgBundleFilename(companyName: string): string {
  const slug = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug || 'organization'}-${stamp}.aqo.json`;
}

// ---------------------------------------------------------------------------
// Download (browser)
// ---------------------------------------------------------------------------

export function downloadOrgBundle(bundle: OrgBundle, filename: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Read from file input
// ---------------------------------------------------------------------------

export async function readOrgBundleFile(file: File): Promise<OrgBundle> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  return parseOrgBundle(parsed);
}

// ---------------------------------------------------------------------------
// Desktop pending bundle (for .aqo.json file association)
// ---------------------------------------------------------------------------

export async function consumeDesktopPendingOrgBundle(): Promise<OrgBundle | null> {
  const raw = await (
    window as unknown as { aerogapShell?: { consumePendingOrgBundle?: () => Promise<string | null> } }
  ).aerogapShell?.consumePendingOrgBundle?.();
  if (!raw) return null;
  return parseOrgBundle(JSON.parse(raw));
}

export const ORG_BUNDLE_SCOPE_SUMMARY =
  'Includes company profile, entity profiles, certificate profiles, class ratings, capabilities, operations specifications, limited ratings, roster personnel, requirement types, and training assignments. Excludes billing, memberships, projects, manuals, logbooks, and fleet.';
