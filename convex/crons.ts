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
  { minutes: 15 },
  internal.dctTraceabilityRunner.resumeStalledTraceabilityRuns,
);

crons.daily(
  "reconcile stripe billing state",
  { hourUTC: 6, minuteUTC: 0 },
  internal.billingReconcile.reconcileAllCustomers,
);

crons.daily(
  "auto-advance overdue checklist series",
  { hourUTC: 8, minuteUTC: 0 },
  internal.checklistSeries.autoAdvanceOverdueSeries,
);

// Walks opted-in fleets (per-project daily/weekly frequency), searches new FAA
// ADs against each aircraft, and emails owners when new findings land. The
// per-project opt-in keeps recurring web_search token cost bounded.
crons.daily(
  "check faa ads for opted-in fleets",
  { hourUTC: 9, minuteUTC: 0 },
  internal.adWatchActions.runScheduledAdChecks,
);

// Avianis aircraft + discrepancy sync runs on user demand only (Sync now
// button in Settings / Fleet view). The scheduled tick action still exists
// as internal.avianisIntegration._scheduledSyncTick — re-register it here
// if you want background sync back.

export default crons;
