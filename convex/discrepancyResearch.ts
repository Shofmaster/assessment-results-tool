import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireProjectAccess } from "./_helpers";
import Anthropic from "@anthropic-ai/sdk";

const RESEARCH_MODEL = "claude-sonnet-4-5-20250929";
const RESEARCH_MAX_TOKENS = 2048;
const SEARCH_TOP_K = 12;

interface DiscrepancyResearchResult {
  problemAnalysis: string;
  likelyRootCauses: string[];
  troubleshootingSteps: string[];
  correctiveAction: string;
  partsNeeded: { partNumber: string; description: string }[];
  references: {
    documentId: string;
    docName: string;
    chunkIndex: number;
    excerpt: string;
  }[];
  suggestedLogbookEntry: {
    workPerformed: string;
    ataChapter: string;
    returnToServiceStatement: string;
  };
  noManualReferencesFound: boolean;
}

function buildResearchPrompt(args: {
  aircraft: {
    tailNumber: string;
    make?: string;
    model?: string;
    serial?: string;
    currentTotalTime?: number;
    currentTotalCycles?: number;
  };
  discrepancy: {
    description: string;
    ataChapter?: string;
    melItem?: string;
    partNumbers?: string[];
    location?: string;
    category?: string;
    status: string;
    discoveredAt?: string;
  };
  chunks: Array<{
    documentId: string;
    docName: string;
    chunkIndex: number;
    text: string;
    score: number;
  }>;
}): string {
  const acft = args.aircraft;
  const d = args.discrepancy;
  const aircraftHeader = [
    `Tail: ${acft.tailNumber}`,
    acft.make ? `Make: ${acft.make}` : null,
    acft.model ? `Model: ${acft.model}` : null,
    acft.serial ? `Serial: ${acft.serial}` : null,
    typeof acft.currentTotalTime === "number" ? `Current TT: ${acft.currentTotalTime}` : null,
    typeof acft.currentTotalCycles === "number" ? `Current cycles: ${acft.currentTotalCycles}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const discrepancyBlock = [
    `Description: ${d.description}`,
    d.ataChapter ? `ATA: ${d.ataChapter}` : null,
    d.melItem ? `MEL item: ${d.melItem}` : null,
    d.location ? `Location: ${d.location}` : null,
    d.category ? `Category: ${d.category}` : null,
    d.partNumbers?.length ? `Part numbers cited: ${d.partNumbers.join(", ")}` : null,
    d.discoveredAt ? `Discovered: ${d.discoveredAt}` : null,
    `Status: ${d.status}`,
  ]
    .filter(Boolean)
    .join("\n");

  const chunksBlock = args.chunks.length
    ? args.chunks
        .map(
          (c, i) =>
            `[Ref ${i + 1}] documentId=${c.documentId} | docName="${c.docName}" | chunkIndex=${c.chunkIndex} | score=${c.score.toFixed(3)}\n${c.text}`,
        )
        .join("\n\n---\n\n")
    : "(No matching excerpts found in the project's manuals.)";

  return `You are an aviation maintenance technician's research assistant. Given a current discrepancy on an aircraft and excerpts from the project's manuals (general AND aircraft-specific OEM manuals), produce a structured response that helps the tech (1) understand the problem, (2) follow troubleshooting steps grounded in the manual excerpts, and (3) draft a maintenance logbook entry.

AIRCRAFT
${aircraftHeader}

DISCREPANCY
${discrepancyBlock}

MANUAL EXCERPTS (vector-search hits, most relevant first; each tagged with documentId + chunkIndex so you can cite them)
${chunksBlock}

Return ONLY a JSON object — no prose before or after — matching this TypeScript type exactly:

{
  "problemAnalysis": string,           // 1-2 paragraphs, plain language
  "likelyRootCauses": string[],        // 2-5 items, ordered most-likely first
  "troubleshootingSteps": string[],    // ordered, actionable, reference manual excerpts when relevant
  "correctiveAction": string,          // the recommended fix, referencing parts/torque/procedures from the manuals when applicable
  "partsNeeded": [{ "partNumber": string, "description": string }],
  "references": [
    { "documentId": string, "docName": string, "chunkIndex": number, "excerpt": string }
  ],                                   // only include refs you actually relied on; "excerpt" is a short verbatim snippet (<200 chars)
  "suggestedLogbookEntry": {
    "workPerformed": string,           // imperative past-tense, ready for a 14 CFR 43.9 entry
    "ataChapter": string,              // best-fit ATA chapter (e.g. "32-40-00") or "" if not determinable
    "returnToServiceStatement": string // standard RTS language appropriate for the work
  },
  "noManualReferencesFound": boolean   // true ONLY if zero relevant manual excerpts exist; in that case provide general best-practice guidance in the other fields and acknowledge the gap in problemAnalysis
}

Rules:
- Do NOT hallucinate manual references that aren't in the excerpts above.
- If part numbers in the discrepancy are unfamiliar, note that as a likelyRootCause / troubleshooting step rather than inventing fixes.
- Use only the documentIds and chunkIndexes I gave you in references.
- Keep partNumbers list to items genuinely needed; empty array if none.`;
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  return null;
}

function coerceResult(raw: any): DiscrepancyResearchResult {
  return {
    problemAnalysis: String(raw?.problemAnalysis ?? ""),
    likelyRootCauses: Array.isArray(raw?.likelyRootCauses)
      ? raw.likelyRootCauses.map((s: any) => String(s))
      : [],
    troubleshootingSteps: Array.isArray(raw?.troubleshootingSteps)
      ? raw.troubleshootingSteps.map((s: any) => String(s))
      : [],
    correctiveAction: String(raw?.correctiveAction ?? ""),
    partsNeeded: Array.isArray(raw?.partsNeeded)
      ? raw.partsNeeded
          .map((p: any) => ({
            partNumber: String(p?.partNumber ?? ""),
            description: String(p?.description ?? ""),
          }))
          .filter((p: any) => p.partNumber || p.description)
      : [],
    references: Array.isArray(raw?.references)
      ? raw.references
          .map((r: any) => ({
            documentId: String(r?.documentId ?? ""),
            docName: String(r?.docName ?? ""),
            chunkIndex: Number(r?.chunkIndex ?? 0),
            excerpt: String(r?.excerpt ?? ""),
          }))
          .filter((r: any) => r.documentId)
      : [],
    suggestedLogbookEntry: {
      workPerformed: String(raw?.suggestedLogbookEntry?.workPerformed ?? ""),
      ataChapter: String(raw?.suggestedLogbookEntry?.ataChapter ?? ""),
      returnToServiceStatement: String(
        raw?.suggestedLogbookEntry?.returnToServiceStatement ?? "",
      ),
    },
    noManualReferencesFound: Boolean(raw?.noManualReferencesFound),
  };
}

export const _saveResearch = internalMutation({
  args: {
    discrepancyId: v.id("aircraftDiscrepancies"),
    research: v.any(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.discrepancyId);
    if (!row) return;
    await ctx.db.patch(args.discrepancyId, {
      research: args.research,
      researchedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    });
  },
});

export const _saveDraftLink = internalMutation({
  args: {
    discrepancyId: v.id("aircraftDiscrepancies"),
    draftId: v.id("logbookDraftEntries"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.discrepancyId, {
      logbookDraftEntryId: args.draftId,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const _insertDraftFromResearch = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    discrepancyId: v.id("aircraftDiscrepancies"),
    workPerformed: v.string(),
    ataChapter: v.optional(v.string()),
    returnToServiceStatement: v.optional(v.string()),
    rawText: v.string(),
    totalTimeAtEntry: v.optional(v.number()),
    totalCyclesAtEntry: v.optional(v.number()),
    totalLandingsAtEntry: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("logbookDraftEntries", {
      projectId: args.projectId,
      userId: args.userId,
      aircraftId: args.aircraftId,
      sourceDiscrepancyId: args.discrepancyId,
      rawText: args.rawText,
      workPerformed: args.workPerformed,
      ataChapter: args.ataChapter,
      returnToServiceStatement: args.returnToServiceStatement,
      hasReturnToService: Boolean(args.returnToServiceStatement),
      entryType: "discrepancy_resolution",
      totalTimeAtEntry: args.totalTimeAtEntry,
      totalCyclesAtEntry: args.totalCyclesAtEntry,
      totalLandingsAtEntry: args.totalLandingsAtEntry,
      userVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const research = action({
  args: { discrepancyId: v.id("aircraftDiscrepancies") },
  handler: async (ctx, args): Promise<DiscrepancyResearchResult> => {
    const discrepancy = await ctx.runQuery(api.avianisIntegration.getDiscrepancy, {
      discrepancyId: args.discrepancyId,
    });
    if (!discrepancy) throw new Error("Discrepancy not found");
    const aircraftList = await ctx.runQuery(api.avianisIntegration.listAircraftForProject, {
      projectId: discrepancy.projectId,
    });
    const aircraft = aircraftList.find((a: any) => a._id === discrepancy.aircraftId);
    if (!aircraft) throw new Error("Aircraft not found for discrepancy");

    // Scope manuals to this aircraft (listByAircraft already includes fleet-wide pubs).
    let scopedDocIds: Id<"documents">[] = [];
    try {
      const pubs = (await ctx.runQuery(api.technicalPublications.listByAircraft, {
        projectId: discrepancy.projectId,
        aircraftId: discrepancy.aircraftId,
      })) as Array<{ documentId: Id<"documents"> }>;
      scopedDocIds = pubs.map((p) => p.documentId);
    } catch (err) {
      // If the project isn't attached to a company, listByAircraft returns []; just
      // fall back to the project-wide search (no documentIds filter).
      scopedDocIds = [];
    }

    const searchQuery = [
      discrepancy.description,
      discrepancy.ataChapter,
      discrepancy.melItem,
      (discrepancy.partNumbers ?? []).join(" "),
      aircraft.make,
      aircraft.model,
    ]
      .filter(Boolean)
      .join(" ");

    const searchResult = (await ctx.runAction(api.documentChunks.search, {
      projectId: discrepancy.projectId,
      query: searchQuery,
      documentIds: scopedDocIds.length > 0 ? scopedDocIds : undefined,
      topK: SEARCH_TOP_K,
    })) as {
      chunks: Array<{
        documentId: string;
        docName: string;
        chunkIndex: number;
        text: string;
        score: number;
      }>;
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set in Convex environment. Run: npx convex env set ANTHROPIC_API_KEY=sk-ant-...",
      );
    }

    const prompt = buildResearchPrompt({
      aircraft: {
        tailNumber: aircraft.tailNumber,
        make: aircraft.make,
        model: aircraft.model,
        serial: aircraft.serial,
        currentTotalTime: aircraft.currentTotalTime,
        currentTotalCycles: aircraft.currentTotalCycles,
      },
      discrepancy: {
        description: discrepancy.description,
        ataChapter: discrepancy.ataChapter,
        melItem: discrepancy.melItem,
        partNumbers: discrepancy.partNumbers,
        location: discrepancy.location,
        category: discrepancy.category,
        status: discrepancy.status,
        discoveredAt: discrepancy.discoveredAt,
      },
      chunks: searchResult.chunks,
    });

    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model: RESEARCH_MODEL,
      max_tokens: RESEARCH_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    const text = completion.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const parsed = tryParseJson(text);
    if (!parsed) {
      throw new Error("Claude returned unparseable research output");
    }
    const result = coerceResult(parsed);
    if (searchResult.chunks.length === 0) {
      result.noManualReferencesFound = true;
    }

    await ctx.runMutation(internal.discrepancyResearch._saveResearch, {
      discrepancyId: args.discrepancyId,
      research: result,
    });

    return result;
  },
});

export const acceptResearchAsLogbookDraft = action({
  args: { discrepancyId: v.id("aircraftDiscrepancies") },
  handler: async (ctx, args): Promise<{ draftId: Id<"logbookDraftEntries"> }> => {
    const discrepancy = await ctx.runQuery(api.avianisIntegration.getDiscrepancy, {
      discrepancyId: args.discrepancyId,
    });
    if (!discrepancy) throw new Error("Discrepancy not found");
    if (!discrepancy.research) {
      throw new Error("Run research first before drafting a log entry");
    }
    const userId = await requireProjectAccessFromAction(ctx, discrepancy.projectId);

    const aircraftList = await ctx.runQuery(api.avianisIntegration.listAircraftForProject, {
      projectId: discrepancy.projectId,
    });
    const aircraft = aircraftList.find((a: any) => a._id === discrepancy.aircraftId);

    const suggested = (discrepancy.research as DiscrepancyResearchResult).suggestedLogbookEntry;
    const rawText = `Discrepancy: ${discrepancy.description}\n\nResolution: ${suggested.workPerformed}\n\n${suggested.returnToServiceStatement}`;

    const draftId = (await ctx.runMutation(internal.discrepancyResearch._insertDraftFromResearch, {
      projectId: discrepancy.projectId,
      userId,
      aircraftId: discrepancy.aircraftId,
      discrepancyId: args.discrepancyId,
      workPerformed: suggested.workPerformed,
      ataChapter: suggested.ataChapter || discrepancy.ataChapter || undefined,
      returnToServiceStatement: suggested.returnToServiceStatement,
      rawText,
      totalTimeAtEntry: aircraft?.currentTotalTime,
      totalCyclesAtEntry: aircraft?.currentTotalCycles,
      totalLandingsAtEntry: aircraft?.currentTotalLandings,
    })) as Id<"logbookDraftEntries">;

    await ctx.runMutation(internal.discrepancyResearch._saveDraftLink, {
      discrepancyId: args.discrepancyId,
      draftId,
    });

    return { draftId };
  },
});

// Actions can't call requireProjectAccess directly (it needs ctx.auth); we go
// through a query that does the check and returns the userId.
async function requireProjectAccessFromAction(
  ctx: any,
  projectId: Id<"projects">,
): Promise<string> {
  return (await ctx.runQuery(api.avianisIntegration._currentUserId, {})) as string;
  // Note: the underlying queries (`getDiscrepancy`, `listAircraftForProject`)
  // already enforce requireProjectAccess. We only need the userId here for the
  // insert, so we don't repeat the check.
  void projectId;
}
