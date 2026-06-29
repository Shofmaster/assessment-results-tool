import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * Emails the owner when a new user signs up and lands in "pending" approval.
 * Uses Resend's HTTP API. No-ops (with a warning) if the required env vars are
 * missing so a misconfiguration can never break the sign-up flow itself.
 *
 * Required Convex env vars:
 *   RESEND_API_KEY     — Resend API key
 *   ADMIN_NOTIFY_EMAIL — where to send the notification
 *   SIGNUP_EMAIL_FROM  — verified sender (e.g. "onboarding@resend.dev" for testing)
 */
export const sendSignupEmail = internalAction({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ADMIN_NOTIFY_EMAIL;
    const from = process.env.SIGNUP_EMAIL_FROM;

    if (!apiKey || !to || !from) {
      console.warn(
        "[notifications.sendSignupEmail] Skipping email: set RESEND_API_KEY, ADMIN_NOTIFY_EMAIL, and SIGNUP_EMAIL_FROM in the Convex dashboard env to enable signup notifications.",
      );
      return { ok: false as const, reason: "not_configured" };
    }

    const who = args.name ? `${args.name} (${args.email})` : args.email;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject: "New AeroGap signup awaiting approval",
          text:
            `${who} just signed up for AeroGap and is awaiting your approval.\n\n` +
            `Open the Admin Panel → Pending Approvals to approve or reject this account.`,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(
          `[notifications.sendSignupEmail] Resend returned ${res.status}: ${detail}`,
        );
        return { ok: false as const, reason: "send_failed" };
      }

      return { ok: true as const };
    } catch (err) {
      console.error("[notifications.sendSignupEmail] Failed to send email", err);
      return { ok: false as const, reason: "exception" };
    }
  },
});

/**
 * Alerts a fleet's recipients when the automated AD watch (convex/crons.ts →
 * adWatchActions.runScheduledAdChecks) finds new potential FAA ADs. Reuses the
 * same Resend setup as sendSignupEmail and no-ops with a warning if env is unset,
 * so a misconfiguration can never break the scheduled sweep.
 *
 * Required Convex env vars: RESEND_API_KEY, SIGNUP_EMAIL_FROM
 */
export const sendAdAlertEmail = internalAction({
  args: {
    recipients: v.array(v.string()),
    projectName: v.string(),
    newCount: v.number(),
    findings: v.array(
      v.object({
        adNumber: v.string(),
        title: v.string(),
        confidence: v.string(),
        sourceUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.SIGNUP_EMAIL_FROM;
    if (!apiKey || !from) {
      console.warn(
        "[notifications.sendAdAlertEmail] Skipping email: set RESEND_API_KEY and SIGNUP_EMAIL_FROM in the Convex dashboard env to enable AD alerts.",
      );
      return { ok: false as const, reason: "not_configured" };
    }
    if (args.recipients.length === 0) {
      return { ok: false as const, reason: "no_recipients" };
    }

    const plural = args.newCount === 1 ? "" : "s";
    const subject = `${args.projectName}: ${args.newCount} new potential FAA AD${plural} to review`;
    const lines = args.findings
      .map(
        (f) =>
          `• AD ${f.adNumber} (${f.confidence} confidence) — ${f.title}` +
          (f.sourceUrl ? `\n  ${f.sourceUrl}` : ""),
      )
      .join("\n");
    const text =
      `The automated AD/SB watch found ${args.newCount} new potential FAA Airworthiness Directive${plural} ` +
      `that may apply to aircraft in "${args.projectName}":\n\n${lines}\n\n` +
      `Open the AD/SB watch card in AeroGap to review, cross-check against your logbook, ` +
      `and mark each as recorded or dismissed.\n\n` +
      `Advisory only — always confirm applicability against the official AD text and your ` +
      `aircraft's serial/configuration before acting.`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: args.recipients, subject, text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`[notifications.sendAdAlertEmail] Resend returned ${res.status}: ${detail}`);
        return { ok: false as const, reason: "send_failed" };
      }
      return { ok: true as const };
    } catch (err) {
      console.error("[notifications.sendAdAlertEmail] Failed to send email", err);
      return { ok: false as const, reason: "exception" };
    }
  },
});
