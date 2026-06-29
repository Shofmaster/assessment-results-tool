import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAuth, requireProjectAccess } from "./_helpers";
import { normalizeAdNumber } from "./_textUtils";

const findingArg = v.object({
  adNumber: v.string(),
  title: v.string(),
  summary: v.optional(v.string()),
  effectiveDate: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  confidence: v.string(),
});

type FindingInput = {
  adNumber: string;
  title: string;
  summary?: string;
  effectiveDate?: string;
  sourceUrl?: string;
  confidence: string;
};

/**
 * Core upsert + logbook cross-reference, shared by the public (session-gated)
 * and internal (cron) entry points. The caller is responsible for authorization
 * and for supplying the owning `userId`. Returns insert/update/skip counts —
 * `inserted` is the "new AD" signal the scheduler uses to drive alerts.
 */
async function applyFindings(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    aircraftId: Id<"aircraftAssets">;
    userId: string;
    findings: FindingInput[];
  },
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const aircraft = await ctx.db.get(args.aircraftId);
  if (!aircraft || String(aircraft.projectId) !== String(args.projectId)) {
    throw new Error("Aircraft does not belong to this project");
  }

  // Logbook cross-reference: every normalized AD number that appears in this
  // aircraft's logbook entries counts as "recorded".
  const entries = (await ctx.db
    .query("logbookEntries")
    .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
    .collect()) as Doc<"logbookEntries">[];
  const recordedAds = new Set<string>();
  for (const e of entries) {
    for (const ref of [...(e.adReferences ?? []), ...(e.adSbReferences ?? [])]) {
      const normalized = normalizeAdNumber(String(ref));
      if (normalized) recordedAds.add(normalized);
    }
  }

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const finding of args.findings) {
    const adNumber = normalizeAdNumber(finding.adNumber);
    if (!adNumber) {
      skipped += 1;
      continue;
    }
    const complianceStatus = recordedAds.has(adNumber) ? "recorded_in_logbook" : "no_logbook_record";
    const existing = await ctx.db
      .query("adWatchFindings")
      .withIndex("by_aircraftId_adNumber", (q) =>
        q.eq("aircraftId", args.aircraftId).eq("adNumber", adNumber),
      )
      .first();
    if (existing) {
      // Refresh facts + cross-ref, but never resurrect a dismissed/recorded row.
      await ctx.db.patch(existing._id, {
        title: finding.title,
        summary: finding.summary,
        effectiveDate: finding.effectiveDate,
        sourceUrl: finding.sourceUrl,
        confidence: finding.confidence,
        complianceStatus,
        checkedAt: now,
        updatedAt: now,
      });
      updated += 1;
    } else {
      await ctx.db.insert("adWatchFindings", {
        projectId: args.projectId,
        userId: args.userId,
        aircraftId: args.aircraftId,
        adNumber,
        title: finding.title,
        summary: finding.summary,
        effectiveDate: finding.effectiveDate,
        sourceUrl: finding.sourceUrl,
        confidence: finding.confidence,
        complianceStatus,
        status: "new",
        checkedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }
  }
  return { inserted, updated, skipped };
}

/**
 * AD/SB watch persistence. The discovery itself happens client-side
 * (src/services/adWatchService.ts, Claude + web_search — same pattern as
 * revisionChecker); this module stores findings, cross-references them
 * against logbook AD references, and tracks the review workflow.
 */

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const rows = (await ctx.db
      .query("adWatchFindings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()) as Doc<"adWatchFindings">[];
    const aircraftRows = await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const tailById = new Map(aircraftRows.map((a) => [String(a._id), a.tailNumber]));
    return rows
      .map((r) => ({ ...r, tailNumber: tailById.get(String(r.aircraftId)) }))
      .sort((a, b) => (b.adNumber < a.adNumber ? -1 : b.adNumber > a.adNumber ? 1 : 0));
  },
});

export const upsertFindings = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    findings: v.array(findingArg),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    return applyFindings(ctx, { ...args, userId });
  },
});

/**
 * Cron-only upsert: same logic as upsertFindings but without a user session.
 * The owning userId is taken from the project (attribution only — the scheduler
 * already resolved which fleets to check). Never call this from the client.
 */
