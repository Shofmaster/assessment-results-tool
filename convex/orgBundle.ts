/**
 * Organization bundle export/import — shares company-level data (entity
 * profiles, certificates, ratings, roster) between AeroGap installations.
 *
 * The bundle format and the read/insert logic live in lib/orgBundleOps.ts and
 * are shared with the hosted → desktop mirror (mirror.ts).
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireCompanyRole } from "./_helpers";
import { assertOrgBundleVersion } from "./lib/orgBundle";
import { buildOrgBundle, insertOrgBundleContents } from "./lib/orgBundleOps";
import type { Id } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const exportOrgBundle = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, [
      "company_admin",
      "company_manager",
    ]);
    return await buildOrgBundle(ctx, args.companyId);
  },
});

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const importOrgBundle = mutation({
  args: {
    bundle: v.any(),
    /** If provided, import into this existing company. Otherwise create a new one. */
    targetCompanyId: v.optional(v.id("companies")),
    companyNameOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bundle = args.bundle as Record<string, unknown>;
    assertOrgBundleVersion(bundle.version);

    const bundleCompany = bundle.company as { name?: string; slug?: string } | undefined;
    if (!bundleCompany?.name?.trim()) {
      throw new Error("The bundle is missing a company name.");
    }

    const userId = await requireAuth(ctx);
    const now = new Date().toISOString();

    // Resolve or create the target company
    let companyId: Id<"companies">;
    if (args.targetCompanyId) {
      await requireCompanyRole(ctx, args.targetCompanyId, [
        "company_admin",
        "company_manager",
      ]);
      companyId = args.targetCompanyId;
    } else {
      const name = (args.companyNameOverride || bundleCompany.name).trim();
      const slug =
        bundleCompany.slug ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
      companyId = await ctx.db.insert("companies", {
        name,
        slug,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("companyMemberships", {
        companyId,
        userId,
        role: "company_admin",
        status: "active",
        addedBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    const result = await insertOrgBundleContents(ctx, {
      companyId,
      userId,
      bundle,
      now,
      // Roster is project-scoped; an import project holds it.
      rosterProject: () =>
        ctx.db.insert("projects", {
          userId,
          companyId,
          name: `${bundleCompany.name} - Imported Roster`,
          description: "Auto-created during organization bundle import to hold roster data.",
          createdAt: now,
          updatedAt: now,
        }),
    });

    return { companyId, ...result };
  },
});
