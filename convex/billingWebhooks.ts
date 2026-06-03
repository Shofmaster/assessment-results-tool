"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getStripeClient, getStripeWebhookSecret } from "./lib/stripeClient";
import type Stripe from "stripe";

export const processStripeWebhook = internalAction({
  args: {
    body: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const stripe = getStripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        args.body,
        args.signature,
        getStripeWebhookSecret(),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid webhook signature";
      throw new Error(message);
    }

    const existing = await ctx.runQuery(internal.billing.internalGetBillingEvent, {
      stripeEventId: event.id,
    });
    if (existing) {
      await ctx.runMutation(internal.billing.internalRecordBillingEvent, {
        stripeEventId: event.id,
        eventType: event.type,
        status: "skipped",
      });
      return { received: true, duplicate: true };
    }

    try {
      await handleStripeEvent(ctx, event);
      await ctx.runMutation(internal.billing.internalRecordBillingEvent, {
        stripeEventId: event.id,
        eventType: event.type,
        status: "processed",
        ownerType: getOwnerFromEvent(event)?.ownerType,
        ownerId: getOwnerFromEvent(event)?.ownerId,
      });
      return { received: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook processing failed";
      await ctx.runMutation(internal.billing.internalRecordBillingEvent, {
        stripeEventId: event.id,
        eventType: event.type,
        status: "failed",
        errorMessage: message,
      });
      throw err;
    }
  },
});

function getOwnerFromEvent(event: Stripe.Event): {
  ownerType?: "user" | "company";
  ownerId?: string;
} | null {
  const obj = event.data.object as { metadata?: Record<string, string> };
  const ownerType = obj.metadata?.ownerType;
  const ownerId = obj.metadata?.ownerId;
  if (ownerType === "user" || ownerType === "company") {
    return { ownerType, ownerId };
  }
  return null;
}

async function handleStripeEvent(
  ctx: { runMutation: (...args: any[]) => any; runQuery: (...args: any[]) => any },
  event: Stripe.Event,
) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      await ctx.runMutation(internal.billing.internalApplyStripeSubscription, {
        stripeCustomerId: customerId,
        subscription,
      });
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.finalized": {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSub = (invoice as { subscription?: string | { id?: string } | null })
        .subscription;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;
      const customer = await ctx.runQuery(internal.billing.internalGetCustomerByStripeId, {
        stripeCustomerId: customerId,
      });
      if (!customer) break;

      await ctx.runMutation(internal.billing.internalUpsertInvoice, {
        billingCustomerId: customer._id,
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId:
          typeof invoiceSub === "string" ? invoiceSub : invoiceSub?.id,
        status: invoice.status ?? "unknown",
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
        invoicePdf: invoice.invoice_pdf ?? undefined,
        periodStart: invoice.period_start ?? undefined,
        periodEnd: invoice.period_end ?? undefined,
      });

      if (event.type === "invoice.payment_failed" && invoiceSub) {
        const subId = typeof invoiceSub === "string" ? invoiceSub : invoiceSub.id;
        if (!subId) break;
        const stripe = getStripeClient();
        const sub = await stripe.subscriptions.retrieve(subId);
        await ctx.runMutation(internal.billing.internalApplyStripeSubscription, {
          stripeCustomerId: customerId,
          subscription: sub,
        });
      }
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const stripe = getStripeClient();
        const sub = await stripe.subscriptions.retrieve(subId);
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await ctx.runMutation(internal.billing.internalApplyStripeSubscription, {
          stripeCustomerId: customerId,
          subscription: sub,
        });
      }
      break;
    }
    default:
      break;
  }
}
