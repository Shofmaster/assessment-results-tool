export function resolveEnabledList(
  platformValue: string[] | null | undefined,
  companyValue: string[] | null | undefined,
  userValue: string[] | null | undefined
): string[] | null {
  if (platformValue !== undefined) return platformValue;
  if (companyValue !== undefined) return companyValue;
  if (userValue !== undefined) return userValue;
  return null;
}

export function resolveLogbookEnabled(
  platformValue: boolean | undefined,
  companyValue: boolean | undefined,
  userValue: boolean | undefined
): boolean {
  if (platformValue !== undefined) return platformValue;
  if (companyValue !== undefined) return companyValue;
  return userValue === true;
}
