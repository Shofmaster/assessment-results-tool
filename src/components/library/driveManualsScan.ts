/**
 * Drive manuals folder scan + classification pipeline (extracted verbatim from
 * CompanyLibrary.tsx).
 *
 * Picks Drive folders, enumerates them (metadata only — no downloads), then
 * classifies each file for Library filing: filename first (instant); where the
 * name gives no signal, a budgeted transient content peek (read-and-discard,
 * no OCR) so copyrighted manuals are never persisted just to sort them.
 * Returns the review-modal payload, or null when nothing was picked/found.
 */
import { toast } from 'sonner';
import { DocumentExtractor, resolvePeekKind, type PeekKind } from '../../services/documentExtractor';
import { parallelMap } from '../../services/dctIngestChunks';
import type { SortablePublicationType } from '../../services/documentTypeResolver';
import { classifyByName, classifyByContent, needsContentPeek } from '../../services/driveFileClassifier';
import type { DriveReviewItem } from '../DriveImportReviewModal';
import type { GoogleDriveFile } from '../../types/googleDrive';
import { getSharedDriveService } from '../../services/googleDrive';

type SharedDriveService = ReturnType<typeof getSharedDriveService>;

/** Concurrent Drive downloads during the pre-filing content-peek pass. */
const DRIVE_PEEK_CONCURRENCY = 6;
/** Text-like peeks (TXT/CSV/XML) only need the head of the file — ranged download size. */
const DRIVE_PEEK_TEXT_RANGE_BYTES = 256 * 1024;
/** PDF/DOCX peeks need the whole file; skip files bigger than this. */
const DRIVE_PEEK_MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Total bytes the peek pass may download per batch — bounds worst-case sort time on huge folders. */
const DRIVE_PEEK_TOTAL_BYTE_BUDGET = 512 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xml: 'application/xml',
  js: 'application/javascript',
};

/** Best-effort MIME from a filename, for files fetched without a kept Content-Type. */
export function guessMimeFromPath(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export type DriveScanResult = {
  items: DriveReviewItem[];
  driveIdByPath: Record<string, string>;
  driveSizeByPath: Record<string, number>;
};

export async function scanAndClassifyDriveFolders(
  service: SharedDriveService,
  fallbackType: SortablePublicationType,
): Promise<DriveScanResult | null> {
  const folders = await service.pickFolders();
  if (!folders.length) return null;

  // Enumerate each picked folder. When more than one is chosen, prefix every
  // relative path with that folder's name so files from different folders stay
  // distinct (and "Preserve folder structure" mirrors each tree under its root).
  const multiple = folders.length > 1;
  const toastId = toast.loading(
    multiple ? `Scanning ${folders.length} Drive folders…` : 'Scanning Drive folder…',
  );
  const driveEntries: Array<{ file: GoogleDriveFile; relativePath: string }> = [];
  try {
    for (const folder of folders) {
      const folderEntries = await service.enumerateFolder(folder.id);
      for (const entry of folderEntries) {
        driveEntries.push(
          multiple
            ? { file: entry.file, relativePath: `${folder.name}/${entry.relativePath}` }
            : entry,
        );
      }
    }
    if (!driveEntries.length) {
      toast.message(multiple ? 'No files found in those folders.' : 'No files found in that folder.', {
        id: toastId,
      });
      return null;
    }
  } catch (error) {
    // Without this, an enumeration failure leaves the loading toast up forever.
    toast.dismiss(toastId);
    throw error;
  }
  toast.dismiss(toastId);

  const extractor = new DocumentExtractor();
  const driveIdByPath: Record<string, string> = {};
  const driveSizeByPath: Record<string, number> = {};

  // Stage A — filename classification for every file.
  const sorted = driveEntries.map(({ file: meta, relativePath }) => {
    driveIdByPath[relativePath] = meta.id;
    driveSizeByPath[relativePath] = meta.sizeBytes;
    return {
      meta,
      relativePath,
      mimeType: meta.mimeType || guessMimeFromPath(meta.name),
      classification: classifyByName(relativePath, fallbackType),
    };
  });

  // Stage B — content peek, only where the name gave no signal AND the type is one
  // the peek parser can read. Text-like files fetch just the head via a ranged
  // download; PDF/DOCX parsers need complete bytes, so those are gated by a per-file
  // size cap plus a total download budget (smallest files first) to bound worst-case
  // time on huge folders. Files that miss the cut stay low-confidence for review.
  const candidates = sorted
    .map((item) => ({
      item,
      kind: needsContentPeek(item.classification)
        ? resolvePeekKind(item.meta.name, item.mimeType)
        : null,
    }))
    .filter((c): c is { item: (typeof sorted)[number]; kind: PeekKind } => c.kind !== null);
  const selected: typeof candidates = [];
  let budget = DRIVE_PEEK_TOTAL_BYTE_BUDGET;
  const bySizeAsc = [...candidates].sort((a, b) => a.item.meta.sizeBytes - b.item.meta.sizeBytes);
  for (const c of bySizeAsc) {
    const size = c.item.meta.sizeBytes;
    if (c.kind !== 'text' && (size <= 0 || size > DRIVE_PEEK_MAX_FILE_BYTES)) continue;
    const cost = c.kind === 'text' ? Math.min(size || DRIVE_PEEK_TEXT_RANGE_BYTES, DRIVE_PEEK_TEXT_RANGE_BYTES) : size;
    if (cost > budget) continue;
    budget -= cost;
    selected.push(c);
  }
  const selectedSet = new Set(selected);
  for (const c of candidates) {
    if (!selectedSet.has(c)) {
      c.item.classification = {
        ...c.item.classification,
        reason: 'Too large to content-check — needs review',
      };
    }
  }

  const fileCountLabel = `${driveEntries.length} file${driveEntries.length === 1 ? '' : 's'}`;
  const sortId = toast.loading(`Sorting ${fileCountLabel}…`);
  let peeked = 0;
  await parallelMap(selected, DRIVE_PEEK_CONCURRENCY, async ({ item, kind }) => {
    try {
      const buffer = await service.downloadFile(
        item.meta.id,
        kind === 'text' ? { maxBytes: DRIVE_PEEK_TEXT_RANGE_BYTES } : undefined,
      );
      const peek = await extractor.extractPeekText(buffer, item.meta.name, item.mimeType);
      item.classification = classifyByContent(peek, item.classification);
    } catch (err) {
      console.warn(`Content peek failed for ${item.relativePath}`, err);
    }
    peeked += 1;
    if (peeked === selected.length || peeked % 10 === 0) {
      toast.loading(`Sorting ${fileCountLabel}… content check ${peeked}/${selected.length}`, {
        id: sortId,
      });
    }
  });
  toast.dismiss(sortId);

  const items: DriveReviewItem[] = sorted.map((item) => ({
    relativePath: item.relativePath,
    fileName: item.meta.name,
    mimeType: item.mimeType,
    classification: item.classification,
  }));
  return { items, driveIdByPath, driveSizeByPath };
}
