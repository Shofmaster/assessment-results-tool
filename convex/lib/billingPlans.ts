/**
 * Subscription plan catalog. Stripe Price IDs come from Convex env vars.
 */

export type BillingPlanId = "basic" | "pro" | "enterprise";
export type BillingOwnerType = "user" | "company";

export type BillingPlanDefinition = {
  id: BillingPlanId;
  name: string;
  description: string;
  /** Convex env var name holding the Stripe Price ID */
  stripePriceEnvVar: string;
  monthlyPriceLabel: string;
  enabledFeatures: string[] | null;
  logbookEnabled: boolean;
  logbookEntitlementMode?: "addon" | "standalone";
};

/** QM Core feature set (mirrors src/config/featureBundles.ts). */
const QM_CORE_FEATURES = [
  "quality-command-center",
  "library",
  "paperwork-review",
  "dct-compliance",
  "analysis",
  "guided-audit",
  "entity-issues",
  "checklists",
  "revisions",
  "report-builder",
  "schedule",
];

const PRO_FEATURES = [
  ...QM_CORE_FEATURES,
  "audit-simulation",
  "analytics",
  "manual-writer",
  "manual-management",
  "form-337",
];

export const BILLING_PLANS: Record<BillingPlanId, BillingPlanDefinition> = {
  basic: {
    id: "basic",
    name: "Basic",
    description: "QM Core compliance workflow for small teams.",
    stripePriceEnvVar: "STRIPE_PRICE_BASIC_MONTHLY",
    monthlyPriceLabel: "Contact sales",
    enabledFeatures: QM_CORE_FEATURES,
    logbookEnabled: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "QM Core plus audit simulation, analytics, and manual tools.",
    stripePriceEnvVar: "STRIPE_PRICE_PRO_MONTHLY",
    monthlyPriceLabel: "Contact sales",
    enabledFeatures: PRO_FEATURES,
    logbookEnabled: false,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Full platform including logbook and all modules.",
    stripePriceEnvVar: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    monthlyPriceLabel: "Contact sales",
    enabledFeatures: null,
    logbookEnabled: true,
    logbookEntitlementMode: "addon",
  },
};

export const BILLING_PLAN_IDS = Object.keys(BILLING_PLANS) as BillingPlanId[];

export function getStripePriceIdForPlan(planId: BillingPlanId): string {
  const plan = BILLING_PLANS[planId];
  const priceId = process.env[plan.stripePriceEnvVar];
  if (!priceId) {
    throw new Error(
      `Stripe price not configured. Set Convex env ${plan.stripePriceEnvVar} for plan "${planId}".`,
    );
  }
  return priceId;
}

export function planIdFromStripePriceId(stripePriceId: string): BillingPlanId | null {
  for (const planId of BILLING_PLAN_IDS) {
    const envVar = BILLING_PLANS[planId].stripePriceEnvVar;
    if (process.env[envVar] === stripePriceId) return planId;
  }
  return null;
}

export function isBillingEnforcementEnabled(): boolean {
  return process.env.BILLING_ENFORCEMENT_ENABLED === "true";
}

/**
 * Trial length applied to new self-serve subscriptions. Reads Convex env
 * STRIPE_TRIAL_PERIOD_DAYS; returns 0 (no trial) when unset or invalid.
 */
export function getTrialPeriodDays(): number {
  const raw = process.env.STRIPE_TRIAL_PERIOD_DAYS;
  if (!raw) return 0;
  const days = Number.parseInt(raw, 10);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** Subscription statuses that grant product access. */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function subscriptionGrantsAccess(status: string): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}
