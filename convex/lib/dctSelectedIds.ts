import type { Doc, Id } from "../_generated/dataModel";

export type DctSettingsSelections = Pick<
  Doc<"dctProjectSettings">,
  "_id" | "selectedClassRatingIds" | "selectedCapabilityIds"
>;

/** Resolve which stored selection IDs still exist in the database. */
export async function filterValidSelectedIds(
  ctx: { db: { get: (id: unknown) => Promise<unknown> } },
  ratingIds: Id<"entityClassRatings">[],
  capabilityIds: Id<"entityCapabilityList">[],
): Promise<{
  validRatingIds: Id<"entityClassRatings">[];
  validCapabilityIds: Id<"entityCapabilityList">[];
  prunedRatingIds: Id<"entityClassRatings">[];
  prunedCapabilityIds: Id<"entityCapabilityList">[];
}> {
  const [ratingRows, capabilityRows] = await Promise.all([
    Promise.all(ratingIds.map((id) => ctx.db.get(id))),
    Promise.all(capabilityIds.map((id) => ctx.db.get(id))),
  ]);
  const validRatingIds = ratingIds.filter((_, i) => ratingRows[i] != null);
  const validCapabilityIds = capabilityIds.filter((_, i) => capabilityRows[i] != null);
  const prunedRatingIds = ratingIds.filter((_, i) => ratingRows[i] == null);
  const prunedCapabilityIds = capabilityIds.filter((_, i) => capabilityRows[i] == null);
  return { validRatingIds, validCapabilityIds, prunedRatingIds, prunedCapabilityIds };
}

/** Return settings with only IDs that still exist (read-only; no DB writes). */
export async function sanitizeDctProjectSettingsSelections(
  ctx: { db: { get: (id: unknown) => Promise<unknown> } },
  settings: DctSettingsSelections | null,
): Promise<DctSettingsSelections | null> {
  if (!settings) return null;
  const ratingIds = settings.selectedClassRatingIds ?? [];
  const capabilityIds = settings.selectedCapabilityIds ?? [];
  const { validRatingIds, validCapabilityIds } = await filterValidSelectedIds(
    ctx,
    ratingIds,
    capabilityIds,
  );
  return {
    ...settings,
    selectedClassRatingIds: validRatingIds,
    selectedCapabilityIds: validCapabilityIds,
  };
}

/**
 * Drop orphaned selection IDs from dctProjectSettings and persist the cleaned arrays.
 */
export async function cleanDctProjectSettingsSelections(
  ctx: { db: any },
  settings: DctSettingsSelections | null,
): Promise<{
  settings: DctSettingsSelections | null;
  prunedRatingIds: Id<"entityClassRatings">[];
  prunedCapabilityIds: Id<"entityCapabilityList">[];
  didPrune: boolean;
}> {
  if (!settings) {
    return { settings: null, prunedRatingIds: [], prunedCapabilityIds: [], didPrune: false };
  }
  const ratingIds = settings.selectedClassRatingIds ?? [];
  const capabilityIds = settings.selectedCapabilityIds ?? [];
  const { validRatingIds, validCapabilityIds, prunedRatingIds, prunedCapabilityIds } =
    await filterValidSelectedIds(ctx, ratingIds, capabilityIds);
  const didPrune = prunedRatingIds.length > 0 || prunedCapabilityIds.length > 0;
  if (!didPrune) {
    return { settings, prunedRatingIds: [], prunedCapabilityIds: [], didPrune: false };
  }
  const now = new Date().toISOString();
  await ctx.db.patch(settings._id, {
    selectedClassRatingIds: validRatingIds,
    selectedCapabilityIds: validCapabilityIds,
    updatedAt: now,
  });
  if (prunedRatingIds.length > 0 || prunedCapabilityIds.length > 0) {
    console.warn(
      "[dctCompliance] Pruned stale structured selection IDs",
      { prunedRatingIds, prunedCapabilityIds },
    );
  }
  return {
    settings: {
      ...settings,
      selectedClassRatingIds: validRatingIds,
      selectedCapabilityIds: validCapabilityIds,
    },
    prunedRatingIds,
    prunedCapabilityIds,
    didPrune: true,
  };
}

/** Remove a deleted rating/capability row from every project's DCT settings selections. */
export async function pruneDeletedIdFromAllDctSettings(
  ctx: { db: any },
  opts: { ratingId?: Id<"entityClassRatings">; capabilityId?: Id<"entityCapabilityList"> },
): Promise<number> {
  const all = await ctx.db.query("dctProjectSettings").collect();
  let patched = 0;
  const now = new Date().toISOString();
  for (const row of all) {
    const patch: Record<string, unknown> = {};
    if (opts.ratingId) {
      const ids = row.selectedClassRatingIds ?? [];
      if (ids.some((id) => String(id) === String(opts.ratingId))) {
        patch.selectedClassRatingIds = ids.filter((id) => String(id) !== String(opts.ratingId));
      }
    }
    if (opts.capabilityId) {
      const ids = row.selectedCapabilityIds ?? [];
      if (ids.some((id) => String(id) === String(opts.capabilityId))) {
        patch.selectedCapabilityIds = ids.filter(
          (id) => String(id) !== String(opts.capabilityId),
        );
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      await ctx.db.patch(row._id, patch);
      patched++;
    }
  }
  return patched;
}
