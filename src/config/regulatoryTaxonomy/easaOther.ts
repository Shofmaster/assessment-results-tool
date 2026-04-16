/**
 * EASA continuing airworthiness / training / design — references for profile dropdowns.
 * Regulation (EU) No 1321/2014; Part-M, Part-CAMO, Part-CAO, Part-147; Part-21.
 */

export const EASA_PART_CAMO_OPTIONS = [
  { id: "camo_none", label: "No Part-CAMO approval" },
  { id: "camo_complex", label: "Part-CAMO — complex motor-powered aircraft" },
  { id: "camo_commercial_air_transport", label: "Part-CAMO — commercial air transport context" },
] as const;

export const EASA_PART_CAO_OPTIONS = [
  { id: "cao_none", label: "No Part-CAO approval" },
  { id: "cao_combined", label: "Part-CAO — combined CAO / maintenance org (non-complex)" },
] as const;

export const EASA_PART_M_SUBPART_F = [
  { id: "m_subpart_f_none", label: "No Subpart F maintenance organization" },
  { id: "m_subpart_f_active", label: "Part-M Subpart F — maintenance organization (non-145)" },
] as const;

export const EASA_PART_147_OPTIONS = [
  { id: "147_none", label: "No Part-147 approval" },
  { id: "147_type", label: "Part-147 — approved training organization (MTO)" },
] as const;

export const EASA_PART_21_OPTIONS = [
  { id: "21_none", label: "No Part-21 design/production" },
  { id: "21_doa", label: "Part-21 Subpart J — DOA (Design Organisation Approval)" },
  { id: "21_poa", label: "Part-21 Subpart G — POA (Production Organisation Approval)" },
  { id: "21_apdoa", label: "Part-21 — APDO / STC holder context (as applicable)" },
] as const;
