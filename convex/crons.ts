import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.weekly(
  "regenerate audit intelligence memory",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.auditIntelligenceActions.synthesizePatternsInternal
);

crons.weekly(
  "dct compliance schedule tick",
  { dayOfWeek: "monday", hourUTC: 14, minuteUTC: 0 },
  internal.dctCompliance.weeklyScheduleTick
);

crons.interval(
  "resume stalled dct traceability runs",
  { minutes: 2 },
  internal.dctTraceabilityRunner.resumeStalledTraceabilityRuns,
);

crons.daily(
  "reconcile stripe billing state",
  { hourUTC: 6, minuteUTC: 0 },
  internal.billingReconcile.reconcileAllCustomers,
);

// Avianis aircraft + discrepancy sync runs on user demand only (Sync now
// button in Settings / Fleet view). The scheduled tick action still exists
// as internal.avianisIntegration._scheduledSyncTick — re-register it here
// if you want background sync back.

export default crons;
