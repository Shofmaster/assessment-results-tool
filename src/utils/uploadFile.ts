import type { Id } from '../../convex/_generated/dataModel';

/** SHA-256 hex digest of file bytes (for content-hash deduplication). */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Upload a blob to Convex `_storage` and return the storage id.
 * Throws if the HTTP response is not OK or storageId is missing.
 */
export async function uploadFileToConvexStorage(
  file: Blob,
  contentType: string,
  generateUploadUrl: () => Promise<string>,
): Promise<Id<'_storage'>> {
  const uploadUrl = await generateUploadUrl();
  const uploadResult = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
    body: file,
  });
  if (!uploadResult.ok) {
    const body = await uploadResult.text().catch(() => '');
    throw new Error(
      `Storage upload failed (${uploadResult.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    );
  }
  const uploadJson = (await uploadResult.json()) as { storageId?: string };
  const storageId = uploadJson?.storageId;
  if (!storageId) {
    throw new Error('Storage upload did not return a storageId');
  }
  return storageId as Id<'_storage'>;
}

/** Best-effort delete of an orphaned storage blob. */
export async function deleteOrphanStorage(
  storageId: Id<'_storage'> | undefined,
  deleteStorage: (args: { storageId: Id<'_storage'> }) => Promise<unknown>,
): Promise<void> {
  if (!storageId) return;
  try {
    await deleteStorage({ storageId });
  } catch {
    /* best-effort */
  }
}
