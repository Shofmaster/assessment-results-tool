"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { BillingOwnerType, BillingPlanId } from "./lib/billingPlans";
import {
  BILLING_PLANS,
  getStripePriceIdForPlan,
  getTrialPeriodDays,
} from "./lib/billingPlans";
import { getStripeClient, isStripeConfigured } from "./lib/stripeClient";

const ownerTypeValidator = v.union(v.literal("user"), v.literal("company"));
const planIdValidator = v.union(
  v.literal("basic"),
  v.literal("pro"),
  v.literal("enterprise"),
);

async function assertStripeReady() {
  if (!isStripeConfigured()) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in Convex.");
  }
}

async function requireActionBillingAuth(
  ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; runQuery: Function },
  ownerType: BillingOwnerType,
  ownerId: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  await ctx.runQuery(internal.billing.internalAssertBillingOwner, {
    ownerType,
    ownerId,
    userId: identity.subject,
  });
  return identity;
}

async function ensureStripeCustomer(
  ctx: { runQuery: Function; runMutation: Function },
  args: {
    ownerType: BillingOwnerType;
    ownerId: string;
    email: string;
    name?: string;
  },
): Promise<string> {
  const existing = await ctx.runQuery(internal.billing.internalGetCustomerByOwner, {
    ownerType: args.ownerType,
    ownerId: args.ownerId,
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: args.email,
    name: args.name,
    metadata: {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
    },
  });

  await ctx.runMutation(internal.billing.internalUpsertCustomer, {
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    stripeCustomerId: customer.id,
    email: args.email,
  });

  return customer.id;
}

export const createSubscriptionPayment = action({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    planId: planIdValidator,
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertStripeReady();
    await requireActionBillingAuth(ctx, args.ownerType as BillingOwnerType, args.ownerId);

    const stripeCustomerId = await ensureStripeCustomer(ctx, {
      ownerType: args.ownerType as BillingOwnerType,
      ownerId: args.ownerId,
      email: args.email,
      name: args.name,
    });

    const stripe = getStripeClient();
    const priceId = getStripePriceIdForPlan(args.planId as BillingPlanId);
    const trialPeriodDays = getTrialPeriodDays();
    const isTrial = trialPeriodDays > 0;

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      // A trial produces a $0 first invoice (no PaymentIntent); Stripe instead
      // attaches a pending SetupIntent to collect a card for when the trial ends.
      ...(isTrial
        ? {
            trial_period_days: trialPeriodDays,
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" },
            },
            expand: ["pending_setup_intent"],
          }
        : { expand: ["latest_invoice.payment_intent"] }),
      metadata: {
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        planId: args.planId,
      },
    });

    let clientSecret: string | null = null;
    if (isTrial) {
      const setupIntent = subscription.pending_setup_intent;
      clientSecret =
        typeof setupIntent === "object" && setupIntent
          ? setupIntent.client_secret
          : null;
    } else {
      const invoice = subscription.latest_invoice;
      const paymentIntent =
        typeof invoice === "object" && invoice && "payment_intent" in invoice
          ? (invoice as { payment_intent?: { client_secret?: string | null } }).payment_intent
          : null;
      clientSecret =
        typeof paymentIntent === "object" && paymentIntent
          ? paymentIntent.client_secret ?? null
          : null;
    }

    if (!clientSecret) {
      throw new Error(
        isTrial
          ? "Could not create setup intent for trial subscription."
          : "Could not create payment intent for subscription.",
      );
    }

    return {
      subscriptionId: subscription.id,
      clientSecret,
      planName: BILLING_PLANS[args.planId as BillingPlanId].name,
      // 'setup' => confirm a SetupIntent (trial); 'payment' => confirm a PaymentIntent.
      intentMode: isTrial ? ("setup" as const) : ("payment" as const),
      trialPeriodDays: isTrial ? trialPeriodDays : 0,
    };
  },
});

