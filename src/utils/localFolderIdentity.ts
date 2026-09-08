/**
 * Identity hash for no-copy local folder refs — mirrors Drive's `gdrive:<fileId>`.
 * Path + size + mtime lets us register without reading bytes; byte hashing stays
 * an index-time concern when the folder index is built.
 */
export function localIdentityHash(relativePath: string, size: number, lastModified: number): string {
  const path = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const mtime = Number.isFinite(lastModified) ? Math.trunc(lastModified) : 0;
  const sz = Number.isFinite(size) ? Math.max(0, Math.trunc(size)) : 0;
  return `local:${path}:${sz}:${mtime}`;
}
