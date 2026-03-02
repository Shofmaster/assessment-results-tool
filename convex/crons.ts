import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.weekly(
  "regenerate audit intelligence memory",
  { dayOfWeek: "sunday", hourUTC: 3, minuteUTC: 0 },
  internal.auditIntelligenceActions.synthesizePatternsInternal
);

export default crons;
