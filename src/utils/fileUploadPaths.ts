/**
 * Stable display path for uploads (multi-file or folder picker).
 * When the user selects a directory, `webkitRelativePath` preserves nested names.
 */
export function fileDisplayPathForUpload(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel && rel.trim().length > 0) {
    return rel.replace(/\\/g, '/');
  }
  return file.name;
}

/** Admin KB + reference document uploads: PDF, Word, TXT, CSV, XLSX (folder inputs cannot enforce accept). */
const ADMIN_KB_REFERENCE_EXT = /\.(pdf|docx?|txt|csv|xlsx)$/i;

export function filterAdminKbReferenceUploadFiles(files: File[]): { accepted: File[]; skipped: number } {
  const accepted = files.filter((f) => ADMIN_KB_REFERENCE_EXT.test(f.name));
  return { accepted, skipped: files.length - accepted.length };
}
