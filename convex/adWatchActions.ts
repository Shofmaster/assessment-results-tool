import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import { buildAdSearchPrompt, parseAdFindings } from "./_adWatchShared";
import { resolveAiKeyInAction } from "./aiCredentials";
import type { AdWatchFindingDraft } from "./_adWatchShared";

/**
 * Server-side AD/SB discovery + the daily scheduler that drives automated
 * monitoring. Discovery mirrors the on-demand client path
 * (src/services/adWatchService.ts) but runs without a user session: it calls
 * Anthropic directly with the web_search tool (same pattern as
 * auditIntelligenceActions.synthesizePatternsInternal). The key is resolved per
 * subscribing company (aiCredentials), falling back to the install-wide row and
 * then the Convex deployment environment.
 *
 * Required Convex env var: ANTHROPIC_API_KEY
 *   npx convex env set ANTHROPIC_API_KEY=sk-ant-...
 */

// Cost-conscious model for recurring cron use; supports the web_search tool.
const AD_WATCH_MODEL = "claude-sonnet-4-6";

// Politeness/rate-limit spacing between per-aircraft searches (see the
// audit-sim token-cost note — keep sequential Anthropic calls ~2.5s apart).
const PER_AIRCRAFT_DELAY_MS = 2500;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Discover FAA ADs that may apply to one aircraft make/model. Internal: invoked
 * by runScheduledAdChecks (and runnable manually via `npx convex run` in dev).
 * Returns [] (with a logged warning) when no key resolves at any scope.
 *
 * companyId is optional so a manual `npx convex run` still works: without it the
 * resolver falls through to the install-wide row and then the Convex env.
 */
export const discoverAdsForAircraft = internalAction({
  args: {
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    serial: v.optional(v.string()),
    year: v.optional(v.number()),
    lookbackMonths: v.optional(v.number()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<AdWatchFindingDraft[]> => {
    let apiKey: string;
    try {
      ({ apiKey } = await resolveAiKeyInAction(ctx, "anthropic", { companyId: args.companyId }));
    } catch {
      console.warn(
        "[adWatchActions] no Anthropic key configured for this scope — skipping AD discovery.",
      );
      return [];
    }

    const prompt = buildAdSearchPrompt(
      { make: args.make, model: args.model, serial: args.serial, year: args.year },
      args.lookbackMonths ?? 24,
    );
    if (!prompt) return [];

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: AD_WATCH_MODEL,
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return parseAdFindings(responseText);
  },
});

/**
 * Daily cron entry point. Walks every opted-in project that is due (per its
 * daily/weekly frequency), searches each active aircraft, upserts findings, and
 * emails the owner when genuinely new ADs land. Bounded by the per-project
 * opt-in so token cost stays predictable.
 */
export const runScheduledAdChecks = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    // No global key check: with per-company keys there is no single key whose
    // absence means "skip everything". Each subscription resolves its own, and
    // a tenant without one is skipped by discoverAdsForAircraft while the rest
    // of the sweep continues.
    const due = await ctx.runQuery(internal.adWatch.internalListDueSubscriptions, {});
    if (due.length === 0) {
      console.log("[adWatchActions] No subscriptions due — nothing to check.");
      return;
    }

    for (const sub of due) {
      try {
        const aircraft = await ctx.runQuery(internal.adWatch.internalListActiveAircraft, {
          projectId: sub.projectId,
        });

        // Bill the company that owns the project, not whoever happens to be
        // configured deployment-wide. Personal (company-less) projects resolve
        // to undefined and fall through to install/env.
        const project = await ctx.runQuery(internal.projects.getInternal, {
          projectId: sub.projectId,
        });
        const companyId = project?.companyId;

        let totalNew = 0;
        const newFindings: AdWatchFindingDraft[] = [];
        for (const [index, a] of aircraft.entries()) {
          if (index > 0) await delay(PER_AIRCRAFT_DELAY_MS);
          const drafts = await ctx.runAction(internal.adWatchActions.discoverAdsForAircraft, {
            make: a.make,
            model: a.model,
            serial: a.serial,
            year: a.year,
            companyId,
          });
          if (drafts.length === 0) continue;
          const result = await ctx.runMutation(internal.adWatch.internalUpsertFindings, {
            projectId: sub.projectId,
            aircraftId: a.recordId,
            findings: drafts,
          });
          if (result.inserted > 0) {
            totalNew += result.inserted;
            // Carry the freshly-inserted ADs for the alert email. (drafts is a
            // superset; an exact dedup isn't worth a round-trip — the email is a
            // nudge to open the card, which shows the authoritative list.)
            newFindings.push(...drafts);
          }
        }

        await ctx.runMutation(internal.adWatch.internalMarkChecked, {
          subscriptionId: sub.subscriptionId,
          newCount: totalNew,
        });

        if (totalNew > 0 && sub.emailAlerts) {
          const { projectName, recipients } = await ctx.runQuery(
            internal.adWatch.internalResolveAlertRecipients,
            { projectId: sub.projectId, extraRecipients: sub.extraRecipients },
          );
          if (recipients.length > 0) {
            await ctx.runAction(internal.notifications.sendAdAlertEmail, {
              recipients,
              projectName,
              newCount: totalNew,
              findings: newFindings.slice(0, 10).map((f) => ({
                adNumber: f.adNumber,
                title: f.title,
                confidence: f.confidence,
                sourceUrl: f.sourceUrl,
              })),
            });
          }
        }
      } catch (err) {
        // One bad project must not abort the whole sweep.
        console.error(
          `[adWatchActions] AD check failed for project ${String(sub.projectId)}:`,
          err,
        );
      }
    }
  },
});
