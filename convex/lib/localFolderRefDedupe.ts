/**
 * Pure decision for local-folder registration against an existing Convex row.
 * Shared by the mutation and unit tests (no Convex runtime required).
 */
export type LocalFolderRefDecision = "insert" | "skip" | "update";

export function decideLocalFolderRefAction(
  existing: { contentHash?: string | null; size?: number | null } | null | undefined,
  item: { contentHash: string; size: number },
): LocalFolderRefDecision {
  if (!existing) return "insert";
  if (existing.contentHash === item.contentHash) return "skip";
  return "update";
}
