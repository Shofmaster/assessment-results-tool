/**
 * useDocumentUpload — the shared "create documents from local files" pipeline.
 *
 * Consolidates the flow previously duplicated (with drift) across
 * LibraryManager and GuidedAudit:
 *
 *   accept-filter → content-hash dedupe → store bytes in _storage →
 *   extract text (DocumentExtractor) → clamp/spill for Convex →
 *   documents.add → orphan-storage rollback on save failure.
 *
 * Two progress styles are supported:
 *  - aggregate toasts (`showToasts`, LibraryManager style): a single loading
 *    toast that counts up, then a summary toast;
 *  - a per-file callback (`onFileStatus`, GuidedAudit style) for custom UIs.
 *
 * Extraction warnings (could not extract / large doc spilled / truncated) are
 * always toasted — they matter regardless of which progress style is used.
 */
import { useCallback } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { DocumentExtractor } from '../services/documentExtractor';
import { getConvexErrorMessage } from '../utils/convexError';
import { prepareExtractedPayloadForConvex } from '../utils/documentExtractedText';
import { deleteOrphanStorage, sha256Hex, uploadFileToConvexStorage } from '../utils/uploadFile';
import { useAddDocument, useDeleteStorage, useGenerateUploadUrl } from './useConvexData';

export type UploadedFileStatus = 'extracting' | 'done' | 'duplicate' | 'error';

export type UploadDocumentsOptions = {
  projectId: string;
  /** documents.add category, e.g. 'entity' | 'uploaded' | 'regulatory' | 'sms'. */
  category: string;
  folderId?: string;
  /** Claude model used for OCR fallback during extraction. */
  model?: string;
  /** Document display name (and progress label); defaults to file.name. */
  buildDisplayName?: (file: File) => string;
  /** Stored `path` field; defaults to the display name. */
  buildPath?: (file: File) => string;
  /** Reject unsupported files before processing. Default: accept everything. */
  acceptFile?: (file: File) => boolean;
  /** Message when the accept filter rejects the whole selection. */
  emptyMessage?: string;
  /** Per-file status callback for custom progress UIs. */
  onFileStatus?: (index: number, file: File, status: UploadedFileStatus, error?: string) => void;
  /** Aggregate progress/summary toasts. Default true. */
  showToasts?: boolean;
  /** Progress-toast label, e.g. 'Import' / 'Folder import'. Default 'Upload'. */
  sourceLabel?: string;
  /** Noun for the summary toast, e.g. 'entity document'. Default 'document'. */
  noun?: string;
};

export type UploadSummary = {
  saved: number;
  failed: number;
  duplicates: number;
  accepted: number;
};

