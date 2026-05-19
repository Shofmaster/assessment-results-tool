import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireAuth, requirePlatformStaff } from "./_helpers";
import { requireBillingOwnerManageAccess } from "./lib/billingAuth";
import {
  BILLING_PLANS,
  BILLING_PLAN_IDS,
  type BillingOwnerType,
  type BillingPlanId,
  planIdFromStripePriceId,
  subscriptionGrantsAccess,
} from "./lib/billingPlans";
import {
  mergeBillingSnapshots,
  snapshotFromSubscription,
} from "./lib/billingEntitlements";

const ownerTypeValidator = v.union(v.literal("user"), v.literal("company"));
const planIdValidator = v.union(
  v.literal("basic"),
  v.literal("pro"),
  v.literal("enterprise"),
);

function nowIso() {
  return new Date().toISOString();
}

async function getCustomerByOwner(
  ctx: { db: { query: Function } },
  ownerType: BillingOwnerType,
  ownerId: string,
) {
  return await ctx.db
    .query("billingCustomers")
    .withIndex("by_owner", (q: { eq: Function }) =>
      q.eq("ownerType", ownerType).eq("ownerId", ownerId),
    )
    .unique();
}

async function getActiveSubscriptionForCustomer(
  ctx: { db: { query: Function } },
  billingCustomerId: Id<"billingCustomers">,
) {
  const subs = await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_billingCustomerId", (q: { eq: Function }) =>
      q.eq("billingCustomerId", billingCustomerId),
    )
    .collect();
  return (
    subs.find((s: Doc<"billingSubscriptions">) =>
      subscriptionGrantsAccess(s.status),
    ) ??
    subs.sort(
      (a: Doc<"billingSubscriptions">, b: Doc<"billingSubscriptions">) =>
        b.updatedAt.localeCompare(a.updatedAt),
    )[0] ??
    null
  );
}

function serializeSubscription(sub: Doc<"billingSubscriptions"> | null) {
  if (!sub) return null;
  const plan = BILLING_PLANS[sub.planId as BillingPlanId];
  return {
    ...sub,
    planName: plan?.name ?? sub.planId,
    grantsAccess: subscriptionGrantsAccess(sub.status),
  };
}

export const listPlans = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return BILLING_PLAN_IDS.map((id) => {
      const plan = BILLING_PLANS[id];
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        monthlyPriceLabel: plan.monthlyPriceLabel,
        logbookEnabled: plan.logbookEnabled,
        featureCount: plan.enabledFeatures?.length ?? null,
      };
    });
  },
});

export const getOverview = query({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireBillingOwnerManageAccess(ctx, args.ownerType, args.ownerId);
    const customer = await getCustomerByOwner(ctx, args.ownerType, args.ownerId);
    if (!customer) {
      return {
        customer: null,
        subscription: null,
        recentInvoices: [],
      };
    }
    const subscription = await getActiveSubscriptionForCustomer(ctx, customer._id);
    const invoices = await ctx.db
      .query("billingInvoices")
      .withIndex("by_billingCustomerId", (q) => q.eq("billingCustomerId", customer._id))
      .collect();
    invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      customer,
      subscription: serializeSubscription(subscription),
      recentInvoices: invoices.slice(0, 12),
    };
  },
});

/** Resolved billing entitlements for the signed-in user (company + personal). */
export const getMyEntitlements = query({
  args: {
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    let companySnapshot = null;
    if (args.companyId) {
      const companyCustomer = await getCustomerByOwner(ctx, "company", args.companyId);
      if (companyCustomer) {
        const sub = await getActiveSubscriptionForCustomer(ctx, companyCustomer._id);
        companySnapshot = sub
          ? snapshotFromSubscription(sub.planId as BillingPlanId, sub.status)
          : null;
      }
    }
    const userCustomer = await getCustomerByOwner(ctx, "user", userId);
    let userSnapshot = null;
    if (userCustomer) {
      const sub = await getActiveSubscriptionForCustomer(ctx, userCustomer._id);
      userSnapshot = sub
        ? snapshotFromSubscription(sub.planId as BillingPlanId, sub.status)
        : null;
    }
    const context = args.companyId ? ("company" as const) : ("personal" as const);
    const effective = mergeBillingSnapshots(companySnapshot, userSnapshot, context);
    return {
      company: companySnapshot,
      user: userSnapshot,
      effective,
      enforcementEnabled: process.env.BILLING_ENFORCEMENT_ENABLED === "true",
    };
  },
});

