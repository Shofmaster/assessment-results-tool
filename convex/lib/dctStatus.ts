/**
 * DCT compliance traffic-light status (shared logic for queries and tests).
 * Green: last check completed, no unresolved gaps/mismatches, and next due not passed.
 * Yellow: revision check overdue (nextDueAt in the past) and no blocking reds from mismatches (red wins).
 * Red: any unresolved gap or mismatch.
 */
export function computeDctComplianceStatus(args: {
  lastCheckCompletedAt?: string;
  nextDueAt?: string;
  unresolvedGapOrMismatch: number;
}): "green" | "yellow" | "red" | "unknown" {
  const { lastCheckCompletedAt, nextDueAt, unresolvedGapOrMismatch } = args;
  if (unresolvedGapOrMismatch > 0) return "red";
  const now = Date.now();
  if (nextDueAt && new Date(nextDueAt).getTime() < now) return "yellow";
  if (
    lastCheckCompletedAt &&
    unresolvedGapOrMismatch === 0 &&
    (!nextDueAt || new Date(nextDueAt).getTime() >= now)
  ) {
    return "green";
  }
  return "unknown";
}
