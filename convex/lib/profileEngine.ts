type DbCtx = {
  db: {
    get: (id: any) => Promise<any>;
    query: (table: string) => {
      withIndex: (indexName: string, cb: (q: any) => any) => { collect: () => Promise<any[]>; unique?: () => Promise<any> };
      collect: () => Promise<any[]>;
    };
  };
};

export const PROFILE_FEATURE_KEYS = {
  PROFILE_ENGINE_V2: "profile-engine-v2",
  PROFILE_AWARE_CHECKLISTS: "profile-aware-checklists",
  PROFILE_AWARE_SCHEDULER: "profile-aware-scheduler",
  PROFILE_AWARE_REPORTING: "profile-aware-reporting",
} as const;

type ProfileFeatureKey = (typeof PROFILE_FEATURE_KEYS)[keyof typeof PROFILE_FEATURE_KEYS];

function resolveEnabledList(companyValue: string[] | null | undefined, userValue: string[] | null | undefined): string[] | null {
  if (companyValue !== undefined) return companyValue;
  if (userValue !== undefined) return userValue;
  return null;
}

function isFeatureEnabledForList(enabledFeatures: string[] | null, key: string): boolean {
  if (enabledFeatures === null) return true;
  return enabledFeatures.includes(key);
}

async function getCompanyPolicyForProject(ctx: DbCtx, projectId: any): Promise<any | null> {
  const project = await ctx.db.get(projectId);
  if (!project?.companyId) return null;
  return (
    (await ctx.db
      .query("companyFeaturePolicies")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId))
      .unique?.()) ?? null
  );
}

async function getUserSettings(ctx: DbCtx, userId: string): Promise<any | null> {
  return (
    (await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique?.()) ?? null
  );
}

export async function isProjectFeatureEnabled(
  ctx: DbCtx,
  projectId: any,
  userId: string,
  featureKey: ProfileFeatureKey,
): Promise<boolean> {
  const [companyPolicy, userSettings] = await Promise.all([
    getCompanyPolicyForProject(ctx, projectId),
    getUserSettings(ctx, userId),
  ]);
  const enabled = resolveEnabledList(companyPolicy?.enabledFeatures, userSettings?.enabledFeatures);
  return isFeatureEnabledForList(enabled, featureKey);
}

export async function resolveActiveCertificateProfile(
  ctx: DbCtx,
  projectId: any,
  legacyEntityProfileId?: any,
): Promise<any | null> {
  if (legacyEntityProfileId) {
    const byLegacy = await ctx.db
      .query("certificateProfiles")
      .withIndex("by_entityProfileId", (q) => q.eq("entityProfileId", legacyEntityProfileId))
      .collect();
    if (byLegacy.length > 0) {
      return byLegacy.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    }
  }

  const projectProfiles = await ctx.db
    .query("certificateProfiles")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();
  const activeProjectProfiles = projectProfiles.filter((row) => row.status === "active");
  if (activeProjectProfiles.length > 0) {
    return activeProjectProfiles.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  }

  const project = await ctx.db.get(projectId);
  if (!project?.companyId) return null;

  const companyProfiles = await ctx.db
    .query("certificateProfiles")
    .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId))
    .collect();
  const activeCompanyProfiles = companyProfiles.filter((row) => row.status === "active");
  if (activeCompanyProfiles.length === 0) return null;
  return activeCompanyProfiles.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
}

export async function resolveObligationSetVersionForProfile(ctx: DbCtx, profile: any | null): Promise<string | undefined> {
  if (!profile) return undefined;
  if (profile.obligationSetVersion) return profile.obligationSetVersion;

  const defs = await ctx.db
    .query("obligationSetDefinitions")
    .withIndex("by_profileCode", (q) => q.eq("profileCode", profile.profileCode))
    .collect();
  const active = defs
    .filter((d) => d.isActive)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return active[0]?.version;
}

export async function resolveProfileContext(
  ctx: DbCtx,
  params: {
    projectId: any;
    userId: string;
    legacyEntityProfileId?: any;
    requireFeatureKey: ProfileFeatureKey;
  },
): Promise<{ certificateProfileId?: any; obligationSetVersion?: string }> {
  const enabled = await isProjectFeatureEnabled(ctx, params.projectId, params.userId, params.requireFeatureKey);
  if (!enabled) return {};

  const profile = await resolveActiveCertificateProfile(ctx, params.projectId, params.legacyEntityProfileId);
  if (!profile) return {};
  const obligationSetVersion = await resolveObligationSetVersionForProfile(ctx, profile);
  return {
    certificateProfileId: profile._id,
    obligationSetVersion,
  };
}

