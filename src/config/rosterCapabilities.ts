// Shared roster capability taxonomy — single source of truth so the "Add team
// member" checkbox picker and the "Edit person" form stay in sync. Previously
// the edit form used a bare comma-separated text input instead of this list,
// which made it look like capability data was going missing (it wasn't) and
// made typos silently fall out of sync with these known values.
export const CAPABILITY_GROUPS = [
  {
    label: "Authorizations & Sign-off",
    capabilities: [
      "RII",
      "Inspector",
      "RTS",
      "A&P Mechanic",
      "Inspection Authorization (IA)",
      "DOM Authorization",
    ],
  },
  {
    label: "Maintenance Disciplines",
    capabilities: [
      "Line Maintenance",
      "Base Maintenance",
      "Airframe Technician",
      "Powerplant Technician",
      "Avionics Technician",
      "Electrical Systems",
      "Structures Technician",
      "Sheet Metal Repair",
      "Composite Repair",
      "Cabin Interiors",
      "Landing Gear",
      "Fuel Systems",
      "Hydraulics",
      "Pneumatics",
      "Propeller Maintenance",
      "Engine Borescope",
      "Engine Run",
      "Taxi Qualified",
      "Ground Support Equipment",
    ],
  },
  {
    label: "Inspection & Quality",
    capabilities: [
      "NDT Level I",
      "NDT Level II",
      "NDT Level III",
      "Parts Inspection",
      "Stores / Receiving Inspection",
      "Quality Assurance",
      "Internal Auditor",
      "Calibration Coordinator",
      "Technical Records",
    ],
  },
  {
    label: "Compliance & Programs",
    capabilities: [
      "SMS",
      "EWIS",
      "Human Factors",
      "HazMat / Dangerous Goods",
      "RVSM",
      "Pitot-Static / Transponder",
      "Weight & Balance",
      "Planning / Production Control",
      "Reliability Program",
      "Tool Control",
      "Training Instructor",
      "Welding",
      "Machining",
    ],
  },
  {
    label: "Pilot & Flight Ops Currency",
    capabilities: [
      "Pilot (PIC)",
      "Instrument Rated Pilot",
      "Flight Instructor (CFI)",
    ],
  },
] as const;

export const ALL_KNOWN_CAPABILITIES: string[] = CAPABILITY_GROUPS.flatMap(
  (group) => group.capabilities as readonly string[]
);
