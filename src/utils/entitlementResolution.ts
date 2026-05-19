export function resolveEnabledList(
  platformValue: string[] | null | undefined,
  companyValue: string[] | null | undefined,
  userValue: string[] | null | undefined
): string[] | null {
  if (platformValue !== undefined) return platformValue;
  if (companyValue !== undefined) return companyValue;
  if (userValue !== undefined) return userValue;
  return null;
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
 */
export function applyBillingEnforcement(
  manualSource: 'billing' | 'manual' | undefined,
  policyOrUserFeatures: string[] | null | undefined,
  policyOrUserLogbook: boolean | undefined,
  billing: BillingEntitlementEffective | null | undefined,
  enforcementEnabled: boolean,
): { enabledFeatures: string[] | null; logbookEnabled: boolean } {
  if (!enforcementEnabled || manualSource === 'manual') {
    return {
      enabledFeatures: policyOrUserFeatures ?? null,
      logbookEnabled: policyOrUserLogbook === true,
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
    enabledFeatures: policyOrUserFeatures ?? null,
    logbookEnabled: policyOrUserLogbook === true,
  };
}
