/**
 * Aerospace quality / special process / security / safety management standards (profile tags).
 */

export const AS9100_FAMILY = [
  { id: "as9100d", label: "AS9100D — Quality management (aerospace)" },
  { id: "as9110", label: "AS9110 — Maintenance organizations (QMS)" },
  { id: "as9120", label: "AS9120 — Stockist distributors (QMS)" },
] as const;

export const NADCAP_PROCESSES = [
  { id: "ndt", label: "NDT (AC7114 family)" },
  { id: "heat_treat", label: "Heat treat" },
  { id: "welding", label: "Welding" },
  { id: "chemical_processing", label: "Chemical processing" },
  { id: "materials_testing", label: "Materials testing" },
  { id: "coatings", label: "Coatings" },
  { id: "composites", label: "Composites" },
  { id: "metallography", label: "Metallography / lab" },
] as const;

export const CMMC_LEVELS = [
  { id: "1", label: "CMMC Level 1 (FCI only)" },
  { id: "2", label: "CMMC Level 2" },
  { id: "3", label: "CMMC Level 3" },
] as const;

export const NASA_STD_LEVELS = [
  { id: "7919_1", label: "NASA-STD-7919.1 (applicable scope)" },
] as const;

export const ISBAO_LEVELS = [
  { id: "none", label: "None / not registered" },
  { id: "stage_1", label: "IS-BAO Stage 1" },
  { id: "stage_2", label: "IS-BAO Stage 2" },
  { id: "stage_3", label: "IS-BAO Stage 3" },
] as const;

export const ITAR_DFARS_FLAGS = [
  { id: "itar_registered", label: "ITAR registered / US person obligations" },
  { id: "dfars_compliant", label: "DFARS / defense contracting flow-down" },
] as const;