export const listInvoices = query({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireBillingOwnerManageAccess(ctx, args.ownerType, args.ownerId);
    const customer = await getCustomerByOwner(ctx, args.ownerType, args.ownerId);
    if (!customer) return [];
    const rows = await ctx.db
      .query("billingInvoices")
      .withIndex("by_billingCustomerId", (q) => q.eq("billingCustomerId", customer._id))
      .collect();
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.slice(0, args.limit ?? 24);
  },
});

/** Platform admin billing operations dashboard. */
export const adminListBillingSummary = query({
  args: {
    statusFilter: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const limit = args.limit ?? 100;
    let subs = await ctx.db.query("billingSubscriptions").collect();
    if (args.statusFilter) {
      subs = subs.filter((s) => s.status === args.statusFilter);
    }
    subs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    subs = subs.slice(0, limit);

    const customers = await ctx.db.query("billingCustomers").collect();
    const customerById = new Map(customers.map((c) => [c._id, c]));

    const recentEvents = await ctx.db.query("billingEvents").collect();
    recentEvents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      subscriptions: subs.map((s) => ({
        ...s,
        customer: customerById.get(s.billingCustomerId) ?? null,
        planName: BILLING_PLANS[s.planId as BillingPlanId]?.name ?? s.planId,
      })),
      recentEvents: recentEvents.slice(0, 50),
      stats: {
        totalCustomers: customers.length,
        activeSubscriptions: subs.filter((s) => subscriptionGrantsAccess(s.status)).length,
        pastDue: subs.filter((s) => s.status === "past_due").length,
        failedWebhooks: recentEvents.filter((e) => e.status === "failed").length,
      },
    };
  },
});

export const adminListFailedEvents = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const events = await ctx.db.query("billingEvents").collect();
    return events
      .filter((e) => e.status === "failed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, args.limit ?? 50);
  },
});

// ─── Internal helpers for actions/webhooks ───────────────────────────────────

export const internalListAllCustomers = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("billingCustomers").collect(),
});

export const internalGetCustomerByOwner = internalQuery({
  args: { ownerType: ownerTypeValidator, ownerId: v.string() },
  handler: async (ctx, args) => getCustomerByOwner(ctx, args.ownerType, args.ownerId),
});

export const internalGetBillingEvent = internalQuery({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("billingEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique(),
});

export const internalAssertBillingOwner = internalQuery({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.ownerType === "user") {
      if (args.ownerId !== args.userId) throw new Error("Not authorized");
      return true;
    }
    const membership = await ctx.db
      .query("companyMemberships")
      .withIndex("by_companyId_userId", (q) =>
        q.eq("companyId", args.ownerId as Id<"companies">).eq("userId", args.userId),
      )
      .first();
    if (!membership || membership.status === "suspended") {
      throw new Error("Not authorized: company admin required");
    }
    if (membership.role !== "company_admin") {
      throw new Error("Not authorized: company admin required");
    }
    return true;
  },
});

export const internalGetSubscriptionStripeId = internalQuery({
  args: { ownerType: ownerTypeValidator, ownerId: v.string() },
  handler: async (ctx, args) => {
    const customer = await getCustomerByOwner(ctx, args.ownerType, args.ownerId);
    if (!customer) return null;
    const sub = await getActiveSubscriptionForCustomer(ctx, customer._id);
    return sub?.stripeSubscriptionId ?? null;
  },
});

