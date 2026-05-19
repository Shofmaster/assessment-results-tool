import type { BillingPlanDefinition, BillingPlanId } from "./billingPlans";
import { BILLING_PLANS, subscriptionGrantsAccess } from "./billingPlans";

export type BillingEntitlementSnapshot = {
  planId: BillingPlanId | null;
  status: string | null;
  grantsAccess: boolean;
  enabledFeatures: string[] | null;
  logbookEnabled: boolean;
  logbookEntitlementMode?: "addon" | "standalone";
};

export function entitlementsFromPlan(plan: BillingPlanDefinition): Pick<
  BillingEntitlementSnapshot,
  "enabledFeatures" | "logbookEnabled" | "logbookEntitlementMode"
> {
  return {
    enabledFeatures: plan.enabledFeatures,
    logbookEnabled: plan.logbookEnabled,
    logbookEntitlementMode: plan.logbookEntitlementMode,
  };
}

export function snapshotFromSubscription(
  planId: BillingPlanId | null,
  status: string,
): BillingEntitlementSnapshot {
  const grantsAccess = subscriptionGrantsAccess(status);
  if (!grantsAccess || !planId) {
    return {
      planId,
      status,
      grantsAccess: false,
      enabledFeatures: [],
      logbookEnabled: false,
    };
  }
  const plan = BILLING_PLANS[planId];
  return {
    planId,
    status,
    grantsAccess: true,
    ...entitlementsFromPlan(plan),
  };
}

/**
 * Merge company and user billing snapshots for a signed-in user.
 * Company subscription wins in company context when both are active.
 */
export function mergeBillingSnapshots(
  company: BillingEntitlementSnapshot | null,
  user: BillingEntitlementSnapshot | null,
  context: "company" | "personal",
): BillingEntitlementSnapshot | null {
  if (context === "company" && company?.grantsAccess) return company;
  if (user?.grantsAccess) return user;
  if (context === "company" && company) return company;
  return user;
}
