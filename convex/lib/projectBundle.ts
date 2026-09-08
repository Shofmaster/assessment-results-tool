/**
 * Portable project bundle format for moving audit work between installations.
 *
 * Deliberately excludes manuals, logbooks, fleet, roster, and company-wide
 * libraries — only project-scoped audit artifacts travel in the bundle.
 */
import { isLocalReferenceCategory } from "../_helpers";

export const PROJECT_BUNDLE_VERSION = "2.0.0";

export const PROJECT_BUNDLE_SCOPE = {
  includes: [
    "assessments",
    "documents",
    "analyses",
    "simulationResults",
    "documentRevisions",
    "agentDocuments",
    "entityIssues",
  ],
  excludes: [
    "manuals",
    "logbooks",
    "fleet",
    "roster",
    "checklists",
    "company_library",
    "certificate_profiles",
    "billing",
  ],
} as const;

export function assertBundleVersion(version: unknown): void {
  if (version !== PROJECT_BUNDLE_VERSION) {
    throw new Error(
      `Unsupported project bundle version "${String(version)}". Expected ${PROJECT_BUNDLE_VERSION}.`,
    );
  }
}

/** Reference-only document categories are not imported — pointers stay on the source machine. */
export function shouldImportDocument(category: string): boolean {
  return !isLocalReferenceCategory(category);
}