export const internalGetCustomerByStripeId = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .unique(),
});

export const internalUpsertCustomer = internalMutation({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    stripeCustomerId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await getCustomerByOwner(ctx, args.ownerType, args.ownerId);
    const ts = nowIso();
    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        email: args.email,
        updatedAt: ts,
      });
      return existing._id;
    }
    return await ctx.db.insert("billingCustomers", {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      stripeCustomerId: args.stripeCustomerId,
      email: args.email,
      createdAt: ts,
      updatedAt: ts,
    });
  },
});

export const internalUpsertSubscription = internalMutation({
  args: {
    billingCustomerId: v.id("billingCustomers"),
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    planId: planIdValidator,
    status: v.string(),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
    latestInvoiceId: v.optional(v.string()),
    dunningStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("past_due"),
        v.literal("unpaid"),
        v.literal("canceled"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const ts = nowIso();
    const existing = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();

    const row = {
      billingCustomerId: args.billingCustomerId,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      planId: args.planId,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      canceledAt: args.canceledAt,
      trialEnd: args.trialEnd,
      latestInvoiceId: args.latestInvoiceId,
      dunningStatus: args.dunningStatus ?? "none",
      updatedAt: ts,
    };

    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("billingSubscriptions", {
      ...row,
      createdAt: ts,
    });
  },
});

export const internalUpsertInvoice = internalMutation({
  args: {
    billingCustomerId: v.id("billingCustomers"),
    stripeInvoiceId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.string(),
    amountDue: v.number(),
    amountPaid: v.number(),
    currency: v.string(),
    hostedInvoiceUrl: v.optional(v.string()),
    invoicePdf: v.optional(v.string()),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ts = nowIso();
    const existing = await ctx.db
      .query("billingInvoices")
      .withIndex("by_stripeInvoiceId", (q) => q.eq("stripeInvoiceId", args.stripeInvoiceId))
      .unique();
    const row = { ...args, updatedAt: ts };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert("billingInvoices", { ...row, createdAt: ts });
  },
});

export const internalRecordBillingEvent = internalMutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    status: v.union(v.literal("processed"), v.literal("failed"), v.literal("skipped")),
    errorMessage: v.optional(v.string()),
    ownerType: v.optional(ownerTypeValidator),
    ownerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("billingEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      status: args.status,
      errorMessage: args.errorMessage,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      createdAt: nowIso(),
      processedAt: nowIso(),
    });
  },
});

async function syncEntitlementsForOwner(
  ctx: MutationCtx,
  args: {
    ownerType: BillingOwnerType;
    ownerId: string;
    planId: BillingPlanId;
    status: string;
  },
) {
    const plan = BILLING_PLANS[args.planId];
    const grants = subscriptionGrantsAccess(args.status);
    const ts = nowIso();

    if (args.ownerType === "company") {
      const companyId = args.ownerId as Id<"companies">;
      const existing = await ctx.db
        .query("companyFeaturePolicies")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .unique();
      if (existing?.entitlementSource === "manual") return;

      const patch = grants
        ? {
            enabledFeatures: plan.enabledFeatures ?? undefined,
            logbookEnabled: plan.logbookEnabled,
            logbookEntitlementMode: plan.logbookEntitlementMode,
            entitlementSource: "billing" as const,
            billingPlanId: args.planId,
            updatedAt: ts,
          }
        : {
            entitlementSource: "billing" as const,
            billingPlanId: undefined,
            updatedAt: ts,
          };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else if (grants) {
        await ctx.db.insert("companyFeaturePolicies", {
          companyId,
          ...patch,
          createdAt: ts,
        });
      }
      return;
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.ownerId))
      .unique();
    if (settings?.entitlementSource === "manual") return;

    const patch = grants
      ? {
          enabledFeatures: plan.enabledFeatures ?? undefined,
          logbookEnabled: plan.logbookEnabled,
          logbookEntitlementMode: plan.logbookEntitlementMode,
          entitlementSource: "billing" as const,
          billingPlanId: args.planId,
        }
      : {
          entitlementSource: "billing" as const,
          billingPlanId: undefined,
          enabledFeatures: [],
          logbookEnabled: false,
        };

    if (settings) {
      await ctx.db.patch(settings._id, patch);
    } else if (grants) {
      await ctx.db.insert("userSettings", {
        userId: args.ownerId,
        thinkingEnabled: false,
        thinkingBudget: 10000,
        selfReviewMode: "off",
        selfReviewMaxIterations: 2,
        ...patch,
      });
    }
}

