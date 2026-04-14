import type { Id } from "./_generated/dataModel";

/** Platform-wide shared docs omit companyId; tenant docs must match the viewer's company when set. */
export function sharedDocVisibleForCompany(
  docCompanyId: Id<"companies"> | undefined,
  viewerCompanyId: Id<"companies"> | undefined | null,
): boolean {
  if (docCompanyId === undefined) return true;
  if (viewerCompanyId === undefined || viewerCompanyId === null) return false;
  return docCompanyId === viewerCompanyId;
}
