export * from "./faaPart145";
export * from "./faaOpSpecs";
export * from "./faaPart65";
export * from "./easaPart145";
export * from "./easaOther";
export * from "./qualityStandards";

/** Regulatory authority tag stored on ratings / capabilities / OpSpecs. */
export type RegulatoryAuthority = "faa" | "easa" | "other";

export function defaultAuthorityForLegacyRow(): RegulatoryAuthority {
  return "faa";
}
