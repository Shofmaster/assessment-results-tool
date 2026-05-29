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
