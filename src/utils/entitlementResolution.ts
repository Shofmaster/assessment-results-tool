/**
 * Company policy acts as a ceiling; per-user toggles can only restrict further
 * within it. null/undefined at a layer = unrestricted at that layer.
 * Returns null when neither layer restricts (= everything enabled).
 */
export function intersectEnabledLists(
  companyValue: string[] | null | undefined,
  userValue: string[] | null | undefined
): string[] | null {
  if (companyValue == null && userValue == null) return null;
  if (companyValue == null) return [...(userValue as string[])];
  if (userValue == null) return [...companyValue];
  const userSet = new Set(userValue);
  return companyValue.filter((key) => userSet.has(key));
}

export function resolveLogbookEnabled(
  platformValue: boolean | undefined,
  companyValue: boolean | undefined,
  userValue: boolean | undefined
): boolean {
  if (platformValue !== undefined) return platformValue;
  if (companyValue !== undefined) return companyValue;
  return userValue === true;
}

export type BillingEntitlementEffective = {
  grantsAccess: boolean;
  enabledFeatures: string[] | null;
  logbookEnabled: boolean;
};

/**
 * When billing enforcement is on, apply subscription entitlements unless manual override is active.
 * Preserves undefined ("not configured at this layer") so callers can distinguish it from
 * null ("explicitly unrestricted") and fall through to the next layer.
 */
export function applyBillingEnforcement(
  manualSource: 'billing' | 'manual' | undefined,
  policyOrUserFeatures: string[] | null | undefined,
  policyOrUserLogbook: boolean | undefined,
  billing: BillingEntitlementEffective | null | undefined,
  enforcementEnabled: boolean,
): { enabledFeatures: string[] | null | undefined; logbookEnabled: boolean | undefined } {
  if (!enforcementEnabled || manualSource === 'manual') {
    return {
      enabledFeatures: policyOrUserFeatures,
      logbookEnabled: policyOrUserLogbook,
    };
  }
  if (billing?.grantsAccess) {
    return {
      enabledFeatures: billing.enabledFeatures,
      logbookEnabled: billing.logbookEnabled,
    };
  }
  if (billing && !billing.grantsAccess) {
    return { enabledFeatures: [], logbookEnabled: false };
  }
  return {
    enabledFeatures: policyOrUserFeatures,
    logbookEnabled: policyOrUserLogbook,
  };
}
