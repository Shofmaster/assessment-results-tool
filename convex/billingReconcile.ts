"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripeClient, isStripeConfigured } from "./lib/stripeClient";

/** Periodic reconciliation: sync Stripe subscription state into Convex. */
export const reconcileAllCustomers = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!isStripeConfigured()) return { skipped: true, reason: "stripe_not_configured" };

    const customers = await ctx.runQuery(internal.billing.internalListAllCustomers, {});
    const stripe = getStripeClient();
    let synced = 0;
    let errors = 0;

    for (const customer of customers) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: customer.stripeCustomerId,
          status: "all",
          limit: 3,
        });
        const latest = subs.data.sort((a, b) => b.created - a.created)[0];
        if (latest) {
          await ctx.runMutation(internal.billing.internalApplyStripeSubscription, {
            stripeCustomerId: customer.stripeCustomerId,
            subscription: latest,
          });
          synced++;
        }
      } catch {
        errors++;
      }
    }

    return { synced, errors, total: customers.length };
  },
});
