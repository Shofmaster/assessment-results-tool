/** Default legacy rows (no authority field) are treated as FAA. */
export function isFaaAuthority(authority: string | undefined | null): boolean {
  return !authority || authority === "faa";
}

export function isEasaAuthority(authority: string | undefined | null): boolean {
  return authority === "easa";
}

export function isOtherAuthority(authority: string | undefined | null): boolean {
  return authority === "other";
}
