/**
 * Organization bundle: build one from a company, and insert one into a company.
 *
 * Shared by the manual export/import (convex/orgBundle.ts) and the hosted →
 * desktop mirror (convex/mirror.ts). One implementation, so a field added to
 * the bundle travels by both routes or by neither.
 *
 * Authorisation is the CALLER's job: these functions assume it has been done.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ORG_BUNDLE_VERSION, ORG_BUNDLE_SCOPE } from "./orgBundle";

type Row = Record<string, unknown>;

async function collectForProfiles(
  ctx: QueryCtx | MutationCtx,
  table: "entityClassRatings" | "entityCapabilityList" | "entityOpSpecs" | "entityLimitedRatings",
  profileIds: Id<"entityProfiles">[],
): Promise<Row[]> {
  const results: Row[] = [];
  for (const id of profileIds) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_entityProfileId", (q) => q.eq("entityProfileId", id))
      .collect();
    results.push(...(rows as Row[]));
  }
  return results;
}

/** Everything the bundle carries about a company. Pure read. */
export async function buildOrgBundle(ctx: QueryCtx | MutationCtx, companyId: Id<"companies">) {
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");

  const entityProfiles = await ctx.db
    .query("entityProfiles")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  const entityProfileIds = entityProfiles.map((ep) => ep._id);

  const epKeyMap = new Map<string, string>();
  const entityProfileExports = entityProfiles.map((ep) => {
    const key = ep.faaCertificateNumber || ep.easaApprovalRef || ep.companyName || ep._id.toString();
    epKeyMap.set(ep._id.toString(), key);
    const {
      _id, _creationTime, projectId, companyId: _c, userId, sourceAssessmentId, importedFromAssessmentAt, lastSyncedAt,
      ...rest
    } = ep;
    return { _exportKey: key, ...rest };
  });

  const certificateProfiles = await ctx.db
    .query("certificateProfiles")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  const certExports = certificateProfiles.map((cp) => {
    const { _id, _creationTime, projectId, companyId: _c, entityProfileId, userId, manualSet, ...rest } = cp;
    return {
      entityProfileKey: entityProfileId ? epKeyMap.get(entityProfileId.toString()) : undefined,
      ...rest,
    };
  });

  const [allClassRatings, allCapabilities, allOpSpecs, allLimitedRatings] = await Promise.all([
    collectForProfiles(ctx, "entityClassRatings", entityProfileIds),
    collectForProfiles(ctx, "entityCapabilityList", entityProfileIds),
    collectForProfiles(ctx, "entityOpSpecs", entityProfileIds),
    collectForProfiles(ctx, "entityLimitedRatings", entityProfileIds),
  ]);

  const perProfile = (rows: Row[], dropTokens: boolean) =>
    rows.map((r) => {
      const { _id, _creationTime, entityProfileId, projectId, companyId: _c, normalizedTokens, ...rest } = r;
      return {
        entityProfileKey: epKeyMap.get(String(entityProfileId)) || "",
        ...(dropTokens ? rest : { ...rest, ...(normalizedTokens === undefined ? {} : { normalizedTokens }) }),
      };
    });

  // Roster is project-scoped; gather across the company's projects and dedupe.
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();

  const allPersonnel: Row[] = [];
  const allReqTypes: Row[] = [];
  const allAssignments: Row[] = [];
  for (const project of projects) {
    const [personnel, reqTypes, assignments] = await Promise.all([
      ctx.db.query("rosterPersonnel").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("rosterRequirementTypes").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).collect(),
      ctx.db.query("rosterAssignments").withIndex("by_projectId", (q) => q.eq("projectId", project._id)).collect(),
    ]);
    allPersonnel.push(...(personnel as Row[]));
    allReqTypes.push(...(reqTypes as Row[]));
    allAssignments.push(...(assignments as Row[]));
  }

  const seenPersonnel = new Set<string>();
  const personKeyMap = new Map<string, string>();
  const personnelExports = allPersonnel
    .filter((p) => {
      const dedupKey = `${String(p.employeeId || "")}|${String(p.fullName)}`;
      if (seenPersonnel.has(dedupKey)) return false;
      seenPersonnel.add(dedupKey);
      return true;
    })
    .map((p) => {
      const key = p.employeeId ? `${String(p.employeeId)}|${String(p.fullName)}` : String(p._id);
      personKeyMap.set(String(p._id), key);
      const { _id, _creationTime, projectId, userId, reportsToPersonId, ...rest } = p;
      return {
        _exportKey: key,
        reportsToKey: reportsToPersonId ? personKeyMap.get(String(reportsToPersonId)) : undefined,
        ...rest,
      };
    });

  const seenReqTypes = new Set<string>();
  const reqTypeKeyMap = new Map<string, string>();
  const reqTypeExports = allReqTypes
    .filter((rt) => {
      const dedupKey = `${String(rt.name)}|${String(rt.category || "")}`;
      if (seenReqTypes.has(dedupKey)) return false;
      seenReqTypes.add(dedupKey);
      return true;
    })
    .map((rt) => {
      const key = `${String(rt.name)}|${String(rt.category || "")}`;
      reqTypeKeyMap.set(String(rt._id), key);
      const { _id, _creationTime, projectId, userId, promptSchema, ...rest } = rt;
      return { _exportKey: key, ...rest };
    });

  const seenAssignments = new Set<string>();
  const assignmentExports = allAssignments
    .filter((a) => {
      const pKey = personKeyMap.get(String(a.personId)) || String(a.personId);
      const rKey = reqTypeKeyMap.get(String(a.requirementTypeId)) || String(a.requirementTypeId);
      const dedupKey = `${pKey}|${rKey}`;
      if (seenAssignments.has(dedupKey)) return false;
      seenAssignments.add(dedupKey);
      return true;
    })
    .map((a) => {
      const { _id, _creationTime, projectId, userId, personId, requirementTypeId, needsRuleMigrationReview, ...rest } = a;
      return {
        personKey: personKeyMap.get(String(personId)) || String(personId),
        requirementTypeKey: reqTypeKeyMap.get(String(requirementTypeId)) || String(requirementTypeId),
        ...rest,
      };
    });

  return {
    version: ORG_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    scope: ORG_BUNDLE_SCOPE,
    company: { name: company.name, slug: company.slug },
    entityProfiles: entityProfileExports,
    certificateProfiles: certExports,
    classRatings: perProfile(allClassRatings, true),
    capabilities: perProfile(allCapabilities, true),
    opSpecs: perProfile(allOpSpecs, false),
    limitedRatings: perProfile(allLimitedRatings, true),
    rosterPersonnel: personnelExports,
    rosterRequirementTypes: reqTypeExports,
    rosterAssignments: assignmentExports,
  };
}

