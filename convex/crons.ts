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

export default crons;
