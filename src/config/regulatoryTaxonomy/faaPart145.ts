/**
 * 14 CFR Part 145 — class ratings (§145.59), limited ratings (§145.61),
 * capability list authorized functions (§145.215), SAS peer groups.
 * Citations: 14 CFR §145.59, §145.61, §145.215; FAA Order 8900.1 Vol 2 Ch 3 (SAS peer groups).
 */

export type FaaRatingCategoryId =
  | "airframe"
  | "powerplant"
  | "propeller"
  | "radio"
  | "instrument"
  | "accessory";

export type FaaClassOption = { classNumber: number; label: string };

export const FAA_RATING_CATEGORIES: Array<{ id: FaaRatingCategoryId; label: string }> = [
  { id: "airframe", label: "Airframe" },
  { id: "powerplant", label: "Powerplant" },
  { id: "propeller", label: "Propeller" },
  { id: "radio", label: "Radio" },
  { id: "instrument", label: "Instrument" },
  { id: "accessory", label: "Accessory" },
];

/** §145.59 — class definitions (summary labels for UI). */
export const FAA_RATING_CLASSES: Record<FaaRatingCategoryId, FaaClassOption[]> = {
  airframe: [
    { classNumber: 1, label: "Class 1 — Composite / small aircraft (wood, fabric, tube & fabric)" },
    { classNumber: 2, label: "Class 2 — Composite (non-pressurized metal, etc.)" },
    { classNumber: 3, label: "Class 3 — Non-pressurized metal (≥12,500 lb MTOW per certificate)" },
    { classNumber: 4, label: "Class 4 — Pressurized" },
  ],
  powerplant: [
    { classNumber: 1, label: "Class 1 — Reciprocating engines of 400 hp or less" },
    { classNumber: 2, label: "Class 2 — Reciprocating engines of more than 400 hp" },
    { classNumber: 3, label: "Class 3 — Turbine" },
  ],
  propeller: [
    { classNumber: 1, label: "Class 1 — Fixed-pitch wood or metal propellers" },
    { classNumber: 2, label: "Class 2 — Other propellers" },
  ],
  radio: [
    { classNumber: 1, label: "Class 1 — Communication equipment" },
    { classNumber: 2, label: "Class 2 — Navigation equipment" },
    { classNumber: 3, label: "Class 3 — Radar equipment" },
  ],
  instrument: [
    { classNumber: 1, label: "Class 1 — Mechanical" },
    { classNumber: 2, label: "Class 2 — Electrical" },
    { classNumber: 3, label: "Class 3 — Gyroscopic" },
    { classNumber: 4, label: "Class 4 — Electronic" },
  ],
  accessory: [
    { classNumber: 1, label: "Class 1 — Mechanical" },
    { classNumber: 2, label: "Class 2 — Electrical" },
    { classNumber: 3, label: "Class 3 — Electronic" },
  ],
};

/** §145.61 — limited rating kinds for dropdowns (article / make-model / specialized). */
export const FAA_LIMITED_RATING_KINDS = [
  { id: "limited_airframe", label: "Limited — Airframe (make/model/article)" },
  { id: "limited_powerplant", label: "Limited — Powerplant (make/model/article)" },
  { id: "limited_propeller", label: "Limited — Propeller (make/model/article)" },
  { id: "limited_radio", label: "Limited — Radio (make/model/article)" },
  { id: "limited_instrument", label: "Limited — Instrument (make/model/article)" },
  { id: "limited_accessory", label: "Limited — Accessory (make/model/article)" },
  { id: "specialized_service", label: "Limited specialized service (e.g. NDT per spec)" },
] as const;

export type FaaLimitedRatingKindId = (typeof FAA_LIMITED_RATING_KINDS)[number]["id"];

/** §145.215 — typical authorized maintenance functions on capability list. */
export const FAA_AUTHORIZED_FUNCTIONS = [
  "Overhaul",
  "Repair",
  "Inspect",
  "Alteration",
  "Approved Return to Service",
  "Test & Inspection",
  "Calibrate",
] as const;

/** SAS / repair station surveillance peer groups (8900.1). */
export const FAA_PEER_GROUPS = [
  { id: "F", label: "Peer Group F — Domestic (within the United States)" },
  { id: "G", label: "Peer Group G — International, no BASA" },
  { id: "H", label: "Peer Group H — International, BASA / MIP" },
] as const;

export type FaaPeerGroupId = (typeof FAA_PEER_GROUPS)[number]["id"];