export const internalUpsertFindings = internalMutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    findings: v.array(findingArg),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    return applyFindings(ctx, { ...args, userId: project.userId });
  },
});

export const setStatus = mutation({
  args: {
    findingId: v.id("adWatchFindings"),
    status: v.union(v.literal("new"), v.literal("recorded"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const finding = await ctx.db.get(args.findingId);
    if (!finding) throw new Error("Finding not found");
    await requireProjectAccess(ctx, finding.projectId);
    await ctx.db.patch(args.findingId, { status: args.status, updatedAt: new Date().toISOString() });
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Automated monitoring: per-project opt-in subscription + cron plumbing.
// ──────────────────────────────────────────────────────────────────────────

const frequencyArg = v.union(v.literal("daily"), v.literal("weekly"));

/** Subscription for the active project's AD watch card (null = not opted in). */
export const getSubscription = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await ctx.db
      .query("adWatchSubscriptions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

/** Create or update the project's monitoring preferences (upsert, one per project). */
export const setSubscription = mutation({
  args: {
    projectId: v.id("projects"),
    enabled: v.boolean(),
    frequency: frequencyArg,
    emailAlerts: v.boolean(),
    extraRecipients: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("adWatchSubscriptions")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();
    const recipients = (args.extraRecipients ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        frequency: args.frequency,
        emailAlerts: args.emailAlerts,
        extraRecipients: recipients,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("adWatchSubscriptions", {
      projectId: args.projectId,
      userId,
      enabled: args.enabled,
      frequency: args.frequency,
      emailAlerts: args.emailAlerts,
      extraRecipients: recipients,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Whether a subscription is due to run now given its frequency + last run. */
function isDue(sub: Doc<"adWatchSubscriptions">, now: number): boolean {
  if (!sub.enabled) return false;
  if (!sub.lastCheckedAt) return true;
  const last = Date.parse(sub.lastCheckedAt);
  if (Number.isNaN(last)) return true;
  const elapsedMs = now - last;
  // Daily: run once the previous run is ~a day old (guards against the cron
  // firing twice in a window). Weekly: 7 days. Small slack so a fixed-time cron
  // doesn't skip a day due to minor drift.
  const thresholdMs = (sub.frequency === "weekly" ? 7 : 1) * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;
  return elapsedMs >= thresholdMs;
}

/** Cron: enabled subscriptions that are due to run now. */
export const internalListDueSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = (await ctx.db
      .query("adWatchSubscriptions")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect()) as Doc<"adWatchSubscriptions">[];
    return rows
      .filter((s) => isDue(s, now))
      .map((s) => ({
        subscriptionId: s._id,
        projectId: s.projectId,
        emailAlerts: s.emailAlerts,
        extraRecipients: s.extraRecipients ?? [],
      }));
  },
});

/** Cron: active aircraft (compact) for a project — mirrors askTools.aircraftStatus. */
export const internalListActiveAircraft = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const rows = (await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect()) as Doc<"aircraftAssets">[];
    return rows
      .filter((a) => (a.status ?? "active") === "active")
      .map((a) => ({
        recordId: a._id,
        tailNumber: a.tailNumber,
        make: a.make,
        model: a.model,
        serial: a.serial,
        year: a.year,
      }));
  },
});

/** Cron: stamp a subscription after a run so frequency gating works next time. */
export const internalMarkChecked = internalMutation({
  args: { subscriptionId: v.id("adWatchSubscriptions"), newCount: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.subscriptionId, {
      lastCheckedAt: new Date().toISOString(),
      lastNewCount: args.newCount,
      updatedAt: new Date().toISOString(),
    });
  },
});

/** Cron: resolve the email recipients + project name for an alert. */
export const internalResolveAlertRecipients = internalQuery({
  args: { projectId: v.id("projects"), extraRecipients: v.array(v.string()) },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) return { projectName: "your fleet", recipients: args.extraRecipients };
    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", project.userId))
      .first();
    const recipients = new Set<string>();
    if (owner?.email) recipients.add(owner.email.toLowerCase());
    for (const e of args.extraRecipients) {
      const trimmed = e.trim().toLowerCase();
      if (trimmed) recipients.add(trimmed);
    }
    return { projectName: project.name ?? "your fleet", recipients: [...recipients] };
  },
});
