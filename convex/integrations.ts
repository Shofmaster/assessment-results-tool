import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Outbound webhook for CAR / entity issue lifecycle (integration tier 2).
 * Target URL and optional secret are stored on companyFeaturePolicies.
 */
export const deliverCarWebhook = internalAction({
  args: {
    issueId: v.id("entityIssues"),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.runQuery(internal.entityIssues.getForWebhook, {
      issueId: args.issueId,
    });
    if (!issue) {
      return { ok: false as const, reason: "no_issue" };
    }

    const project = await ctx.runQuery(internal.projects.getInternal, {
      projectId: issue.projectId,
    });
    if (!project?.companyId) {
      return { ok: false as const, reason: "no_company" };
    }

    const policy = await ctx.runQuery(internal.companies.getFeaturePolicyInternal, {
      companyId: project.companyId,
    });
    const url = policy?.carLifecycleWebhookUrl?.trim();
    if (!url) {
      return { ok: false as const, reason: "no_webhook" };
    }

    const payload = {
      event: args.eventType,
      issuedAt: new Date().toISOString(),
      issue: {
        id: issue._id,
        externalId: issue.externalId ?? null,
        carNumber: issue.carNumber ?? null,
        status: issue.status ?? null,
        title: issue.title,
        severity: issue.severity,
        dueDate: issue.dueDate ?? null,
        regulationRef: issue.regulationRef ?? null,
        projectId: issue.projectId,
        companyId: project.companyId,
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-AeroGap-Event": args.eventType,
    };
    const secret = policy.carLifecycleWebhookSecret?.trim();
    if (secret) {
      headers["X-AeroGap-Webhook-Secret"] = secret;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[deliverCarWebhook] failed", res.status, text);
      return { ok: false as const, status: res.status };
    }

    return { ok: true as const };
  },
});
