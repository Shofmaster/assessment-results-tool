/**
 * Shared presentation helpers for roster/personnel qualification status.
 *
 * Status values: "expired" | "due_30_days" | (anything else → up to date).
 * Used by Roster.tsx and roster/RosterComplianceDashboard.tsx so the badge
 * styling and labels stay in sync across both views.
 */

/** Tailwind classes for a status badge (color-coded by urgency). */
export function statusBadgeClass(status: string): string {
  if (status === "expired") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (status === "due_30_days") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-green-500/20 text-green-300 border-green-500/30";
}

/** Human-readable label for a roster qualification status. */
export function statusLabel(status: string): string {
  if (status === "expired") return "Expired";
  if (status === "due_30_days") return "Due in 30 Days";
  return "Up to Date";
}
