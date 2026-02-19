/**
 * Export assessments to the user's local drive as JSON files.
 */

export interface AssessmentExportItem {
  data: Record<string, unknown>;
  companyName?: string;
  importedAt?: string;
}

/** Trigger browser download of a single assessment as JSON (re-importable). */
export function downloadAssessmentJson(
  data: Record<string, unknown>,
  options?: { companyName?: string; filename?: string }
): void {
  const companyName = (options?.companyName ?? (data.companyName as string) ?? 'assessment').toString();
  const safeName = companyName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  const date = new Date().toISOString().split('T')[0];
  const filename = options?.filename ?? `assessment-${safeName}-${date}.json`;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Trigger browser download of all assessments as a single JSON file. */
export function downloadAssessmentsExport(items: AssessmentExportItem[]): void {
  const date = new Date().toISOString().split('T')[0];
  const filename = `assessments-export-${date}.json`;
  const payload = items.map(({ data, companyName, importedAt }) => ({
    data,
    companyName: companyName ?? (data.companyName as string),
    importedAt,
  }));
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