export const internalSyncEntitlementsForOwner = internalMutation({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    planId: planIdValidator,
    status: v.string(),
  },
  handler: async (ctx, args) => syncEntitlementsForOwner(ctx, args),
});

export const markEntitlementManualOverride = mutation({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireBillingOwnerManageAccess(ctx, args.ownerType, args.ownerId);
    const ts = nowIso();
    if (args.ownerType === "company") {
      const companyId = args.ownerId as Id<"companies">;
      const existing = await ctx.db
        .query("companyFeaturePolicies")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { entitlementSource: "manual", updatedAt: ts });
      } else {
        await ctx.db.insert("companyFeaturePolicies", {
          companyId,
          entitlementSource: "manual",
          createdAt: ts,
          updatedAt: ts,
        });
      }
      return;
    }
    const userId = args.ownerId;
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (settings) {
      await ctx.db.patch(settings._id, { entitlementSource: "manual" });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        thinkingEnabled: false,
        thinkingBudget: 10000,
        selfReviewMode: "off",
        selfReviewMaxIterations: 2,
        entitlementSource: "manual",
      });
    }
  },
});

export const internalApplyStripeSubscription = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    subscription: v.any(),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId),
      )
      .unique();
    if (!customer) {
      throw new Error(`No billing customer for Stripe customer ${args.stripeCustomerId}`);
    }

    const sub = args.subscription as {
      id: string;
      status: string;
      cancel_at_period_end?: boolean;
      canceled_at?: number | null;
      trial_end?: number | null;
      current_period_start?: number;
      current_period_end?: number;
      latest_invoice?: string | { id?: string };
      items?: { data?: { price?: { id?: string } }[] };
    };

    const priceId = sub.items?.data?.[0]?.price?.id;
    if (!priceId) throw new Error("Subscription missing price id");
    const planId = planIdFromStripePriceId(priceId);
    if (!planId) throw new Error(`Unknown Stripe price id: ${priceId}`);

    let dunningStatus: "none" | "past_due" | "unpaid" | "canceled" = "none";
    if (sub.status === "past_due") dunningStatus = "past_due";
    if (sub.status === "unpaid") dunningStatus = "unpaid";
    if (sub.status === "canceled") dunningStatus = "canceled";

    const latestInvoiceId =
      typeof sub.latest_invoice === "string"
        ? sub.latest_invoice
        : sub.latest_invoice?.id;

    const existing = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_stripeSubscriptionId", (q) => q.eq("stripeSubscriptionId", sub.id))
      .unique();
    const ts = nowIso();
    const row = {
      billingCustomerId: customer._id,
      ownerType: customer.ownerType,
      ownerId: customer.ownerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      planId,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      canceledAt: sub.canceled_at ?? undefined,
      trialEnd: sub.trial_end ?? undefined,
      latestInvoiceId,
      dunningStatus,
      updatedAt: ts,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("billingSubscriptions", { ...row, createdAt: ts });
    }

    await syncEntitlementsForOwner(ctx, {
      ownerType: customer.ownerType,
      ownerId: customer.ownerId,
      planId,
      status: sub.status,
    });
  },
});
