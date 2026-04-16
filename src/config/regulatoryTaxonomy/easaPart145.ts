/**
 * EASA Part-145 — scope of approval categories (Form 3 matrix).
 * EU Regulation 1321/2014 Annex II (Part-145); AMC/GM to Part-145.
 */

export type EasaScopeGroup = "A" | "B" | "C" | "D";

export type EasaScopeEntry = {
  code: string;
  label: string;
  description: string;
  group: EasaScopeGroup;
};

export const EASA_SCOPE_CATEGORIES: EasaScopeEntry[] = [
  // Category A — Aircraft
  { group: "A", code: "A1", label: "A1", description: "Aeroplanes above 5,700 kg", },
  { group: "A", code: "A2", label: "A2", description: "Aeroplanes 5,700 kg and below", },
  { group: "A", code: "A3", label: "A3", description: "Helicopters", },
  { group: "A", code: "A4", label: "A4", description: "Aircraft other than A1, A2, A3", },
  // Category B — Engines / APU
  { group: "B", code: "B1", label: "B1", description: "Turbine engines / APUs (turbine)", },
  { group: "B", code: "B2", label: "B2", description: "Piston engines", },
  { group: "B", code: "B3", label: "B3", description: "APU (piston or other as approved)", },
  // Category C — Components (ATA-style groupings per EASA Form 3)
  { group: "C", code: "C1", label: "C1", description: "Air conditioning and pressurization", },
  { group: "C", code: "C2", label: "C2", description: "Auto flight", },
  { group: "C", code: "C3", label: "C3", description: "Communications and navigation", },
  { group: "C", code: "C4", label: "C4", description: "Doors, hatches and gates", },
  { group: "C", code: "C5", label: "C5", description: "Electrical power and lights", },
  { group: "C", code: "C6", label: "C6", description: "Equipment", },
  { group: "C", code: "C7", label: "C7", description: "Engine — components", },
  { group: "C", code: "C8", label: "C8", description: "Flight controls", },
  { group: "C", code: "C9", label: "C9", description: "Fuel", },
  { group: "C", code: "C10", label: "C10", description: "Helicopters — rotors", },
  { group: "C", code: "C11", label: "C11", description: "Helicopters — transmission", },
  { group: "C", code: "C12", label: "C12", description: "Hydraulic power", },
  { group: "C", code: "C13", label: "C13", description: "Indicating / recording systems", },
  { group: "C", code: "C14", label: "C14", description: "Landing gear", },
  { group: "C", code: "C15", label: "C15", description: "Oxygen", },
  { group: "C", code: "C16", label: "C16", description: "Propellers", },
  { group: "C", code: "C17", label: "C17", description: "Pneumatic / vacuum", },
  { group: "C", code: "C18", label: "C18", description: "Protection ice / rain / fire", },
  { group: "C", code: "C19", label: "C19", description: "Windows", },
  { group: "C", code: "C20", label: "C20", description: "Structural", },
  { group: "C", code: "C21", label: "C21", description: "Water ballast", },
  { group: "C", code: "C22", label: "C22", description: "Propulsion augmentation", },
  // Category D — Specialized services
  { group: "D", code: "D1", label: "D1", description: "Non-destructive testing (NDT)", },
];

export const EASA_FORM4_ROLES = [
  { id: "accountable_manager", label: "Accountable Manager" },
  { id: "maintenance_manager", label: "Maintenance Manager" },
  { id: "quality_manager", label: "Quality / Compliance Monitoring Manager" },
  { id: "safety_manager", label: "Safety Manager (if applicable)" },
  { id: "base_maintenance_manager", label: "Base maintenance manager (if delegated)" },
  { id: "line_maintenance_manager", label: "Line maintenance manager (if delegated)" },
] as const;

/** Part-145 MOE-style maintenance functions (align with org MOE wording). */
export const EASA_AUTHORIZED_FUNCTIONS = [
  "Maintenance",
  "Inspection",
  "Repair",
  "Overhaul",
  "Modification",
  "Release to service",
  "Test",
  "Troubleshooting",
] as const;
