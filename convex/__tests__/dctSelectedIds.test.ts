import { describe, expect, it } from "vitest";
import { filterValidSelectedIds } from "../lib/dctSelectedIds";
import type { Id } from "../_generated/dataModel";

describe("dctSelectedIds", () => {
  it("filters out missing rating and capability IDs", async () => {
    const ratingA = "rating_a" as Id<"entityClassRatings">;
    const ratingMissing = "rating_missing" as Id<"entityClassRatings">;
    const capA = "cap_a" as Id<"entityCapabilityList">;
    const capMissing = "cap_missing" as Id<"entityCapabilityList">;

    const existing = new Set([ratingA, capA]);
    const ctx = {
      db: {
        get: async (id: unknown) => (existing.has(String(id)) ? { _id: id } : null),
      },
    };

    const result = await filterValidSelectedIds(
      ctx,
      [ratingA, ratingMissing],
      [capA, capMissing],
    );

    expect(result.validRatingIds).toEqual([ratingA]);
    expect(result.validCapabilityIds).toEqual([capA]);
    expect(result.prunedRatingIds).toEqual([ratingMissing]);
    expect(result.prunedCapabilityIds).toEqual([capMissing]);
  });

  it("returns empty arrays when all IDs are missing", async () => {
    const ctx = {
      db: {
        get: async () => null,
      },
    };
    const result = await filterValidSelectedIds(
      ctx,
      ["r1" as Id<"entityClassRatings">],
      ["c1" as Id<"entityCapabilityList">],
    );
    expect(result.validRatingIds).toEqual([]);
    expect(result.validCapabilityIds).toEqual([]);
    expect(result.prunedRatingIds).toHaveLength(1);
    expect(result.prunedCapabilityIds).toHaveLength(1);
  });
});
