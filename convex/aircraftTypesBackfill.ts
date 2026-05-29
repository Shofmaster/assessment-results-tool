import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

function typeNameFromMakeModel(make?: string, model?: string): string {
  const parts = [make, model].filter(Boolean).map((s) => s!.trim());
  return parts.length ? parts.join(" ") : "Unknown type";
}

/** One-time: create aircraftTypes from distinct make/model on assets and link publications by makeModel text. */
export const backfillProject = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.companyId) return { typesCreated: 0, assetsLinked: 0, publicationsLinked: 0 };

    const assets = await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    const now = new Date().toISOString();
    const typeByKey = new Map<string, Id<"aircraftTypes">>();
    let typesCreated = 0;
    let assetsLinked = 0;

    for (const asset of assets) {
      if (asset.aircraftTypeId) continue;
      const make = (asset.make ?? "").trim();
      const model = (asset.model ?? "").trim();
      const key = `${make.toLowerCase()}|${model.toLowerCase()}`;
      let typeId = typeByKey.get(key);
      if (!typeId) {
        typeId = await ctx.db.insert("aircraftTypes", {
          projectId: args.projectId,
          userId: asset.userId,
          name: typeNameFromMakeModel(make || undefined, model || undefined),
          manufacturer: make || undefined,
          model: model || undefined,
          createdAt: now,
          updatedAt: now,
        });
        typeByKey.set(key, typeId);
        typesCreated++;
      }
      await ctx.db.patch(asset._id, { aircraftTypeId: typeId, updatedAt: now });
      assetsLinked++;
    }

    const pubs = await ctx.db
      .query("technicalPublications")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
      .collect();
    const projectPubs = pubs.filter((p) => p.projectId === args.projectId);
    let publicationsLinked = 0;

    for (const pub of projectPubs) {
      if (pub.aircraftTypeIds?.length || pub.aircraftIds?.length) continue;
      const mm = (pub.makeModel ?? "").trim().toLowerCase();
      if (!mm) continue;
      const match = [...typeByKey.entries()].find(([key]) => {
        const [make, model] = key.split("|");
        const label = [make, model].filter(Boolean).join(" ").toLowerCase();
        return label === mm || mm.includes(label) || label.includes(mm);
      });
      if (!match) continue;
      await ctx.db.patch(pub._id, {
        aircraftTypeIds: [match[1]],
        updatedAt: now,
      });
      publicationsLinked++;
    }

    await ctx.db.patch(args.projectId, { updatedAt: now });
    return { typesCreated, assetsLinked, publicationsLinked };
  },
});
