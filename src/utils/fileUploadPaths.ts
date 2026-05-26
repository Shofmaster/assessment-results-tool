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

/** MIME allowlist when the leaf name has no usable extension (some directory picks report odd `name` values). */
const ADMIN_KB_REFERENCE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Leaf filename for extension checks: last segment of the display path, then `File.name`.
 * Directory uploads sometimes expose the real path only via `webkitRelativePath` while `name` is empty or unhelpful.
 */
export function uploadLeafNameForAdminKbFilter(file: File): string {
  const normalized = fileDisplayPathForUpload(file).replace(/\\/g, '/').trim();
  const parts = normalized.split('/').filter((p) => p.length > 0);
  const fromPath = parts.length > 0 ? parts[parts.length - 1]! : '';
  const fallback = (file.name ?? '').trim();
  return fromPath || fallback;
}

export function filterAdminKbReferenceUploadFiles(files: File[]): { accepted: File[]; skipped: number } {
  const accepted = files.filter((f) => {
    const leaf = uploadLeafNameForAdminKbFilter(f);
    if (ADMIN_KB_REFERENCE_EXT.test(leaf)) return true;
    const mime = f.type?.trim();
    if (mime && mime !== 'application/octet-stream' && ADMIN_KB_REFERENCE_MIME.has(mime)) return true;
    return false;
  });
  return { accepted, skipped: files.length - accepted.length };
}

/** Company Library uploads: same as admin KB plus image scans (JPEG, PNG) for logbook scans. */
const COMPANY_LIBRARY_EXT = /\.(pdf|docx?|txt|jpe?g|png)$/i;

const COMPANY_LIBRARY_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
]);

export function filterCompanyLibraryUploadFiles(files: File[]): { accepted: File[]; skipped: number } {
  const accepted = files.filter((f) => {
    const leaf = uploadLeafNameForAdminKbFilter(f);
    if (COMPANY_LIBRARY_EXT.test(leaf)) return true;
    const mime = f.type?.trim();
    if (mime && mime !== 'application/octet-stream' && COMPANY_LIBRARY_MIME.has(mime)) return true;
    return false;
  });
  return { accepted, skipped: files.length - accepted.length };
}
