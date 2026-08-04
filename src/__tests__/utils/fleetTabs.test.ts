import { describe, expect, it } from 'vitest';
import { DEFAULT_FLEET_TAB, FLEET_TABS, resolveFleetTab } from '../../utils/fleetTabs';

describe('resolveFleetTab', () => {
  it('accepts every declared tab id', () => {
    for (const tab of FLEET_TABS) {
      expect(resolveFleetTab(tab)).toBe(tab);
    }
  });

  it('falls back to the default when the param is absent', () => {
    // Bare /fleet is a deep-link target from Ask sources, global search, the
    // coming-due card, and the prod smoke test — it must land somewhere.
    expect(resolveFleetTab(null)).toBe(DEFAULT_FLEET_TAB);
    expect(resolveFleetTab(undefined)).toBe(DEFAULT_FLEET_TAB);
    expect(resolveFleetTab('')).toBe(DEFAULT_FLEET_TAB);
  });

  it('falls back to the default for unknown or stale ids', () => {
    expect(resolveFleetTab('overview')).toBe(DEFAULT_FLEET_TAB);
    expect(resolveFleetTab('Aircraft')).toBe(DEFAULT_FLEET_TAB);
    expect(resolveFleetTab('__proto__')).toBe(DEFAULT_FLEET_TAB);
  });

  it('defaults to the aircraft roster', () => {
    expect(DEFAULT_FLEET_TAB).toBe('aircraft');
  });
});
