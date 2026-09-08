/**
 * Portable organization bundle format for sharing company-level data
 * (entity profiles, certificates, roster, ratings) between installations.
 *
 * Mirrors the project bundle pattern but scoped to company/org data rather
 * than project-scoped audit artifacts.
 */

export const ORG_BUNDLE_VERSION = "1.0.0";

export const ORG_BUNDLE_SCOPE = {
  includes: [
    "company",
    "entityProfiles",
    "certificateProfiles",
    "classRatings",
    "capabilities",
    "opSpecs",
    "limitedRatings",
    "rosterPersonnel",
    "rosterRequirementTypes",
    "rosterAssignments",
  ],
  excludes: [
    "billing",
    "memberships",
    "projects",
    "manuals",
    "logbooks",
    "fleet",
  ],
} as const;

export function assertOrgBundleVersion(version: unknown): void {
  if (version !== ORG_BUNDLE_VERSION) {
    throw new Error(
      `Unsupported organization bundle version "${String(version)}". Expected ${ORG_BUNDLE_VERSION}.`,
    );
  }
}
