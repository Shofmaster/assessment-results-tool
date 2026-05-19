import type { Doc, Id } from "../_generated/dataModel";

const CHILD_TABLES = [
  "entityClassRatings",
  "entityCapabilityList",
  "entityOpSpecs",
  "entityLimitedRatings",
] as const;

type ChildTable = (typeof CHILD_TABLES)[number];

/**
 * Re-point profile child rows from a legacy project profile to the surviving company profile
 * before the legacy profile row is deleted.
 */
export async function repointEntityProfileChildren(
  ctx: { db: any },
  fromProfileId: Id<"entityProfiles">,
  toProfile: Doc<"entityProfiles">,
): Promise<{ table: ChildTable; count: number }[]> {
  const now = new Date().toISOString();
  const results: { table: ChildTable; count: number }[] = [];

  for (const table of CHILD_TABLES) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_entityProfileId", (q: any) => q.eq("entityProfileId", fromProfileId))
      .collect();
    for (const row of rows) {
      const patch: Record<string, unknown> = {
        entityProfileId: toProfile._id,
        updatedAt: now,
      };
      if (toProfile.companyId) {
        patch.companyId = toProfile.companyId;
        patch.projectId = undefined;
      }
      await ctx.db.patch(row._id, patch);
    }
    results.push({ table, count: rows.length });
  }

  return results;
}
