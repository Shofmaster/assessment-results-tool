import { describe, expect, it } from 'vitest';
import { assertOrgBundleVersion, ORG_BUNDLE_VERSION } from '../lib/orgBundle';

describe('orgBundle version validation', () => {
  it('accepts the current version', () => {
    expect(() => assertOrgBundleVersion(ORG_BUNDLE_VERSION)).not.toThrow();
  });

  it('rejects a mismatched version', () => {
    expect(() => assertOrgBundleVersion('0.0.1')).toThrow('Unsupported organization bundle version');
  });

  it('rejects undefined', () => {
    expect(() => assertOrgBundleVersion(undefined)).toThrow('Unsupported organization bundle version');
  });

  it('rejects null', () => {
    expect(() => assertOrgBundleVersion(null)).toThrow('Unsupported organization bundle version');
  });
});
