import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireCompanyOrDelegatedSupportAccess, requireProjectAccess } from "./_helpers";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MAX_PROJECT_FANOUT = 6;

function snippet(text: string, maxLen = 160): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

export type GlobalSearchResult =
  | {
      type: "document";
      id: string;
      title: string;
      snippet: string;
      category: string;
      projectId: string;
      href: string;
    }
  | {
      type: "publication";
      id: string;
      title: string;
      snippet: string;
      publicationType: string;
      projectId: string;
      href: string;
    }
  | {
      type: "logbookEntry";
      id: string;
      title: string;
      snippet: string;
      aircraftId: string;
      projectId: string;
      entryDate?: string;
      href: string;
    }
  | {
      type: "discrepancy";
      id: string;
      title: string;
      snippet: string;
      aircraftId: string;
      projectId: string;
      status: string;
      href: string;
    };

async function resolveProjectIds(
  ctx: { db: any },
  args: { projectId?: Id<"projects">; companyId?: Id<"companies"> },
): Promise<Id<"projects">[]> {
  if (args.projectId) return [args.projectId];
  if (!args.companyId) return [];
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", args.companyId))
    .take(MAX_PROJECT_FANOUT);
  return projects.map((p: { _id: Id<"projects"> }) => p._id);
}

export const search = query({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required for global search.");
    }
    if (args.companyId) {
      await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    } else if (args.projectId) {
      await requireProjectAccess(ctx, args.projectId);
    }

    const q = args.query.trim();
    if (!q) return { results: [] as GlobalSearchResult[] };

    const perTypeLimit = Math.max(1, Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
    const projectIds = await resolveProjectIds(ctx, args);
    const results: GlobalSearchResult[] = [];

    if (args.companyId) {
      const pubs = await ctx.db
        .query("technicalPublications")
        .withSearchIndex("by_title", (sq) => sq.search("title", q).eq("companyId", args.companyId!))
        .take(perTypeLimit);
      for (const pub of pubs) {
        results.push({
          type: "publication",
          id: String(pub._id),
          title: pub.title,
          snippet: snippet(pub.title),
          publicationType: pub.publicationType,
          projectId: String(pub.projectId),
          href: `/library/publication/${String(pub._id)}`,
        });
      }
    }

    for (const projectId of projectIds) {
      if (results.length >= perTypeLimit * 4) break;

      const docs = await ctx.db
        .query("documents")
        .withSearchIndex("by_name", (sq) => sq.search("name", q).eq("projectId", projectId))
        .take(perTypeLimit);
      for (const doc of docs) {
        results.push({
          type: "document",
          id: String(doc._id),
          title: doc.name,
          snippet: snippet(doc.name),
          category: doc.category,
          projectId: String(projectId),
          href: "/library",
        });
      }

      const entries = await ctx.db
        .query("logbookEntries")
        .withSearchIndex("by_rawText", (sq) => sq.search("rawText", q).eq("projectId", projectId))
        .take(perTypeLimit);
      for (const entry of entries) {
        const label = entry.workPerformed?.trim() || entry.rawText.slice(0, 80);
        results.push({
          type: "logbookEntry",
          id: String(entry._id),
          title: label,
          snippet: snippet(entry.workPerformed || entry.rawText),
          aircraftId: String(entry.aircraftId),
          projectId: String(projectId),
          entryDate: entry.entryDate,
          href: "/logbook",
        });
      }

      const discrepancies = await ctx.db
        .query("aircraftDiscrepancies")
        .withSearchIndex("by_description", (sq) => sq.search("description", q).eq("projectId", projectId))
        .take(perTypeLimit);
      for (const disc of discrepancies) {
        results.push({
          type: "discrepancy",
          id: String(disc._id),
          title: disc.description.slice(0, 120),
          snippet: snippet(disc.description),
          aircraftId: String(disc.aircraftId),
          projectId: String(projectId),
          status: disc.status,
          href: "/fleet",
        });
      }
    }

    return { results: results.slice(0, perTypeLimit * 4) };
  },
});