export interface InsertOrgBundleOptions {
  companyId: Id<"companies">;
  /** Owner stamped on the inserted rows. */
  userId: string;
  bundle: Record<string, unknown>;
  /**
   * Where roster rows go (roster is project-scoped). Called only when the
   * bundle carries roster data, so a bundle without roster creates no project.
   */
  rosterProject: () => Promise<Id<"projects">>;
  now?: string;
}

/**
 * Insert a bundle's contents into an existing company. INSERT ONLY: the caller
 * decides whether the company is fresh, or has been cleared first (the mirror).
 */
export async function insertOrgBundleContents(ctx: MutationCtx, options: InsertOrgBundleOptions) {
  const { companyId, userId, bundle } = options;
  const now = options.now ?? new Date().toISOString();

  const epIdMap = new Map<string, Id<"entityProfiles">>();
  const entityProfiles = (bundle.entityProfiles || []) as Row[];
  for (const ep of entityProfiles) {
    const { _exportKey, ...fields } = ep;
    const id = await ctx.db.insert("entityProfiles", {
      ...fields,
      companyId,
      userId,
      createdAt: (fields.createdAt as string) || now,
      updatedAt: now,
    } as never);
    epIdMap.set(String(_exportKey), id);
  }

  const certProfiles = (bundle.certificateProfiles || []) as Row[];
  for (const cp of certProfiles) {
    const { entityProfileKey, ...fields } = cp;
    await ctx.db.insert("certificateProfiles", {
      ...fields,
      companyId,
      userId,
      entityProfileId: entityProfileKey ? epIdMap.get(String(entityProfileKey)) : undefined,
      createdAt: (fields.createdAt as string) || now,
      updatedAt: now,
    } as never);
  }

  const perProfileTables = [
    ["classRatings", "entityClassRatings"],
    ["capabilities", "entityCapabilityList"],
    ["opSpecs", "entityOpSpecs"],
    ["limitedRatings", "entityLimitedRatings"],
  ] as const;
  for (const [bundleKey, table] of perProfileTables) {
    for (const row of (bundle[bundleKey] || []) as Row[]) {
      const { entityProfileKey, ...fields } = row;
      const epId = epIdMap.get(String(entityProfileKey));
      if (!epId) continue;
      await ctx.db.insert(table, {
        ...fields,
        entityProfileId: epId,
        companyId,
        createdAt: (fields.createdAt as string) || now,
        updatedAt: now,
      } as never);
    }
  }

  const rosterPersonnel = (bundle.rosterPersonnel || []) as Row[];
  const reqTypes = (bundle.rosterRequirementTypes || []) as Row[];
  const assignments = (bundle.rosterAssignments || []) as Row[];

  let rosterProjectId: Id<"projects"> | undefined;
  if (rosterPersonnel.length > 0 || reqTypes.length > 0) {
    rosterProjectId = await options.rosterProject();

    const personIdMap = new Map<string, Id<"rosterPersonnel">>();
    for (const p of rosterPersonnel) {
      const { _exportKey, reportsToKey: _r, ...fields } = p;
      const id = await ctx.db.insert("rosterPersonnel", {
        ...fields,
        projectId: rosterProjectId,
        userId,
        capabilities: (fields.capabilities as string[]) || [],
        isActive: (fields.isActive as boolean) ?? true,
        createdAt: (fields.createdAt as string) || now,
        updatedAt: now,
      } as never);
      personIdMap.set(String(_exportKey), id);
    }
    for (const p of rosterPersonnel) {
      if (!p.reportsToKey) continue;
      const personId = personIdMap.get(String(p._exportKey));
      const managerId = personIdMap.get(String(p.reportsToKey));
      if (personId && managerId) await ctx.db.patch(personId, { reportsToPersonId: managerId });
    }

    const reqTypeIdMap = new Map<string, Id<"rosterRequirementTypes">>();
    for (const rt of reqTypes) {
      const { _exportKey, ...fields } = rt;
      const id = await ctx.db.insert("rosterRequirementTypes", {
        ...fields,
        projectId: rosterProjectId,
        userId,
        name: (fields.name as string) || "Unnamed",
        isActive: (fields.isActive as boolean) ?? true,
        createdAt: (fields.createdAt as string) || now,
        updatedAt: now,
      } as never);
      reqTypeIdMap.set(String(_exportKey), id);
    }

    for (const a of assignments) {
      const { personKey, requirementTypeKey, ...fields } = a;
      const personId = personIdMap.get(String(personKey));
      const reqTypeId = reqTypeIdMap.get(String(requirementTypeKey));
      if (!personId || !reqTypeId) continue;
      await ctx.db.insert("rosterAssignments", {
        ...fields,
        projectId: rosterProjectId,
        userId,
        personId,
        requirementTypeId: reqTypeId,
        createdAt: (fields.createdAt as string) || now,
        updatedAt: now,
      } as never);
    }
  }

  return {
    rosterProjectId,
    entityProfileCount: entityProfiles.length,
    certificateProfileCount: certProfiles.length,
    personnelCount: rosterPersonnel.length,
  };
}

/**
 * Remove everything an org bundle would have inserted into a company: entity
 * profiles with their ratings, certificate profiles, and the roster of the
 * given project (if any). Used by the mirror before re-applying, so a company
 * ends up as an exact copy of the source rather than an accumulation.
 */
export async function clearOrgBundleContents(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  rosterProjectId: Id<"projects"> | null,
): Promise<void> {
  const profiles = await ctx.db
    .query("entityProfiles")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  for (const profile of profiles) {
    for (const table of ["entityClassRatings", "entityCapabilityList", "entityOpSpecs", "entityLimitedRatings"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_entityProfileId", (q) => q.eq("entityProfileId", profile._id))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(profile._id);
  }

  const certs = await ctx.db
    .query("certificateProfiles")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .collect();
  for (const cert of certs) await ctx.db.delete(cert._id);

  if (rosterProjectId) {
    for (const table of ["rosterAssignments", "rosterPersonnel", "rosterRequirementTypes"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_projectId", (q) => q.eq("projectId", rosterProjectId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  }
}
