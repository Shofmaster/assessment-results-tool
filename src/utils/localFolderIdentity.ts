/**
 * Identity hash for no-copy local folder refs — mirrors Drive's `gdrive:<fileId>`.
 * Path + size lets us register without reading bytes; byte hashing stays an
 * index-time concern when the folder index is built.
 *
 * Mtime is intentionally omitted: OneDrive / network shares often bump
 * timestamps without changing bytes, which used to create duplicate Convex rows.
 * Same-size in-place replacements are caught by Refresh search index.
 *
 * `lastModified` remains an optional unused parameter so older call sites
 * compile without churn.
 */
export function localIdentityHash(
  relativePath: string,
  size: number,
  _lastModified?: number,
): string {
  const path = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const sz = Number.isFinite(size) ? Math.max(0, Math.trunc(size)) : 0;
  return `local:${path}:${sz}`;
}
