import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireAerogapEmployee } from "./_helpers";
const PROFILE_CHILD_TABLES = [
  "entityClassRatings",
  "entityCapabilityList",
  "entityOpSpecs",
  "entityLimitedRatings",
] as const;

export const backfillCompaniesForProjects = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = new Date().toISOString();
    const projects = await ctx.db.query("projects").collect();

    const projectsWithoutCompany = projects.filter((project) => !project.companyId);
    if (projectsWithoutCompany.length === 0) {
      return {
        companiesCreated: 0,
        membershipsCreated: 0,
        projectsUpdated: 0,
      };
    }

    const allCompanies = await ctx.db.query("companies").collect();
    const allMemberships = await ctx.db.query("companyMemberships").collect();
    const users = await ctx.db.query("users").collect();
    const userByClerkId = new Map(users.map((u) => [u.clerkUserId, u]));

    let companiesCreated = 0;
    let membershipsCreated = 0;
    let projectsUpdated = 0;

    const companyByOwner = new Map<string, string>();
    for (const company of allCompanies) {
      if (company.slug?.startsWith("legacy-")) {
        companyByOwner.set(company.slug.replace("legacy-", ""), company._id);
      }
    }

    for (const project of projectsWithoutCompany) {
      let companyId = companyByOwner.get(project.userId);
      if (!companyId) {
        const owner = userByClerkId.get(project.userId);
        const displayName = owner?.name || owner?.email || project.userId;
        companyId = await ctx.db.insert("companies", {
          name: `${displayName} Company`,
          slug: `legacy-${project.userId}`,
          isActive: true,
          createdBy: project.userId,
          createdAt: now,
          updatedAt: now,
        });
        companyByOwner.set(project.userId, companyId);
        companiesCreated += 1;
      }

      const existingMembership = allMemberships.find(
        (membership) => membership.companyId === companyId && membership.userId === project.userId
      );
      if (!existingMembership) {
        await ctx.db.insert("companyMemberships", {
          companyId: companyId as any,
          userId: project.userId,
          role: "company_admin",
          status: "active",
          addedBy: project.userId,
          createdAt: now,
          updatedAt: now,
        });
        membershipsCreated += 1;
      }

      await ctx.db.patch(project._id, {
        companyId: companyId as any,
        updatedAt: now,
      });
      projectsUpdated += 1;
    }

    return {
      companiesCreated,
      membershipsCreated,
      projectsUpdated,
    };
  },
});

type CertPart = "145" | "121" | "125" | "129" | "133" | "135" | "137" | "141" | "142" | "147" | "91K" | "91LOA";

function mapCertPartToCertificateType(certPart: CertPart):
  | "part145"
  | "part121"
  | "part125"
  | "part129"
  | "part133"
  | "part135"
  | "part137"
  | "part141"
  | "part142"
  | "part147"
  | "part91k"
  | "part91loa" {
  switch (certPart) {
    case "145":
      return "part145";
    case "121":
      return "part121";
    case "125":
      return "part125";
    case "129":
      return "part129";
    case "133":
      return "part133";
    case "135":
      return "part135";
    case "137":
      return "part137";
    case "141":
      return "part141";
    case "142":
      return "part142";
    case "147":
      return "part147";
    case "91K":
      return "part91k";
    case "91LOA":
      return "part91loa";
    default:
      return "part145";
  }
}

export const backfillCertificateProfilesFromEntityProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = new Date().toISOString();

    const existingProfiles = await ctx.db.query("certificateProfiles").collect();
    const existingByEntityProfileId = new Map(
      existingProfiles
        .filter((profile) => Boolean(profile.entityProfileId))
        .map((profile) => [String(profile.entityProfileId), profile]),
    );

    const entityProfiles = await ctx.db.query("entityProfiles").collect();
    let created = 0;
    let skippedExisting = 0;

    const createdByEntityProfileId = new Map<string, string>();

    for (const entityProfile of entityProfiles) {
      const key = String(entityProfile._id);
      const existing = existingByEntityProfileId.get(key);
      if (existing) {
        skippedExisting += 1;
        createdByEntityProfileId.set(key, String(existing._id));
        continue;
      }

      const qualityStandards = entityProfile.qualityStandards ?? [];
      const hasAs9100 = qualityStandards.some((value) => value.toLowerCase().includes("as9100"));
      const hasEasaApproval = Boolean(
        entityProfile.easaApprovalRef ||
          entityProfile.easaPart145Expiry ||
          entityProfile.easaPartCamoRef ||
          entityProfile.easaPartCaoRef,
      );

      const authority: "faa" | "easa" | "isbao" | "as9100" | "icao" | "other" = hasEasaApproval
        ? "easa"
        : entityProfile.isbaoLevel
          ? "isbao"
          : hasAs9100
            ? "as9100"
            : "faa";

      const faaHeld = (entityProfile.faaCertTypesHeld ?? []) as CertPart[];
      const certificateType:
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
        | "custom" = authority === "easa"
        ? "easa145"
        : authority === "isbao"
          ? "isbao"
          : authority === "as9100"
            ? "as9100"
            : faaHeld.length > 0
              ? mapCertPartToCertificateType(faaHeld[0])
              : "part145";

      const scopeKey = entityProfile.operationsScope
        ? entityProfile.operationsScope.toLowerCase().replace(/\s+/g, "-")
        : entityProfile.primaryLocation
          ? entityProfile.primaryLocation.toLowerCase().replace(/\s+/g, "-")
          : "default";

      const profileCode = `${authority}:${certificateType}:${scopeKey}`;
      const insertedId = await ctx.db.insert("certificateProfiles", {
        projectId: entityProfile.projectId,
        companyId: entityProfile.companyId,
        entityProfileId: entityProfile._id,
        userId: entityProfile.userId,
        profileCode,
        authority,
        certificateType,
        status: "active",
        certificateMetadata: {
          certificateNumber:
            entityProfile.faaCertificateNumber ||
            entityProfile.easaApprovalRef ||
            entityProfile.faaPart135Certificate ||
            entityProfile.faaPart121Certificate,
          issuedDate: entityProfile.faaCertificateDate,
          expiryDate: entityProfile.easaPart145Expiry,
          lastAmendmentDate: entityProfile.faaLastAmendmentDate,
          surveillanceAnchorDate: entityProfile.faaCertificateDate,
        },
        operationalScope: {
          scopeKey,
          operationClass: entityProfile.operationsScope,
          geography: entityProfile.primaryLocation,
        },
        obligationSetVersion: "v1",
        createdAt: now,
        updatedAt: now,
      });

      created += 1;
      createdByEntityProfileId.set(key, String(insertedId));
    }

    const checklistRuns = await ctx.db.query("auditChecklistRuns").collect();
    let checklistRunsPatched = 0;
    for (const run of checklistRuns) {
      if (run.certificateProfileId || !run.profileId) continue;
      const mappedCertificateProfileId = createdByEntityProfileId.get(String(run.profileId));
      if (!mappedCertificateProfileId) continue;

      await ctx.db.patch(run._id, {
        certificateProfileId: mappedCertificateProfileId as any,
        obligationSetVersion: run.obligationSetVersion ?? "v1",
      });
      checklistRunsPatched += 1;
    }

    return {
      created,
      skippedExisting,
      checklistRunsPatched,
    };
  },
});

/**
 * Repair rows whose entityProfileId points at a deleted profile by re-linking them
 * to the company profile for the same companyId. AeroGap staff only.
 */
export const repairOrphanedEntityProfileChildren = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAerogapEmployee(ctx);
    const profiles = await ctx.db.query("entityProfiles").collect();
    const profileById = new Map(profiles.map((p) => [String(p._id), p]));
    const companyProfileByCompanyId = new Map<string, Doc<"entityProfiles">>();
    for (const p of profiles) {
      if (p.companyId) companyProfileByCompanyId.set(String(p.companyId), p);
    }

    let repointed = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    for (const table of PROFILE_CHILD_TABLES) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        const profileId = row.entityProfileId as Id<"entityProfiles">;
        if (profileById.has(String(profileId))) {
          skipped++;
          continue;
        }
        const companyId = row.companyId;
        if (!companyId) continue;
        const target = companyProfileByCompanyId.get(String(companyId));
        if (!target) continue;
        await ctx.db.patch(row._id, {
          entityProfileId: target._id,
          companyId: target.companyId,
          projectId: undefined,
          updatedAt: now,
        });
        repointed++;
      }
    }

    return { repointed, skipped };
  },
});

