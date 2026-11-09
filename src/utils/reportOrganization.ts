/**
 * The "Organization" line on a report cover and preview.
 *
 * The latest analysis records the company it was run for, so it wins when
 * present. Without one, the project's company is the organization; the project
 * name is only a last resort (a personal project with no company). Falling
 * straight back to the project name used to print e.g. "Test Project A" as the
 * organization on every report built before the first analysis.
 */
export function resolveReportOrganizationName(input: {
  analysisCompanyName?: string | null;
  companyName?: string | null;
  projectName?: string | null;
}): string | undefined {
  for (const candidate of [input.analysisCompanyName, input.companyName, input.projectName]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