export const createSetupIntentForPaymentMethod = action({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertStripeReady();
    await requireActionBillingAuth(ctx, args.ownerType as BillingOwnerType, args.ownerId);
    const stripeCustomerId = await ensureStripeCustomer(ctx, {
      ownerType: args.ownerType as BillingOwnerType,
      ownerId: args.ownerId,
      email: args.email,
      name: args.name,
    });
    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });
    if (!setupIntent.client_secret) {
      throw new Error("Failed to create setup intent.");
    }
    return { clientSecret: setupIntent.client_secret };
  },
});

export const changeSubscriptionPlan = action({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    planId: planIdValidator,
  },
  handler: async (ctx, args) => {
    await assertStripeReady();
    await requireActionBillingAuth(ctx, args.ownerType as BillingOwnerType, args.ownerId);
    const subId = await ctx.runQuery(internal.billing.internalGetSubscriptionStripeId, {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
    });
    if (!subId) throw new Error("No active subscription to change.");

    const stripe = getStripeClient();
    const sub = await stripe.subscriptions.retrieve(subId);
    const itemId = sub.items.data[0]?.id;
    if (!itemId) throw new Error("Subscription has no items.");

    const newPriceId = getStripePriceIdForPlan(args.planId as BillingPlanId);
    await stripe.subscriptions.update(subId, {
      items: [{ id: itemId, price: newPriceId }],
      proration_behavior: "create_prorations",
      metadata: { planId: args.planId },
    });

    return { success: true };
  },
});

export const cancelSubscription = action({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await assertStripeReady();
    await requireActionBillingAuth(ctx, args.ownerType as BillingOwnerType, args.ownerId);
    const subId = await ctx.runQuery(internal.billing.internalGetSubscriptionStripeId, {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
    });
    if (!subId) throw new Error("No subscription found.");

    const stripe = getStripeClient();
    if (args.cancelAtPeriodEnd !== false) {
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(subId);
    }
    return { success: true };
  },
});

export const reactivateSubscription = action({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertStripeReady();
    await requireActionBillingAuth(ctx, args.ownerType as BillingOwnerType, args.ownerId);
    const subId = await ctx.runQuery(internal.billing.internalGetSubscriptionStripeId, {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
    });
    if (!subId) throw new Error("No subscription found.");

    const stripe = getStripeClient();
    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    return { success: true };
  },
});

export const syncOwnerFromStripe = action({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    await assertStripeReady();
    await requireActionBillingAuth(ctx, args.ownerType as BillingOwnerType, args.ownerId);
    const customer = await ctx.runQuery(internal.billing.internalGetCustomerByOwner, {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
    });
    if (!customer) return { synced: false };

    const stripe = getStripeClient();
    const subs = await stripe.subscriptions.list({
      customer: customer.stripeCustomerId,
      status: "all",
      limit: 5,
    });
    const latest = subs.data.sort((a, b) => b.created - a.created)[0];
    if (!latest) return { synced: false };

    await ctx.runMutation(internal.billing.internalApplyStripeSubscription, {
      stripeCustomerId: customer.stripeCustomerId,
      subscription: latest,
    });

    const invoices = await stripe.invoices.list({
      customer: customer.stripeCustomerId,
      limit: 12,
    });
    for (const inv of invoices.data) {
      const invSub = (inv as { subscription?: string | { id?: string } | null }).subscription;
      await ctx.runMutation(internal.billing.internalUpsertInvoice, {
        billingCustomerId: customer._id,
        stripeInvoiceId: inv.id,
        stripeSubscriptionId:
          typeof invSub === "string" ? invSub : invSub?.id,
        status: inv.status ?? "unknown",
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? undefined,
        invoicePdf: inv.invoice_pdf ?? undefined,
        periodStart: inv.period_start ?? undefined,
        periodEnd: inv.period_end ?? undefined,
      });
    }

    return { synced: true, subscriptionId: latest.id, status: latest.status };
  },
});
