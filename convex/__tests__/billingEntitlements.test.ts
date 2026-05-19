import { describe, expect, it } from "vitest";
import {
  mergeBillingSnapshots,
  snapshotFromSubscription,
} from "../lib/billingEntitlements";

describe("snapshotFromSubscription", () => {
  it("grants access for active status", () => {
    const snap = snapshotFromSubscription("pro", "active");
    expect(snap.grantsAccess).toBe(true);
    expect(snap.planId).toBe("pro");
    expect(snap.enabledFeatures?.length).toBeGreaterThan(0);
  });

  it("denies access for canceled status", () => {
    const snap = snapshotFromSubscription("enterprise", "canceled");
    expect(snap.grantsAccess).toBe(false);
    expect(snap.enabledFeatures).toEqual([]);
  });
});

describe("mergeBillingSnapshots", () => {
  const companyActive = snapshotFromSubscription("pro", "active");
  const userActive = snapshotFromSubscription("basic", "active");

  it("prefers company subscription in company context", () => {
    const merged = mergeBillingSnapshots(companyActive, userActive, "company");
    expect(merged?.planId).toBe("pro");
  });

  it("uses user subscription in personal context when company inactive", () => {
    const merged = mergeBillingSnapshots(
      snapshotFromSubscription("pro", "canceled"),
      userActive,
      "personal",
    );
    expect(merged?.planId).toBe("basic");
  });
});