export function useDocumentUpload() {
  const convex = useConvex();
  const generateUploadUrl = useGenerateUploadUrl();
  const addDocument = useAddDocument();
  const deleteStorage = useDeleteStorage();

  return useCallback(
    async (fileList: File[] | FileList, opts: UploadDocumentsOptions): Promise<UploadSummary> => {
      const {
        projectId,
        category,
        folderId,
        model,
        buildDisplayName = (f: File) => f.name,
        buildPath,
        acceptFile,
        emptyMessage = 'No supported files in selection.',
        onFileStatus,
        showToasts = true,
        sourceLabel = 'Upload',
        noun = 'document',
      } = opts;

      const files = Array.from(fileList);
      const accepted = acceptFile ? files.filter(acceptFile) : files;
      const skipped = files.length - accepted.length;
      const summary: UploadSummary = { saved: 0, failed: 0, duplicates: 0, accepted: accepted.length };

      if (!accepted.length) {
        if (showToasts) toast.error(emptyMessage);
        return summary;
      }
      if (skipped > 0 && showToasts) {
        toast.message(`${skipped} file(s) skipped (unsupported type).`);
      }

      const extractor = new DocumentExtractor();
      const showProgress = showToasts && accepted.length > 3;
      const toastId = showProgress ? toast.loading(`${sourceLabel}: 0/${accepted.length}…`) : undefined;

      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        const displayName = buildDisplayName(file);
        const path = buildPath ? buildPath(file) : displayName;
        const shortLabel = displayName.includes('/') ? displayName.split('/').pop() ?? displayName : displayName;

        if (toastId && (i % 3 === 0 || i === accepted.length - 1)) {
          toast.loading(`${sourceLabel}: ${i + 1}/${accepted.length} — ${shortLabel}`, { id: toastId });
        }
        onFileStatus?.(i, file, 'extracting');

        let extractedText = '';
        let extractionMeta: { backend: string; confidence?: number } | undefined;
        let storageId: Id<'_storage'> | undefined;
        let contentHash: string | undefined;
        try {
          const buffer = await file.arrayBuffer();
          contentHash = await sha256Hex(buffer);
          const existingByHash = await convex.query(api.documents.findByContentHash, {
            projectId: projectId as Id<'projects'>,
            contentHash,
          });
          if (existingByHash) {
            summary.duplicates += 1;
            onFileStatus?.(i, file, 'duplicate');
            continue;
          }
          try {
            storageId = await uploadFileToConvexStorage(
              file,
              file.type || 'application/octet-stream',
              generateUploadUrl,
            );
          } catch (uploadErr: unknown) {
            // Best-effort: the document is still useful without stored bytes.
            console.warn(`Storage upload failed: ${shortLabel}`, uploadErr);
          }
          try {
            const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, model);
            extractedText = extracted.text;
            extractionMeta = extracted.metadata;
          } catch (err: any) {
            toast.warning(`Could not extract text from ${shortLabel}`, { description: err?.message });
          }
          const payload = await prepareExtractedPayloadForConvex(extractedText || '', generateUploadUrl);
          if (payload.extractedTextStorageId) {
            toast.message(`Large document: ${shortLabel}`, {
              description:
                'Full extracted text is stored in file storage; analyses will load the complete text automatically.',
            });
          } else if (payload.spillFailed) {
            toast.warning(`Could not upload full text for ${shortLabel}`, {
              description: 'Saved an inline excerpt only. Try again or split the file.',
            });
          } else if (payload.inlineTruncated) {
            toast.warning(`Stored a truncated copy of ${shortLabel}`, {
              description: 'Extracted text was clamped to fit the database row.',
            });
          }
          try {
            await addDocument({
              projectId: projectId as any,
              category,
              folderId: folderId as any,
              name: displayName,
              path,
              source: 'local',
              mimeType: file.type || undefined,
              size: file.size,
              storageId,
              extractedText: payload.extractedText,
              extractedTextStorageId: payload.extractedTextStorageId as any,
              extractionMeta,
              contentHash,
              extractedAt: new Date().toISOString(),
            } as any);
            summary.saved += 1;
            onFileStatus?.(i, file, 'done');
          } catch (err: unknown) {
            await deleteOrphanStorage(storageId, deleteStorage);
            if (payload.extractedTextStorageId) {
              await deleteOrphanStorage(payload.extractedTextStorageId as Id<'_storage'>, deleteStorage);
            }
            summary.failed += 1;
            const message = getConvexErrorMessage(err);
            onFileStatus?.(i, file, 'error', message);
            if (showToasts) toast.error(`Could not save ${shortLabel}`, { description: message });
          }
        } catch (err: unknown) {
          summary.failed += 1;
          const message = getConvexErrorMessage(err);
          onFileStatus?.(i, file, 'error', message);
          if (showToasts) toast.error(`Could not process ${shortLabel}`, { description: message });
        }
      }

      if (showToasts) {
        if (summary.saved > 0) {
          toast.success(
            `Added ${summary.saved} ${noun}${summary.saved !== 1 ? 's' : ''}${summary.failed > 0 ? ` (${summary.failed} failed)` : ''}`,
            toastId ? { id: toastId } : undefined,
          );
        } else if (accepted.length > 0) {
          toast.error(`No ${noun}s were saved`, {
            ...(toastId ? { id: toastId } : {}),
            description:
              summary.duplicates === accepted.length
                ? 'All selected files are already in this project.'
                : 'Fix the errors above or try again.',
          });
        }
      }

      return summary;
    },
    [convex, generateUploadUrl, addDocument, deleteStorage],
  );
}

/**
 * Open the browser file picker programmatically and resolve with the chosen
 * files (empty array if the user cancels). `directory` selects whole folders.
 */
export function pickLocalFiles(options: {
  accept?: string;
  multiple?: boolean;
  directory?: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.multiple) input.multiple = true;
    if (options.accept) input.accept = options.accept;
    if (options.directory) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
    input.onchange = (e) => {
      resolve(Array.from((e.target as HTMLInputElement).files || []));
    };
    // Cancelled pickers never fire onchange; resolve on window focus loss is
    // unreliable, so callers should treat a never-resolving promise as a no-op
    // (they only act on the resolved file list).
    input.click();
  });
}
