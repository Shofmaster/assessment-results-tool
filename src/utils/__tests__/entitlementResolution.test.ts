import { describe, expect, it } from 'vitest';
import { applyBillingEnforcement } from '../entitlementResolution';

describe('applyBillingEnforcement', () => {
  it('keeps manual policy when entitlement source is manual', () => {
    const result = applyBillingEnforcement(
      'manual',
      ['library'],
      false,
      { grantsAccess: true, enabledFeatures: ['analysis'], logbookEnabled: true },
      true,
    );
    expect(result.enabledFeatures).toEqual(['library']);
    expect(result.logbookEnabled).toBe(false);
  });

  it('applies billing features when enforcement is on and billing grants access', () => {
    const result = applyBillingEnforcement(
      'billing',
      ['library'],
      false,
      { grantsAccess: true, enabledFeatures: ['analysis', 'guided-audit'], logbookEnabled: true },
      true,
    );
    expect(result.enabledFeatures).toEqual(['analysis', 'guided-audit']);
    expect(result.logbookEnabled).toBe(true);
  });

  it('preserves undefined ("not configured") when enforcement is off', () => {
    const result = applyBillingEnforcement(undefined, undefined, undefined, null, false);
    expect(result.enabledFeatures).toBeUndefined();
    expect(result.logbookEnabled).toBeUndefined();
  });

  it('denies when enforcement on and billing does not grant access', () => {
    const result = applyBillingEnforcement(
      'billing',
      null,
      undefined,
      { grantsAccess: false, enabledFeatures: [], logbookEnabled: false },
      true,
    );
    expect(result.enabledFeatures).toEqual([]);
    expect(result.logbookEnabled).toBe(false);
  });
});
