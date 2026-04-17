import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useConvex } from 'convex/react';
import {
  useLogbookEntries,
  useLogbookDraftEntries,
  useAddLogbookDraftEntries,
  useRemoveLogbookDraftEntriesBySourceDocument,
  useImportSelectedLogbookDraftEntries,
  useAddDocument,
  useRemoveDocument,
  useGenerateUploadUrl,
  useDefaultClaudeModel,
  useDocuments,
  useUpdateDocumentExtractedText,
  useUpdateDocumentBinaryStorage,
  useRemoveSelectedLogbookDraftEntries,
  useAddLogbookEntries,
} from '../hooks/useConvexData';
import { api } from '../../convex/_generated/api';
import { parseLogbookText, userFacingParseError } from '../services/logbookEntryParser';
import type { LogbookParseDiagnostics } from '../services/logbookEntryParser';
import { DocumentExtractor, userFacingExtractionError } from '../services/documentExtractor';
import type { OcrExtractionResult } from '../services/documentExtractor';
import { parseCSV, autoDetectMapping, buildPreview, mapAllRows, detectCsvImportProvider, csvImportProviderLabel } from '../services/csvImporter';
import type { ParsedCSV, ColumnMapping, MappableField, ImportPreviewRow, CsvImportProvider } from '../services/csvImporter';
import {
  LOGBOOK_ENTRY_TYPE_ORDER,
  getLogbookEntryTypeLabel,
  type LogbookEntry,
} from '../types/logbook';
import {
  FiUpload,
  FiPlay,
  FiCheck,
  FiTrash2,
  FiPlus,
  FiChevronDown,
  FiChevronRight,
  FiAlertTriangle,
  FiRefreshCw,
  FiLoader,
  FiFile,
  FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';

/* ─── Logbook Library workflow (local UI state) ───────────────────── */

type LogbookDocWorkflowPhase =
  | 'queued'
  | 'uploading_storage'
  | 'extracting'
  | 'saving_document'
  | 'ready'
  | 'parsing'
  | 'failed_storage'
  | 'failed_extract'
  | 'failed_save'
  | 'failed_parse';

type PendingLogbookUploadRow = {
  clientId: string;
  fileName: string;
  fileSize: number;
  phase: LogbookDocWorkflowPhase;
  message?: string;
};

const WORKFLOW_PHASE_LABEL: Record<LogbookDocWorkflowPhase, string> = {
  queued: 'Queued',
  uploading_storage: 'Uploading stored copy…',
  extracting: 'Extracting text…',
  saving_document: 'Saving document…',
  ready: 'Ready',
  parsing: 'Parsing entries…',
  failed_storage: 'Stored copy failed',
  failed_extract: 'Text extraction failed',
  failed_save: 'Save failed',
  failed_parse: 'Parse failed',
};

function newClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ─── Logbooks Library Tab ───────────────────────────────────────────── */

export default function LogbooksLibraryTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const convex = useConvex();
  const logbookDocuments = (useDocuments(projectId, 'logbook') ?? []) as any[];
  const draftEntries = (useLogbookDraftEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const confirmedEntries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const model = useDefaultClaudeModel();
  const addDocument = useAddDocument();
  const updateDocumentExtractedText = useUpdateDocumentExtractedText();
  const updateDocumentBinaryStorage = useUpdateDocumentBinaryStorage();
  const removeDocument = useRemoveDocument();
  const generateUploadUrl = useGenerateUploadUrl();
  const addDraftEntries = useAddLogbookDraftEntries();
  const removeDraftEntriesBySource = useRemoveLogbookDraftEntriesBySourceDocument();
  const removeSelectedDraftEntries = useRemoveSelectedLogbookDraftEntries();
  const importSelectedDraftEntries = useImportSelectedLogbookDraftEntries();
  const addLogbookEntries = useAddLogbookEntries();

  const localFileByDocIdRef = useRef<Map<string, File>>(new Map());
  const localFileByClientIdRef = useRef<Map<string, File>>(new Map());
  const draftEntryRowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const jumpReviewCursorRef = useRef(-1);

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [parseDiagnosticsByDocument, setParseDiagnosticsByDocument] = useState<Record<string, LogbookParseDiagnostics | undefined>>({});
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [docSort, setDocSort] = useState<'date' | 'name'>('date');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'needs_review'>('all');
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [expandedSnippetIds, setExpandedSnippetIds] = useState<Set<string>>(new Set());
  const [pendingUploadRows, setPendingUploadRows] = useState<PendingLogbookUploadRow[]>([]);
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [docWorkflow, setDocWorkflow] = useState<Record<string, { phase: LogbookDocWorkflowPhase; message?: string }>>({});
  const [draftSort, setDraftSort] = useState<'date_asc' | 'confidence_asc' | 'needs_review_first'>('date_asc');
  const [openDraftDocIds, setOpenDraftDocIds] = useState<Set<string> | 'all'>('all');

  const showExtractionNotices = useCallback((docName: string, extraction: OcrExtractionResult) => {
    const notices = extraction.notices ?? [];
    for (const notice of notices) {
      if (notice.level === 'warning') {
        toast.warning(`OCR notice for ${docName}`, { description: notice.message });
      } else {
        toast.info(`OCR update for ${docName}`, { description: notice.message });
      }
    }
  }, []);

  const sortedDocuments = useMemo(() => {
    return [...logbookDocuments].sort((a, b) =>
      docSort === 'date'
        ? b.extractedAt.localeCompare(a.extractedAt)
        : a.name.localeCompare(b.name)
    );
  }, [logbookDocuments, docSort]);

  const draftsByDocument = useMemo(() => {
    const grouped = new Map<string, LogbookEntry[]>();
    for (const draft of draftEntries) {
      if (!draft.sourceDocumentId) continue;
      const list = grouped.get(draft.sourceDocumentId) ?? [];
      list.push(draft);
      grouped.set(draft.sourceDocumentId, list);
    }
    return grouped;
  }, [draftEntries]);

  const sortDraftList = useCallback((list: LogbookEntry[]) => {
    const copy = [...list];
    const byDate = (a: LogbookEntry, b: LogbookEntry) => {
      if (!a.entryDate && !b.entryDate) return 0;
      if (!a.entryDate) return 1;
      if (!b.entryDate) return -1;
      return a.entryDate.localeCompare(b.entryDate);
    };
    if (draftSort === 'date_asc') {
      return copy.sort(byDate);
    }
    if (draftSort === 'confidence_asc') {
      return copy.sort((a, b) => {
        const c = (a.confidence ?? 1) - (b.confidence ?? 1);
        if (c !== 0) return c;
        return byDate(a, b);
      });
    }
    return copy.sort((a, b) => {
      const ar = (a.confidence ?? 1) < 0.75 ? 0 : 1;
      const br = (b.confidence ?? 1) < 0.75 ? 0 : 1;
      if (ar !== br) return ar - br;
      return byDate(a, b);
    });
  }, [draftSort]);

  const groupedDraftsByDocument = useMemo(() => {
    return sortedDocuments
      .map((doc) => {
        const docDrafts = sortDraftList(draftsByDocument.get(doc._id) ?? []);
        return { doc, drafts: docDrafts };
      })
      .filter((group) => group.drafts.length > 0);
  }, [sortedDocuments, draftsByDocument, sortDraftList]);

  useEffect(() => {
    const validDraftIds = new Set(draftEntries.map((d) => d._id));
    setSelectedDraftIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validDraftIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [draftEntries]);

  useEffect(() => {
    const valid = new Set(logbookDocuments.map((d: { _id: string }) => d._id));
    setSelectedDocumentIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
    setDocWorkflow((prev) => {
      let changed = false;
      const out: typeof prev = { ...prev };
      for (const k of Object.keys(out)) {
        if (!valid.has(k)) {
          delete out[k];
          changed = true;
        }
      }
      return changed ? out : prev;
    });
  }, [logbookDocuments]);

  useEffect(() => {
    const validDocIds = new Set(groupedDraftsByDocument.map((g) => g.doc._id));
    setOpenDraftDocIds((prev) => {
      if (prev === 'all') return prev;
      const next = new Set([...prev].filter((id) => validDocIds.has(id)));
      return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
    });
  }, [groupedDraftsByDocument]);

  const setDocPhase = useCallback((documentId: string, phase: LogbookDocWorkflowPhase, message?: string) => {
    setDocWorkflow((prev) => ({ ...prev, [documentId]: { phase, message } }));
  }, []);

  const updatePendingRow = useCallback((clientId: string, patch: Partial<PendingLogbookUploadRow>) => {
    setPendingUploadRows((rows) => rows.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  }, []);

  const removePendingRow = useCallback((clientId: string) => {
    localFileByClientIdRef.current.delete(clientId);
    setPendingUploadRows((rows) => rows.filter((r) => r.clientId !== clientId));
  }, []);

  const processSingleUploadFile = useCallback(
    async (file: File, clientId: string) => {
      const extractor = new DocumentExtractor();
      updatePendingRow(clientId, { phase: 'uploading_storage', message: undefined });
      let storageId: string | undefined;
      let storageFailedMsg: string | undefined;
      try {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        const uploadJson = await uploadResult.json();
        storageId = uploadJson.storageId;
      } catch (storageErr: unknown) {
        storageFailedMsg = userFacingExtractionError(storageErr);
        toast.warning(`Stored copy upload failed for ${file.name}`, {
          description: `${storageFailedMsg} Text extraction will continue from your local file.`,
        });
      }

      updatePendingRow(clientId, { phase: 'extracting' });
      let extractedText = '';
      let extractionMeta: { backend: string; confidence?: number } | undefined;
      try {
        const buffer = await file.arrayBuffer();
        const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, model);
        extractedText = extracted.text ?? '';
        extractionMeta = extracted.metadata;
        showExtractionNotices(file.name, extracted);
      } catch (err: unknown) {
        const msg = userFacingExtractionError(err);
        updatePendingRow(clientId, { phase: 'failed_extract', message: msg });
        toast.warning(`Could not extract text from ${file.name}`, { description: msg });
      }

      if (!extractedText.trim()) {
        updatePendingRow(clientId, {
          phase: 'failed_extract',
          message: 'No readable text was produced. Try a clearer scan or different format.',
        });
      }

      updatePendingRow(clientId, { phase: 'saving_document' });
      try {
        const documentId = await addDocument({
          projectId: projectId as any,
          category: 'logbook',
          name: file.name,
          path: file.name,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          storageId: storageId as any,
          extractedText: extractedText || undefined,
          extractionMeta,
          extractedAt: new Date().toISOString(),
        } as any);
        const idStr = String(documentId);
        localFileByDocIdRef.current.set(idStr, file);
        removePendingRow(clientId);
        setDocWorkflow((prev) => ({
          ...prev,
          [idStr]: {
            phase: 'ready',
            message: storageFailedMsg
              ? 'Stored copy upload failed — text was saved from your local file. Use Retry storage if this tab is still open.'
              : undefined,
          },
        }));
        return true;
      } catch (err: unknown) {
        const msg = userFacingExtractionError(err);
        updatePendingRow(clientId, { phase: 'failed_save', message: msg });
        toast.error(`Could not save ${file.name}`, { description: msg });
        return false;
      }
    },
    [addDocument, generateUploadUrl, model, projectId, removePendingRow, showExtractionNotices, updatePendingRow],
  );

  const handleUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;
      const rows: PendingLogbookUploadRow[] = files.map((file) => {
        const clientId = newClientId();
        localFileByClientIdRef.current.set(clientId, file);
        return {
          clientId,
          fileName: file.name,
          fileSize: file.size,
          phase: 'queued' as const,
        };
      });
      setPendingUploadRows((prev) => [...rows, ...prev]);
      setUploadInProgress(true);
      let ok = 0;
      try {
        for (const row of rows) {
          if (await processSingleUploadFile(localFileByClientIdRef.current.get(row.clientId)!, row.clientId)) {
            ok += 1;
          }
        }
      } finally {
        setUploadInProgress(false);
      }
      if (ok > 0) {
        toast.success(`Added ${ok} logbook file${ok === 1 ? '' : 's'}`);
      }
    };
    input.click();
  }, [processSingleUploadFile]);

  const retryPendingUpload = useCallback(
    async (row: PendingLogbookUploadRow) => {
      const file = localFileByClientIdRef.current.get(row.clientId);
      if (!file) {
        toast.warning('Original file no longer available', {
          description: 'Upload the file again — pending progress cannot be retried after a full page refresh.',
        });
        return;
      }
      updatePendingRow(row.clientId, { phase: 'queued', message: undefined });
      setUploadInProgress(true);
      try {
        await processSingleUploadFile(file, row.clientId);
      } finally {
        setUploadInProgress(false);
      }
    },
    [processSingleUploadFile, updatePendingRow],
  );

  const retryStorageForDocument = useCallback(
    async (doc: { _id: string; name: string }) => {
      const file = localFileByDocIdRef.current.get(doc._id);
      if (!file) {
        toast.warning('Cannot retry stored copy', {
          description: 'The original file is no longer in memory. Upload the file again to attach a stored copy.',
        });
        return;
      }
      setDocPhase(doc._id, 'uploading_storage');
      try {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        const uploadJson = await uploadResult.json();
        await updateDocumentBinaryStorage({
          documentId: doc._id as any,
          storageId: uploadJson.storageId,
        } as any);
        setDocWorkflow((prev) => {
          const cur = prev[doc._id];
          return {
            ...prev,
            [doc._id]: { phase: 'ready', message: cur?.message?.includes('Stored copy') ? undefined : cur?.message },
          };
        });
        toast.success(`Stored copy attached for ${doc.name}`);
      } catch (err: unknown) {
        const msg = userFacingExtractionError(err);
        setDocPhase(doc._id, 'failed_storage', msg);
        toast.error(`Storage upload failed for ${doc.name}`, { description: msg });
      }
    },
    [generateUploadUrl, setDocPhase, updateDocumentBinaryStorage],
  );

  const fetchFileBuffer = useCallback(async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`File download failed (${response.status})`);
    }
    return response.arrayBuffer();
  }, []);

  const ensureDocumentText = useCallback(async (doc: any): Promise<string> => {
    const existingText = typeof doc?.extractedText === 'string' ? doc.extractedText.trim() : '';
    if (existingText) return doc.extractedText;

    const fileUrl = await convex.query((api as any).fileActions.getProjectDocumentFileUrl, {
      documentId: doc._id as any,
    });
    if (!fileUrl) {
      toast.warning(`"${doc.name}" has no extracted text and no stored file available for re-extraction.`);
      return '';
    }

    setParseProgress(`Extracting text for ${doc.name}...`);
    const fileBuffer = await fetchFileBuffer(fileUrl);
    const extractor = new DocumentExtractor();
    const extracted = await extractor.extractTextWithMetadata(
      fileBuffer,
      doc.name,
      doc.mimeType || 'application/octet-stream',
      model
    );
    showExtractionNotices(doc.name, extracted);

    const extractedText = (extracted.text ?? '').trim();
    if (!extractedText) {
      toast.warning(`No readable text found in "${doc.name}".`);
      return '';
    }

    await updateDocumentExtractedText({
      documentId: doc._id as any,
      extractedText,
      extractedAt: new Date().toISOString(),
      mimeType: doc.mimeType || undefined,
      size: doc.size || undefined,
      extractionMeta: extracted.metadata,
    } as any);

    return extractedText;
  }, [convex, fetchFileBuffer, model, showExtractionNotices, updateDocumentExtractedText]);

  const parseSelectedDocuments = useCallback(
    async (documentIds: string[]) => {
      const docsToParse = logbookDocuments.filter((d) => documentIds.includes(d._id));
      if (docsToParse.length === 0) {
        toast.warning('Select at least one logbook file to parse.');
        return;
      }
      setParsing(true);
      try {
        for (let i = 0; i < docsToParse.length; i++) {
          const doc = docsToParse[i];
          setDocPhase(doc._id, 'parsing');
          setParseProgress(`Parsing ${doc.name} (${i + 1}/${docsToParse.length})...`);
          try {
            if (doc?.extractionMeta?.backend === 'claude_vision' && typeof doc?.extractionMeta?.confidence !== 'number') {
              toast.info(`Parsing low-certainty OCR output for ${doc.name}`, {
                description:
                  'This file was extracted by vision OCR without confidence metrics; review parsed entries carefully.',
              });
            }
            let textToParse = typeof doc.extractedText === 'string' ? doc.extractedText : '';
            if (!textToParse.trim()) {
              textToParse = await ensureDocumentText(doc);
            }
            if (!textToParse.trim()) {
              setDocPhase(doc._id, 'failed_extract', 'No text to parse — extract or re-upload the file first.');
              toast.warning(`Skipping ${doc.name}`, { description: 'No readable text available for parsing.' });
              continue;
            }
            const result = await parseLogbookText(textToParse, {
              sourceDocumentId: doc._id,
              model,
              ocrConfidenceHint: typeof doc?.extractionMeta?.confidence === 'number' ? doc.extractionMeta.confidence : undefined,
              ocrBackendHint: typeof doc?.extractionMeta?.backend === 'string' ? doc.extractionMeta.backend : undefined,
              onProgress: (chunk, total) => setParseProgress(`Parsing ${doc.name}: chunk ${chunk}/${total}`),
              debug: true,
            });
            setParseDiagnosticsByDocument((prev) => ({ ...prev, [doc._id]: result.diagnostics }));
            if (result.diagnostics) {
              const chunkTable = result.diagnostics.chunks.map((chunk) => ({
                chunk: chunk.chunkIndex,
                strategy: chunk.strategy,
                chars: chunk.charLength,
                lines: chunk.lineCount,
                starts: chunk.estimatedStartDates,
                signatures: chunk.estimatedSignatureEnds,
                parsed: chunk.parsedEntriesCount,
              }));
              console.table(chunkTable);
              if (result.entries.length <= 1) {
                toast.warning(`Parser only found ${result.entries.length} entry in ${doc.name}.`, {
                  description: `Strategy: ${result.diagnostics.strategyUsed}. Segments: ${result.diagnostics.totalSegments}. Check diagnostics panel for chunk-level detail.`,
                });
              }
            }
            await removeDraftEntriesBySource({
              projectId: projectId as any,
              aircraftId: aircraftId as any,
              sourceDocumentId: doc._id as any,
            });
            if (result.entries.length === 0) {
              setDocPhase(doc._id, 'ready');
              continue;
            }
            const draftPayload = result.entries.map((e) => ({
              sourcePage: e.sourcePage,
              rawText: e.rawText,
              entryDate: e.entryDate,
              workPerformed: e.workPerformed,
              ataChapter: e.ataChapter,
              adReferences: e.adReferences,
              sbReferences: e.sbReferences,
              adSbReferences: e.adSbReferences,
              totalTimeAtEntry: e.totalTimeAtEntry,
              totalCyclesAtEntry: e.totalCyclesAtEntry,
              totalLandingsAtEntry: e.totalLandingsAtEntry,
              signerName: e.signerName,
              signerCertNumber: e.signerCertNumber,
              signerCertType: e.signerCertType,
              returnToServiceStatement: e.returnToServiceStatement,
              hasReturnToService: e.hasReturnToService,
              entryType: e.entryType,
              confidence: e.confidence,
              fieldConfidence: e.fieldConfidence,
            }));
            try {
              await addDraftEntries({
                projectId: projectId as any,
                aircraftId: aircraftId as any,
                sourceDocumentId: doc._id as any,
                entries: draftPayload,
              });
            } catch (err: any) {
              const message = String(err?.message ?? '');
              const hasLegacyValidatorMismatch =
                message.includes('extra field `sbReferences`') || message.includes('extra field `adReferences`');
              if (!hasLegacyValidatorMismatch) throw err;
              await addDraftEntries({
                projectId: projectId as any,
                aircraftId: aircraftId as any,
                sourceDocumentId: doc._id as any,
                entries: draftPayload.map(({ adReferences: _ad, sbReferences: _sb, ...entry }) => entry),
              });
            }
            setDocPhase(doc._id, 'ready');
          } catch (err: unknown) {
            const msg = userFacingParseError(err);
            setDocPhase(doc._id, 'failed_parse', msg);
            toast.error(`Parse failed for ${doc.name}`, { description: msg });
          }
        }
        toast.success('Parsed selected logbook files into candidate entries.');
      } finally {
        setParsing(false);
        setParseProgress('');
      }
    },
    [
      addDraftEntries,
      aircraftId,
      ensureDocumentText,
      logbookDocuments,
      model,
      projectId,
      removeDraftEntriesBySource,
      setDocPhase,
    ],
  );

  const retryExtractForDocument = useCallback(
    async (doc: any) => {
      setDocPhase(doc._id, 'extracting');
      try {
        const file = localFileByDocIdRef.current.get(doc._id);
        if (file) {
          const buffer = await file.arrayBuffer();
          const extractor = new DocumentExtractor();
          const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, model);
          showExtractionNotices(doc.name, extracted);
          const extractedText = (extracted.text ?? '').trim();
          if (!extractedText) {
            setDocPhase(doc._id, 'failed_extract', 'No readable text extracted.');
            toast.warning(`No readable text in ${doc.name}`);
            return;
          }
          await updateDocumentExtractedText({
            documentId: doc._id as any,
            extractedText,
            extractedAt: new Date().toISOString(),
            mimeType: doc.mimeType || file.type || undefined,
            size: doc.size ?? file.size,
            extractionMeta: extracted.metadata,
          } as any);
        } else {
          const text = await ensureDocumentText(doc);
          if (!text.trim()) {
            setDocPhase(doc._id, 'failed_extract', 'No extracted text and no stored file to re-read.');
            return;
          }
        }
        setDocPhase(doc._id, 'ready');
        toast.success(`Text updated for ${doc.name}`);
      } catch (err: unknown) {
        const msg = userFacingExtractionError(err);
        setDocPhase(doc._id, 'failed_extract', msg);
        toast.error(`Extraction failed for ${doc.name}`, { description: msg });
      }
    },
    [ensureDocumentText, model, setDocPhase, showExtractionNotices, updateDocumentExtractedText],
  );

  const retryParseForDocument = useCallback(
    async (docId: string) => {
      await parseSelectedDocuments([docId]);
    },
    [parseSelectedDocuments],
  );

  const retryAllFailed = useCallback(() => {
    for (const row of pendingUploadRows) {
      if (row.phase === 'failed_extract' || row.phase === 'failed_save') {
        void retryPendingUpload(row);
      }
    }
    for (const doc of logbookDocuments) {
      const w = docWorkflow[doc._id];
      if (!w) continue;
      if (w.phase === 'failed_storage') void retryStorageForDocument(doc);
      else if (w.phase === 'failed_extract') void retryExtractForDocument(doc);
      else if (w.phase === 'failed_parse') void retryParseForDocument(doc._id);
    }
  }, [
    docWorkflow,
    logbookDocuments,
    pendingUploadRows,
    retryExtractForDocument,
    retryPendingUpload,
    retryParseForDocument,
    retryStorageForDocument,
  ]);

  const jumpToNextNeedsReview = useCallback(() => {
    const pool = draftEntries
      .filter((d) => (d.confidence ?? 1) < 0.75)
      .sort((a, b) => {
        const ad = a.entryDate ?? '';
        const bd = b.entryDate ?? '';
        if (!ad && bd) return 1;
        if (ad && !bd) return -1;
        return ad.localeCompare(bd);
      });
    if (pool.length === 0) {
      toast.info('No staged entries flagged for review.');
      return;
    }
    jumpReviewCursorRef.current = (jumpReviewCursorRef.current + 1) % pool.length;
    const id = pool[jumpReviewCursorRef.current]._id;
    draftEntryRowRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [draftEntries]);

  const onDraftGroupToggle = useCallback(
    (docId: string, nextOpen: boolean) => {
      setOpenDraftDocIds((prev) => {
        if (prev === 'all') {
          if (nextOpen) return 'all';
          const allIds = groupedDraftsByDocument.map((g) => g.doc._id);
          return new Set(allIds.filter((id) => id !== docId));
        }
        const set = new Set(prev);
        if (nextOpen) set.add(docId);
        else set.delete(docId);
        return set;
      });
    },
    [groupedDraftsByDocument],
  );

  const hasWorkflowFailures =
    pendingUploadRows.some((r) => r.phase.startsWith('failed')) ||
    Object.values(docWorkflow).some((w) => w.phase.startsWith('failed'));

  const handleImportSelected = async () => {
    if (selectedDraftIds.size === 0) {
      toast.warning('Select at least one candidate entry to import.');
      return;
    }
    try {
      const result = await importSelectedDraftEntries({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        draftIds: Array.from(selectedDraftIds) as any,
      });
      setSelectedDraftIds(new Set());
      toast.success(`Imported ${result.imported} logbook entr${result.imported === 1 ? 'y' : 'ies'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to import selected entries');
    }
  };

  const handleDeleteSelectedDrafts = async () => {
    const count = selectedDraftIds.size;
    if (count === 0) {
      toast.warning('Select at least one entry to delete.');
      return;
    }
    if (!confirm(`Permanently delete ${count} staged entr${count === 1 ? 'y' : 'ies'}?`)) return;
    try {
      await removeSelectedDraftEntries({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        draftIds: Array.from(selectedDraftIds) as any,
      });
      setSelectedDraftIds(new Set());
      toast.success(`Deleted ${count} staged entr${count === 1 ? 'y' : 'ies'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entries');
    }
  };

  const handleDeleteSingleDraft = async (draftId: string) => {
    if (!confirm('Permanently delete this staged entry?')) return;
    try {
      await removeSelectedDraftEntries({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        draftIds: [draftId as any],
      });
      setSelectedDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draftId);
        return next;
      });
      toast.success('Staged entry deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry');
    }
  };

  const handleDeleteDocument = async (doc: any) => {
    if (!confirm(`Delete "${doc.name}" and its staged entries?`)) return;
    try {
      await removeDraftEntriesBySource({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        sourceDocumentId: doc._id as any,
      });
      await removeDocument({ documentId: doc._id as any });
      localFileByDocIdRef.current.delete(doc._id);
      setDocWorkflow((prev) => {
        const next = { ...prev };
        delete next[doc._id];
        return next;
      });
      setSelectedDocumentIds((prev) => {
        const next = new Set(prev);
        next.delete(doc._id);
        return next;
      });
      toast.success('Logbook file removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete logbook file');
    }
  };

  return (
    <div className="space-y-4 text-stone-800">
      <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploadInProgress}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800 disabled:opacity-50"
          >
            <FiUpload />
            {uploadInProgress ? 'Uploading...' : 'Upload Logbooks (PDF/CSV/Image)'}
          </button>
          <button
            type="button"
            onClick={() => parseSelectedDocuments(Array.from(selectedDocumentIds))}
            disabled={parsing || selectedDocumentIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-amber-600 text-white border border-amber-900/20 rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            <FiPlay />
            {parsing ? parseProgress || 'Parsing...' : `Parse Selected Files (${selectedDocumentIds.size})`}
          </button>
          <button
            type="button"
            onClick={handleImportSelected}
            disabled={selectedDraftIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-green-700 text-white border border-green-900/20 rounded-lg hover:bg-green-800 disabled:opacity-50"
          >
            <FiCheck />
            Import Selected Entries ({selectedDraftIds.size})
          </button>
          <button
            type="button"
            onClick={handleDeleteSelectedDrafts}
            disabled={selectedDraftIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-red-700 text-white border border-red-900/20 rounded-lg hover:bg-red-800 disabled:opacity-50"
          >
            <FiTrash2 />
            Delete Selected ({selectedDraftIds.size})
          </button>
          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-stone-700 text-white border border-stone-900/20 rounded-lg hover:bg-stone-800"
          >
            <FiPlus />
            Add Entry Manually
          </button>
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-900 bg-sky-50 border border-sky-300 rounded-lg hover:bg-sky-100"
            title="Import CSV/TSV exports from Bluetail, CAMP, Veryon, or any spreadsheet"
          >
            <FiUpload className="text-sky-700" />
            Bulk Import CSV
          </button>
          {hasWorkflowFailures && (
            <button
              type="button"
              onClick={() => retryAllFailed()}
              disabled={uploadInProgress || parsing}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-amber-950 bg-amber-200 border border-amber-400 rounded-lg hover:bg-amber-300 disabled:opacity-50"
            >
              <FiRefreshCw />
              Retry all failed steps
            </button>
          )}
        </div>
      </div>

      {pendingUploadRows.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-900 mb-2 font-['Source_Serif_4',serif]">Upload queue</h3>
          <ul className="space-y-2 text-xs">
            {pendingUploadRows.map((row) => (
              <li
                key={row.clientId}
                className="flex flex-wrap items-center gap-2 rounded border border-sky-100 bg-white px-3 py-2"
              >
                <FiLoader
                  className={`text-sky-600 flex-shrink-0 ${
                    ['uploading_storage', 'extracting', 'saving_document'].includes(row.phase) ? 'animate-spin' : ''
                  }`}
                />
                <span className="font-medium text-stone-800 truncate min-w-0 flex-1">{row.fileName}</span>
                <span
                  className={`rounded px-2 py-0.5 font-semibold ${
                    row.phase.startsWith('failed')
                      ? 'bg-red-100 text-red-800'
                      : row.phase === 'ready' || row.phase === 'queued'
                        ? 'bg-stone-100 text-stone-600'
                        : 'bg-sky-100 text-sky-900'
                  }`}
                >
                  {WORKFLOW_PHASE_LABEL[row.phase]}
                </span>
                {row.message && <span className="text-red-700 max-w-md truncate" title={row.message}>{row.message}</span>}
                {(row.phase === 'failed_extract' || row.phase === 'failed_save') && (
                  <button
                    type="button"
                    onClick={() => retryPendingUpload(row)}
                    disabled={uploadInProgress}
                    className="text-[11px] font-semibold text-sky-800 hover:underline disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePendingRow(row.clientId)}
                  disabled={uploadInProgress && (row.phase === 'extracting' || row.phase === 'uploading_storage' || row.phase === 'saving_document')}
                  className="text-[11px] text-stone-500 hover:text-red-700 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(parseDiagnosticsByDocument).length > 0 && (
        <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
          <details>
            <summary className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif] cursor-pointer select-none">
              Parsing Diagnostics
            </summary>
            <div className="mt-3 space-y-4">
              {logbookDocuments
                .filter((doc) => parseDiagnosticsByDocument[doc._id])
                .map((doc) => {
                  const diagnostics = parseDiagnosticsByDocument[doc._id];
                  if (!diagnostics) return null;
                  const totalParsed = diagnostics.chunks.reduce((s, c) => s + c.parsedEntriesCount, 0);
                  const zeroYieldCount = diagnostics.chunks.filter((c) => c.parsedEntriesCount === 0).length;
                  return (
                    <div key={doc._id} className="rounded border border-amber-200 px-3 py-2 text-xs text-stone-700">
                      <div className="font-semibold text-stone-800 mb-1">{doc.name}</div>
                      <div className="text-stone-600 mb-2 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>Strategy: <span className="font-mono text-sky-800">{diagnostics.strategyUsed}</span></span>
                        <span>Segments: <span className="font-mono">{diagnostics.totalSegments}</span></span>
                        <span>Total entries: <span className="font-mono font-semibold text-green-700">{totalParsed}</span></span>
                        {zeroYieldCount > 0 && (
                          <span className="text-amber-700 font-semibold">
                            ⚠ {zeroYieldCount} chunk{zeroYieldCount > 1 ? 's' : ''} yielded 0 entries
                          </span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-amber-50 text-stone-600 uppercase tracking-wide">
                              <th className="px-2 py-1 text-left font-semibold border border-amber-200">#</th>
                              <th className="px-2 py-1 text-left font-semibold border border-amber-200">Strategy</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Chars</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Lines</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Date Lines</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Entries</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnostics.chunks.map((chunk) => (
                              <tr key={chunk.chunkIndex} className={chunk.parsedEntriesCount === 0 ? 'bg-amber-50' : 'bg-white'}>
                                <td className="px-2 py-1 border border-amber-200 font-mono">{chunk.chunkIndex}</td>
                                <td className="px-2 py-1 border border-amber-200 font-mono">{chunk.strategy}</td>
                                <td className="px-2 py-1 border border-amber-200 text-right font-mono">{chunk.charLength.toLocaleString()}</td>
                                <td className="px-2 py-1 border border-amber-200 text-right font-mono">{chunk.lineCount}</td>
                                <td className="px-2 py-1 border border-amber-200 text-right font-mono">{chunk.estimatedStartDates}</td>
                                <td className={`px-2 py-1 border border-amber-200 text-right font-mono font-semibold ${chunk.parsedEntriesCount === 0 ? 'text-amber-700' : 'text-green-700'}`}>
                                  {chunk.parsedEntriesCount === 0 ? '⚠ 0' : chunk.parsedEntriesCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {zeroYieldCount > 0 && (
                        <div className="mt-2 text-amber-700 font-medium">
                          {zeroYieldCount} segment{zeroYieldCount > 1 ? 's' : ''} produced no entries — consider re-parsing or reviewing document quality.
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </details>
        </div>
      )}

      <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">
            Logbook Files ({logbookDocuments.length})
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[11px] text-stone-500">
              <span>Sort:</span>
              <button
                type="button"
                onClick={() => setDocSort('date')}
                className={`px-1.5 py-0.5 rounded transition-colors ${docSort === 'date' ? 'bg-sky-100 text-sky-800 font-medium' : 'hover:text-stone-800'}`}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setDocSort('name')}
                className={`px-1.5 py-0.5 rounded transition-colors ${docSort === 'name' ? 'bg-sky-100 text-sky-800 font-medium' : 'hover:text-stone-800'}`}
              >
                Name
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDocumentIds(new Set(logbookDocuments.map((d) => d._id)))}
              className="text-xs text-sky-800 hover:text-sky-950"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedDocumentIds(new Set())}
              className="text-xs text-stone-500 hover:text-stone-800"
            >
              Clear
            </button>
          </div>
        </div>
        {sortedDocuments.length === 0 && pendingUploadRows.length === 0 ? (
          <p className="text-xs text-stone-500">No logbook files uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedDocuments.map((doc) => {
              const selected = selectedDocumentIds.has(doc._id);
              const docDrafts = draftsByDocument.get(doc._id) ?? [];
              const draftCount = docDrafts.length;
              const wf = docWorkflow[doc._id];
              const avgConfidence = draftCount > 0
                ? docDrafts.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / draftCount
                : undefined;
              const lowCount = docDrafts.filter((d) => (d.confidence ?? 1) < 0.75).length;
              const confColor = avgConfidence === undefined ? 'bg-stone-300'
                : avgConfidence >= 0.8 ? 'bg-green-500'
                : avgConfidence >= 0.6 ? 'bg-amber-400'
                : 'bg-red-500';
              return (
                <div key={doc._id} className="rounded-lg border border-amber-200 px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        setSelectedDocumentIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(doc._id);
                          else next.delete(doc._id);
                          return next;
                        })
                      }
                      className="rounded border-amber-300"
                    />
                    <FiFile className="text-stone-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-stone-800 truncate">{doc.name}</div>
                      <div className="flex items-center gap-3 text-[11px] text-stone-500">
                        <span>{draftCount} staged entr{draftCount === 1 ? 'y' : 'ies'}</span>
                        {doc?.extractionMeta?.backend && (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-700">
                            OCR: {doc.extractionMeta.backend}
                            {typeof doc?.extractionMeta?.confidence === 'number'
                              ? ` (${Math.round(doc.extractionMeta.confidence * 100)}%)`
                              : ''}
                          </span>
                        )}
                        {!doc?.extractedText && (
                          <span className="text-amber-700 font-medium">No extracted text yet</span>
                        )}
                        {lowCount > 0 && (
                          <span className="text-amber-700 font-medium">{lowCount} need review</span>
                        )}
                      </div>
                    </div>
                    {/* Document quality score */}
                    {avgConfidence !== undefined && (
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[10px] text-stone-500 mb-0.5">Doc quality</div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                            <div className={`h-full rounded-full ${confColor}`} style={{ width: `${Math.round(avgConfidence * 100)}%` }} />
                          </div>
                          <span className={`text-[11px] font-bold tabular-nums ${avgConfidence >= 0.8 ? 'text-green-700' : avgConfidence >= 0.6 ? 'text-amber-700' : 'text-red-700'}`}>
                            {Math.round(avgConfidence * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => parseSelectedDocuments([doc._id])}
                      disabled={parsing || docWorkflow[doc._id]?.phase === 'parsing'}
                      className="px-2 py-1 text-xs text-amber-900 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 disabled:opacity-50"
                    >
                      Parse
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc)}
                      className="p-1.5 text-stone-500 hover:text-red-700"
                      title="Delete file"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                  {wf && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-amber-100 pt-2 text-[10px]">
                      {wf.phase !== 'ready' && (
                        <span
                          className={`rounded px-2 py-0.5 font-semibold ${
                            wf.phase.startsWith('failed') ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-900'
                          }`}
                        >
                          {WORKFLOW_PHASE_LABEL[wf.phase]}
                        </span>
                      )}
                      {wf.message && (
                        <span className="text-stone-600 max-w-full truncate" title={wf.message}>
                          {wf.message}
                        </span>
                      )}
                      {wf.phase === 'failed_storage' && (
                        <button
                          type="button"
                          onClick={() => retryStorageForDocument(doc)}
                          disabled={uploadInProgress}
                          className="font-semibold text-sky-800 hover:underline disabled:opacity-50"
                        >
                          Retry storage
                        </button>
                      )}
                      {wf.phase === 'failed_extract' && (
                        <button
                          type="button"
                          onClick={() => retryExtractForDocument(doc)}
                          disabled={parsing}
                          className="font-semibold text-sky-800 hover:underline disabled:opacity-50"
                        >
                          Retry extraction
                        </button>
                      )}
                      {wf.phase === 'failed_parse' && (
                        <button
                          type="button"
                          onClick={() => retryParseForDocument(doc._id)}
                          disabled={parsing}
                          className="font-semibold text-sky-800 hover:underline disabled:opacity-50"
                        >
                          Retry parse
                        </button>
                      )}
                      {wf.phase === 'ready' && wf.message?.includes('Stored copy') && (
                        <button
                          type="button"
                          onClick={() => retryStorageForDocument(doc)}
                          disabled={uploadInProgress}
                          className="font-semibold text-sky-800 hover:underline disabled:opacity-50"
                        >
                          Retry storage
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm relative">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">
            Staged Candidate Entries ({draftEntries.length})
          </h3>
          {draftEntries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <div className="flex items-center gap-1 text-stone-500 mr-1">
                <span>Sort:</span>
                <button
                  type="button"
                  className={`px-1.5 py-0.5 rounded ${draftSort === 'date_asc' ? 'bg-sky-100 text-sky-900 font-medium' : 'hover:text-stone-900'}`}
                  onClick={() => setDraftSort('date_asc')}
                >
                  Date
                </button>
                <button
                  type="button"
                  className={`px-1.5 py-0.5 rounded ${draftSort === 'confidence_asc' ? 'bg-sky-100 text-sky-900 font-medium' : 'hover:text-stone-900'}`}
                  onClick={() => setDraftSort('confidence_asc')}
                >
                  Confidence
                </button>
                <button
                  type="button"
                  className={`px-1.5 py-0.5 rounded ${draftSort === 'needs_review_first' ? 'bg-sky-100 text-sky-900 font-medium' : 'hover:text-stone-900'}`}
                  onClick={() => setDraftSort('needs_review_first')}
                >
                  Review first
                </button>
              </div>
              <button
                type="button"
                className="text-stone-600 hover:text-stone-900"
                onClick={() => setOpenDraftDocIds('all')}
              >
                Expand all
              </button>
              <button
                type="button"
                className="text-stone-600 hover:text-stone-900"
                onClick={() => setOpenDraftDocIds(new Set())}
              >
                Collapse all
              </button>
              {(() => {
                const needsReviewCount = draftEntries.filter((d) => (d.confidence ?? 1) < 0.75).length;
                return needsReviewCount > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setReviewFilter((prev) => (prev === 'needs_review' ? 'all' : 'needs_review'))}
                      className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                        reviewFilter === 'needs_review'
                          ? 'bg-amber-600 text-white border-amber-800'
                          : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                      }`}
                    >
                      <FiAlertTriangle className="text-xs" />
                      {needsReviewCount} Need Review
                    </button>
                    <button
                      type="button"
                      onClick={jumpToNextNeedsReview}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                    >
                      <FiChevronDown className="text-xs rotate-[-90deg]" />
                      Next need review
                    </button>
                  </>
                ) : null;
              })()}
              <button
                type="button"
                onClick={() => {
                  const visible =
                    reviewFilter === 'needs_review'
                      ? draftEntries.filter((d) => (d.confidence ?? 1) < 0.75)
                      : draftEntries;
                  setSelectedDraftIds(new Set(visible.map((d) => d._id)));
                }}
                className="text-sky-800 hover:text-sky-950"
              >
                {reviewFilter === 'needs_review' ? 'Select all visible' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedDraftIds(new Set())}
                className="text-stone-500 hover:text-stone-800"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        {selectedDraftIds.size > 0 && (
          <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-[#f4fff4] px-3 py-2 shadow-sm">
            <span className="text-xs font-semibold text-stone-700">{selectedDraftIds.size} selected</span>
            <button
              type="button"
              onClick={handleImportSelected}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-700 text-white rounded hover:bg-green-800"
            >
              <FiCheck /> Import
            </button>
            <button
              type="button"
              onClick={handleDeleteSelectedDrafts}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-700 text-white rounded hover:bg-red-800"
            >
              <FiTrash2 /> Delete
            </button>
          </div>
        )}
        {draftEntries.length === 0 ? (
          <p className="text-xs text-stone-500">Parse uploaded files to stage entries for selection.</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {groupedDraftsByDocument.map(({ doc, drafts }) => {
              const visibleDrafts =
                reviewFilter === 'needs_review'
                  ? drafts.filter((d) => (d.confidence ?? 1) < 0.75)
                  : drafts;
              if (visibleDrafts.length === 0) return null;
              const allSelected = visibleDrafts.every((d) => selectedDraftIds.has(d._id));
              const someSelected = visibleDrafts.some((d) => selectedDraftIds.has(d._id));
              const docOpen = openDraftDocIds === 'all' || openDraftDocIds.has(doc._id);
              return (
                <details
                  key={doc._id}
                  open={docOpen}
                  onToggle={(e) => onDraftGroupToggle(doc._id, e.currentTarget.open)}
                  className="rounded-lg border border-amber-200 overflow-hidden"
                >
                  <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-amber-50 hover:bg-amber-100/70 select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={(e) => {
                        setSelectedDraftIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) visibleDrafts.forEach((d) => next.add(d._id));
                          else visibleDrafts.forEach((d) => next.delete(d._id));
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-amber-300 flex-shrink-0"
                    />
                    <FiFile className="text-stone-500 flex-shrink-0 text-[11px]" />
                    <span className="text-xs font-medium text-stone-800 truncate flex-1 min-w-0">{doc.name}</span>
                    <span className="text-[11px] text-stone-500 flex-shrink-0 ml-auto">
                      {visibleDrafts.filter((d) => selectedDraftIds.has(d._id)).length}/{visibleDrafts.length} selected
                      {reviewFilter === 'needs_review'
                        ? ' · needs review'
                        : draftSort === 'confidence_asc'
                          ? ' · confidence'
                          : draftSort === 'needs_review_first'
                            ? ' · review first'
                            : ' · date'}
                    </span>
                  </summary>
                  <div className="divide-y divide-amber-100">
                    {visibleDrafts.map((entry) => {
                      const selected = selectedDraftIds.has(entry._id);
                      const conf = entry.confidence ?? undefined;
                      const confPct = conf !== undefined ? Math.round(conf * 100) : undefined;
                      const confColor = conf === undefined ? 'text-stone-400'
                        : conf >= 0.8 ? 'text-green-700'
                        : conf >= 0.6 ? 'text-amber-700'
                        : 'text-red-700';
                      const confBarColor = conf === undefined ? 'bg-stone-300'
                        : conf >= 0.8 ? 'bg-green-500'
                        : conf >= 0.6 ? 'bg-amber-400'
                        : 'bg-red-500';
                      const isExpanded = expandedDraftId === entry._id;
                      const fieldConf = entry.fieldConfidence as Record<string, number> | undefined;
                      const FIELD_LABELS: Record<string, string> = {
                        entryDate: 'Date', workPerformed: 'Work Performed', ataChapter: 'ATA Chapter',
                        signerName: 'Signer Name', signerCertNumber: 'Cert #', signerCertType: 'Cert Type',
                        totalTimeAtEntry: 'Total Time', totalCyclesAtEntry: 'Cycles', totalLandingsAtEntry: 'Landings',
                        returnToServiceStatement: 'RTS Statement', hasReturnToService: 'RTS', entryType: 'Entry Type',
                        regulatoryBasis: 'Reg. Basis', inspectionType: 'Inspection Type',
                      };
                      return (
                        <div
                          key={entry._id}
                          ref={(el) => {
                            draftEntryRowRefs.current.set(entry._id, el);
                          }}
                          className={`px-3 py-2 hover:bg-amber-50/50 ${conf !== undefined && conf < 0.75 ? 'border-l-2 border-amber-400' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) =>
                                setSelectedDraftIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(entry._id);
                                  else next.delete(entry._id);
                                  return next;
                                })
                              }
                              className="mt-1 rounded border-amber-300 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-stone-700">{entry.entryDate ?? 'No date'}</span>
                                {entry.entryType && (
                                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-100 text-sky-900 border border-sky-200">
                                    {getLogbookEntryTypeLabel(entry.entryType)}
                                  </span>
                                )}
                                {/* Confidence badge */}
                                {confPct !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDraftId(isExpanded ? null : entry._id)}
                                    title="Click to see field-level confidence"
                                    className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                                      conf! < 0.6 ? 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                                      : conf! < 0.75 ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                      : 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
                                    }`}
                                  >
                                    <div className="w-8 h-1 rounded-full bg-stone-200 overflow-hidden">
                                      <div className={`h-full rounded-full ${confBarColor}`} style={{ width: `${confPct}%` }} />
                                    </div>
                                    <span className={`font-mono font-bold ${confColor}`}>{confPct}%</span>
                                    {isExpanded ? <FiChevronDown className="text-[9px]" /> : <FiChevronRight className="text-[9px]" />}
                                  </button>
                                )}
                              </div>
                              {expandedSnippetIds.has(entry._id) ? (
                                <p className="text-xs text-stone-600 mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">
                                  {entry.workPerformed ?? entry.rawText}
                                </p>
                              ) : (
                                <p className="text-xs text-stone-600 mt-1 line-clamp-2">
                                  {entry.workPerformed ?? entry.rawText.slice(0, 160)}
                                </p>
                              )}
                              <button
                                type="button"
                                className="mt-0.5 text-[10px] font-semibold text-sky-800 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSnippetIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(entry._id)) next.delete(entry._id);
                                    else next.add(entry._id);
                                    return next;
                                  });
                                }}
                              >
                                {expandedSnippetIds.has(entry._id) ? 'Show less' : 'Show full text'}
                              </button>
                              {/* Field confidence heatmap */}
                              {isExpanded && fieldConf && Object.keys(fieldConf).length > 0 && (
                                <div className="mt-2 rounded border border-amber-200 bg-[#fffcf5] p-2 space-y-1">
                                  <div className="text-[10px] font-semibold text-stone-600 uppercase tracking-wide mb-1.5">Field Confidence</div>
                                  {Object.entries(fieldConf)
                                    .sort(([, a], [, b]) => a - b)
                                    .map(([field, fc]) => {
                                      const pct = Math.round(fc * 100);
                                      const barColor = fc >= 0.8 ? 'bg-green-500' : fc >= 0.6 ? 'bg-amber-400' : 'bg-red-500';
                                      const textColor = fc >= 0.8 ? 'text-green-700' : fc >= 0.6 ? 'text-amber-700' : 'text-red-700';
                                      return (
                                        <div key={field} className="flex items-center gap-2">
                                          <span className="text-[10px] text-stone-500 w-28 flex-shrink-0 truncate">
                                            {FIELD_LABELS[field] ?? field}
                                          </span>
                                          <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className={`text-[10px] font-mono font-bold w-8 text-right tabular-nums ${textColor}`}>{pct}%</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                              {isExpanded && (!fieldConf || Object.keys(fieldConf).length === 0) && (
                                <div className="mt-2 text-[10px] text-stone-400 italic">No per-field confidence data available for this entry.</div>
                              )}
                            </div>
                            <button
                              type="button"
                              title="Delete staged entry"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSingleDraft(entry._id); }}
                              className="flex-shrink-0 p-1 text-stone-400 hover:text-red-600 rounded self-start mt-0.5"
                            >
                              <FiTrash2 className="text-xs" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {showManualEntry && (
        <AddManualEntryModal
          projectId={projectId}
          aircraftId={aircraftId}
          allEntries={confirmedEntries}
          onAdd={addLogbookEntries}
          onClose={() => setShowManualEntry(false)}
        />
      )}
      {showBulkImport && (
        <BulkImportModal
          projectId={projectId}
          aircraftId={aircraftId}
          onAdd={addLogbookEntries}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </div>
  );
}

/* ─── Bulk CSV Import Modal ──────────────────────────────────────────── */

const FIELD_LABELS: Record<MappableField, string> = {
  entryDate: 'Entry Date',
  workPerformed: 'Work Performed',
  ataChapter: 'ATA Chapter',
  totalTimeAtEntry: 'Total Time (hrs)',
  totalCyclesAtEntry: 'Cycles',
  totalLandingsAtEntry: 'Landings',
  signerName: 'Signer Name',
  signerCertNumber: 'Cert Number',
  signerCertType: 'Cert Type',
  entryType: 'Entry Type',
  adReferences: 'AD References',
  sbReferences: 'SB References',
  returnToServiceStatement: 'RTS Statement',
};

const ALL_MAPPABLE_FIELDS = Object.keys(FIELD_LABELS) as MappableField[];

function BulkImportModal({
  projectId,
  aircraftId,
  onAdd,
  onClose,
}: {
  projectId: string;
  aircraftId: string;
  onAdd: (args: any) => Promise<any>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [provider, setProvider] = useState<CsvImportProvider>('generic');
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) { toast.error('Could not parse CSV — check the file format.'); return; }
      const detectedProvider = detectCsvImportProvider(parsed.headers);
      const detected = autoDetectMapping(parsed.headers, detectedProvider);
      const prev = buildPreview(parsed, detected, aircraftId);
      setCsv(parsed);
      setProvider(detectedProvider);
      setMapping(detected);
      setPreview(prev);
      setStep('map');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!csv || !mapping) return;
    setImporting(true);
    try {
      const entries = mapAllRows(csv, mapping, aircraftId);
      if (entries.length === 0) { toast.error('No valid rows to import.'); return; }
      // Batch in chunks of 100
      let imported = 0;
      let errors = 0;
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        try {
          await onAdd({ projectId: projectId as any, entries: chunk as any });
          imported += chunk.length;
        } catch {
          errors += chunk.length;
        }
      }
      setImportResult({ imported, errors });
      toast.success(`Imported ${imported} entr${imported === 1 ? 'y' : 'ies'} from ${fileName}`);
      if (errors === 0) setTimeout(onClose, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const inputCls = 'w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-400';

  const mappedCount = mapping ? Object.values(mapping).filter(Boolean).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-[#fffdf7] border border-amber-300 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-stone-800">
          <FiX className="text-xl" />
        </button>
        <h2 className="text-lg font-semibold text-stone-900 font-['Source_Serif_4',serif] mb-1">
          Bulk Import from CSV
        </h2>
        <p className="text-xs text-stone-500 mb-4">
          Import logbook exports from Bluetail, CAMP, Veryon, or any CSV/TSV spreadsheet.
        </p>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-amber-300 rounded-xl bg-amber-50/40 hover:bg-amber-50 transition-colors p-10 text-center cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <FiUpload className="text-3xl mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-semibold text-stone-700 mb-1">Drop your CSV or TSV file here</p>
            <p className="text-xs text-stone-500">or click to browse — comma, tab, semicolon, and pipe delimiters supported</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* Step 2: Column Mapping + Preview */}
        {step === 'map' && csv && mapping && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm">
              <FiFile className="text-green-700 flex-shrink-0" />
              <span className="font-medium text-green-900">{fileName}</span>
              <span className="text-green-700 ml-auto">
                {csv.rows.length} rows · {csv.headers.length} columns · delimiter: {csv.delimiter === '\t' ? 'TAB' : `"${csv.delimiter}"`} · preset: {csvImportProviderLabel(provider)}
              </span>
            </div>

            {/* Column mapping */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide">
                  Column Mapping
                </p>
                <span className="text-[10px] text-stone-500">{mappedCount} of {ALL_MAPPABLE_FIELDS.length} fields mapped</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {ALL_MAPPABLE_FIELDS.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <label className="text-[11px] text-stone-600 w-32 flex-shrink-0">{FIELD_LABELS[field]}</label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        const newMapping = { ...mapping, [field]: val };
                        setMapping(newMapping);
                        setPreview(buildPreview(csv, newMapping, aircraftId));
                      }}
                      className={inputCls}
                    >
                      <option value="">— not mapped —</option>
                      {csv.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-2">
                  Preview (first {preview.length} rows)
                </p>
                <div className="overflow-x-auto rounded-lg border border-amber-300">
                  <table className="w-full text-[11px]">
                    <thead className="bg-amber-50 border-b border-amber-200">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">#</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">Date</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium w-72">Work Performed</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">ATA</th>
                        <th className="px-2 py-1.5 text-right text-stone-600 font-medium">TT</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">Signer</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">⚠</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row) => (
                        <tr key={row.rowNum} className="border-b border-amber-100 hover:bg-amber-50/40">
                          <td className="px-2 py-1.5 text-stone-400 tabular-nums">{row.rowNum}</td>
                          <td className="px-2 py-1.5 font-mono text-stone-700">{row.mapped.entryDate ?? '—'}</td>
                          <td className="px-2 py-1.5 text-stone-800 max-w-[280px] truncate font-['Source_Serif_4',serif]">{row.mapped.workPerformed ?? '—'}</td>
                          <td className="px-2 py-1.5 text-stone-600">{row.mapped.ataChapter ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-stone-600">
                            {row.mapped.totalTimeAtEntry !== undefined ? row.mapped.totalTimeAtEntry.toFixed(1) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-stone-600 truncate max-w-[100px]">{row.mapped.signerName ?? '—'}</td>
                          <td className="px-2 py-1.5">
                            {row.warnings.length > 0 && (
                              <span
                                className="text-amber-600 cursor-help"
                                title={row.warnings.join('\n')}
                              >
                                <FiAlertTriangle className="inline" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csv.rows.length > preview.length && (
                  <p className="text-[10px] text-stone-400 mt-1">
                    … and {csv.rows.length - preview.length} more rows
                  </p>
                )}
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className={`px-4 py-3 rounded-lg border text-sm font-medium ${importResult.errors === 0 ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
                ✓ Imported {importResult.imported} entries
                {importResult.errors > 0 && ` · ${importResult.errors} failed`}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-between items-center pt-2 border-t border-amber-200">
              <button
                type="button"
                onClick={() => { setCsv(null); setMapping(null); setProvider('generic'); setStep('upload'); setImportResult(null); }}
                className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1"
              >
                ← Use a different file
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-amber-300 text-stone-700 hover:bg-amber-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || mappedCount === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 disabled:opacity-50"
                >
                  <FiUpload />
                  {importing ? `Importing…` : `Import ${csv.rows.length} rows`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Add Manual Entry Modal — Smart Assist Helpers ─────────────────── */

const ATA_KEYWORDS: Array<{ keywords: string[]; chapter: string; label: string }> = [
  { keywords: ['oil', 'lube', 'lubrication'], chapter: '79', label: 'Oil System' },
  { keywords: ['fuel', 'injector', 'carb', 'carburetor', 'fuel pump', 'gascolator'], chapter: '28', label: 'Fuel' },
  { keywords: ['landing gear', 'nose gear', 'main gear', 'brake', 'tire', 'wheel', 'strut', 'oleo'], chapter: '32', label: 'Landing Gear' },
  { keywords: ['engine', 'cylinder', 'piston', 'crankshaft', 'camshaft', 'valve', 'compression'], chapter: '72', label: 'Engine' },
  { keywords: ['propeller', 'prop', 'spinner', 'prop hub'], chapter: '61', label: 'Propeller' },
  { keywords: ['electrical', 'battery', 'alternator', 'generator', 'wiring', 'circuit breaker', 'relay'], chapter: '24', label: 'Electrical' },
  { keywords: ['radio', 'comm', 'gps', 'transponder', 'ads-b', 'adsb', 'elt', 'avionics'], chapter: '34', label: 'Navigation/Avionics' },
  { keywords: ['exhaust', 'muffler', 'manifold', 'heat muff'], chapter: '78', label: 'Exhaust' },
  { keywords: ['ignition', 'magneto', 'spark plug', 'mag check'], chapter: '74', label: 'Ignition' },
  { keywords: ['air filter', 'induction', 'intake', 'airbox', 'air box'], chapter: '73', label: 'Eng Fuel & Control' },
  { keywords: ['flight control', 'aileron', 'elevator', 'rudder', 'flap', 'trim', 'cable tension'], chapter: '27', label: 'Flight Controls' },
  { keywords: ['pitot', 'static', 'altimeter', 'airspeed', 'asi', 'vsi', 'attitude indicator', 'gyro'], chapter: '34', label: 'Instruments' },
  { keywords: ['hydraulic', 'actuator', 'fluid'], chapter: '29', label: 'Hydraulic' },
  { keywords: ['door', 'hinge', 'latch', 'seal', 'window'], chapter: '52', label: 'Doors' },
  { keywords: ['structural', 'spar', 'rib', 'skin', 'corrosion', 'crack'], chapter: '57', label: 'Wings' },
  { keywords: ['cabin', 'seat', 'interior', 'harness', 'belt'], chapter: '25', label: 'Equipment/Furnishings' },
  { keywords: ['antenna', 'com antenna', 'nav antenna'], chapter: '23', label: 'Communications' },
  { keywords: ['cooling', 'cowl', 'baffling', 'baffle', 'cht', 'egt'], chapter: '71', label: 'Powerplant' },
];

/** Suggest ATA chapter based on keywords found in work description. */
function guessAtaChapter(text: string): { chapter: string; label: string } | null {
  const lower = text.toLowerCase();
  for (const entry of ATA_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { chapter: entry.chapter, label: entry.label };
    }
  }
  return null;
}

/** Suggest entry type from keywords in work description. */
function guessEntryType(text: string): string | null {
  if (/annual\s+inspection|annual\s+insp/i.test(text)) return 'inspection';
  if (/100.?hour|100[\s-]hr/i.test(text)) return 'inspection';
  if (/\bad[-\s#]\s*\d{4}[-–]\d/i.test(text) || /airworthiness\s+directive/i.test(text)) return 'ad_compliance';
  if (/\bsb[-\s#]\d|service\s+bulletin/i.test(text)) return 'sb_compliance';
  if (/removed\s+and\s+replaced|r\s*&\s*r\b|installed\s+new|replaced\s+with|replace\s+the/i.test(text)) return 'maintenance';
  if (/\binspected?\b|\binspection\b|found\s+no\s+defects|found\s+airworthy|found\s+serviceable/i.test(text)) return 'inspection';
  if (/\balteration\b|\bstc\b|\bfield\s+approval/i.test(text)) return 'alteration';
  if (/preventive\s+maintenance|pm\s+performed/i.test(text)) return 'preventive_maintenance';
  if (/rebuilt|rebuild|overhaul/i.test(text)) return 'rebuilding';
  return null;
}

interface SavedSigner { name: string; certNumber: string; certType: string }

function loadSavedSigners(aircraftId: string): SavedSigner[] {
  try {
    return JSON.parse(localStorage.getItem(`aviation-logbook-signers-${aircraftId}`) ?? '[]');
  } catch { return []; }
}

function saveSigner(aircraftId: string, signer: SavedSigner) {
  const existing = loadSavedSigners(aircraftId).filter(
    (s) => s.certNumber !== signer.certNumber || s.name !== signer.name,
  );
  const updated = [signer, ...existing].slice(0, 6);
  localStorage.setItem(`aviation-logbook-signers-${aircraftId}`, JSON.stringify(updated));
}

/** Simple keyword-overlap score for fuzzy suggestion matching. */
function scoreSuggestion(query: string, candidate: string): number {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;
  const lower = candidate.toLowerCase();
  return tokens.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0);
}

/* ─── Add Manual Entry Modal ─────────────────────────────────────────── */

type ManualEntryForm = {
  entryDate: string;
  workPerformed: string;
  entryType: string;
  ataChapter: string;
  adReferences: string;
  sbReferences: string;
  totalTimeAtEntry: string;
  totalCyclesAtEntry: string;
  totalLandingsAtEntry: string;
  signerName: string;
  signerCertNumber: string;
  signerCertType: string;
  returnToServiceStatement: string;
  hasReturnToService: boolean;
};

const EMPTY_MANUAL_FORM: ManualEntryForm = {
  entryDate: '',
  workPerformed: '',
  entryType: '',
  ataChapter: '',
  adReferences: '',
  sbReferences: '',
  totalTimeAtEntry: '',
  totalCyclesAtEntry: '',
  totalLandingsAtEntry: '',
  signerName: '',
  signerCertNumber: '',
  signerCertType: '',
  returnToServiceStatement: '',
  hasReturnToService: false,
};

function AddManualEntryModal({
  projectId,
  aircraftId,
  allEntries,
  onAdd,
  onClose,
}: {
  projectId: string;
  aircraftId: string;
  allEntries: LogbookEntry[];
  onAdd: (args: any) => Promise<any>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ManualEntryForm>(EMPTY_MANUAL_FORM);
  const [saving, setSaving] = useState(false);

  // Smart assist state
  const [workSuggestions, setWorkSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ataSuggestion, setAtaSuggestion] = useState<{ chapter: string; label: string } | null>(null);
  const [typeSuggestion, setTypeSuggestion] = useState<string | null>(null);
  const [savedSigners] = useState<SavedSigner[]>(() => loadSavedSigners(aircraftId));
  const workRef = useRef<HTMLTextAreaElement>(null);

  const set =
    (field: keyof ManualEntryForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleWorkChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, workPerformed: val }));

    if (val.trim().length >= 3) {
      // Past-entry suggestions
      const scored = allEntries
        .filter((ent) => ent.workPerformed)
        .map((ent) => ({ text: ent.workPerformed!, score: scoreSuggestion(val, ent.workPerformed!) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const unique = Array.from(new Map(scored.map((s) => [s.text, s])).values())
        .slice(0, 5)
        .map((s) => s.text);
      setWorkSuggestions(unique);
      setShowSuggestions(unique.length > 0);

      // ATA suggestion
      setAtaSuggestion(guessAtaChapter(val));

      // Entry type suggestion (only when not already set)
      if (!form.entryType) setTypeSuggestion(guessEntryType(val));
    } else {
      setWorkSuggestions([]);
      setShowSuggestions(false);
      setAtaSuggestion(null);
      setTypeSuggestion(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const splitRefs = (val: string) =>
        val.split(',').map((r) => r.trim()).filter((r) => r.length > 0);
      const adRefs = splitRefs(form.adReferences);
      const sbRefs = splitRefs(form.sbReferences);

      const entry: Record<string, unknown> = {
        aircraftId: aircraftId as any,
        rawText: form.workPerformed.trim() || '(manually entered)',
        userVerified: true,
        confidence: 1.0,
      };

      if (form.entryDate) entry.entryDate = form.entryDate;
      if (form.workPerformed.trim()) entry.workPerformed = form.workPerformed.trim();
      if (form.entryType) entry.entryType = form.entryType;
      if (form.ataChapter.trim()) entry.ataChapter = form.ataChapter.trim();
      if (adRefs.length > 0) entry.adReferences = adRefs;
      if (sbRefs.length > 0) entry.sbReferences = sbRefs;
      if (adRefs.length > 0 || sbRefs.length > 0) {
        entry.adSbReferences = Array.from(new Set([...adRefs, ...sbRefs]));
      }

      const tt = parseFloat(form.totalTimeAtEntry);
      if (!isNaN(tt)) entry.totalTimeAtEntry = tt;
      const tc = parseInt(form.totalCyclesAtEntry, 10);
      if (!isNaN(tc)) entry.totalCyclesAtEntry = tc;
      const tl = parseInt(form.totalLandingsAtEntry, 10);
      if (!isNaN(tl)) entry.totalLandingsAtEntry = tl;

      if (form.signerName.trim()) entry.signerName = form.signerName.trim();
      if (form.signerCertNumber.trim()) entry.signerCertNumber = form.signerCertNumber.trim();
      if (form.signerCertType.trim()) entry.signerCertType = form.signerCertType.trim();
      if (form.returnToServiceStatement.trim())
        entry.returnToServiceStatement = form.returnToServiceStatement.trim();
      entry.hasReturnToService = form.hasReturnToService;

      await onAdd({ projectId: projectId as any, entries: [entry] });
      // Persist signer for quick-fill
      if (form.signerName.trim() && form.signerCertNumber.trim()) {
        saveSigner(aircraftId, {
          name: form.signerName.trim(),
          certNumber: form.signerCertNumber.trim(),
          certType: form.signerCertType.trim(),
        });
      }
      toast.success('Logbook entry created');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create entry');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400';
  const labelCls = 'block text-xs font-medium text-stone-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-[#fffdf7] border border-amber-300 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-500 hover:text-stone-800"
        >
          <FiX className="text-xl" />
        </button>
        <h2 className="text-lg font-semibold text-stone-900 font-['Source_Serif_4',serif] mb-4">
          Add Logbook Entry Manually
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Entry Date</label>
              <input type="date" className={inputCls} value={form.entryDate} onChange={set('entryDate')} />
            </div>
            <div>
              <label className={labelCls}>
                Entry Type
                {typeSuggestion && !form.entryType && (
                  <button
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, entryType: typeSuggestion })); setTypeSuggestion(null); }}
                    className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 font-medium"
                    title="Auto-detected from work description"
                  >
                    Use: {getLogbookEntryTypeLabel(typeSuggestion)} ✦
                  </button>
                )}
              </label>
              <select className={inputCls} value={form.entryType} onChange={set('entryType')}>
                <option value="">Select type…</option>
                {LOGBOOK_ENTRY_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {getLogbookEntryTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Work Performed <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <textarea
                ref={workRef}
                className={`${inputCls} resize-y min-h-[80px]`}
                value={form.workPerformed}
                onChange={handleWorkChange}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => workSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Describe the maintenance work performed…"
                required
              />
              {showSuggestions && workSuggestions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-amber-300 rounded-lg shadow-xl overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-amber-100 text-[10px] text-stone-500 font-semibold uppercase tracking-wide">
                    Similar past entries — click to reuse
                  </div>
                  {workSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-stone-800 hover:bg-amber-50 border-b border-amber-50 last:border-0 truncate font-['Source_Serif_4',serif]"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm((f) => ({ ...f, workPerformed: s }));
                        setShowSuggestions(false);
                        // Cascade smart hints on selection
                        const ata = guessAtaChapter(s);
                        if (ata) setAtaSuggestion(ata);
                        const type = guessEntryType(s);
                        if (type && !form.entryType) setTypeSuggestion(type);
                      }}
                    >
                      {s.length > 110 ? s.slice(0, 110) + '…' : s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Return-to-Service Statement</label>
            <textarea
              className={`${inputCls} resize-y min-h-[60px]`}
              value={form.returnToServiceStatement}
              onChange={set('returnToServiceStatement')}
              placeholder="e.g. Aircraft returned to service per 14 CFR §43.9"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasRts"
              checked={form.hasReturnToService}
              onChange={(e) => setForm((f) => ({ ...f, hasReturnToService: e.target.checked }))}
              className="rounded border-amber-300"
            />
            <label htmlFor="hasRts" className="text-sm text-stone-700">
              Has return-to-service statement
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                ATA Chapter
                {ataSuggestion && !form.ataChapter && (
                  <button
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, ataChapter: ataSuggestion.chapter })); setAtaSuggestion(null); }}
                    className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 font-medium"
                    title="Detected from work description"
                  >
                    Use: ATA {ataSuggestion.chapter} ({ataSuggestion.label}) ✦
                  </button>
                )}
              </label>
              <input
                type="text"
                className={inputCls}
                value={form.ataChapter}
                onChange={set('ataChapter')}
                placeholder="e.g. 71"
              />
            </div>
            <div>
              <label className={labelCls}>AD References (comma-separated)</label>
              <input
                type="text"
                className={inputCls}
                value={form.adReferences}
                onChange={set('adReferences')}
                placeholder="e.g. AD 2023-15-02, AD 2021-07-10"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>SB References (comma-separated)</label>
            <input
              type="text"
              className={inputCls}
              value={form.sbReferences}
              onChange={set('sbReferences')}
              placeholder="e.g. SB-1234-R1, SB-5678"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Total Time (hrs)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className={inputCls}
                value={form.totalTimeAtEntry}
                onChange={set('totalTimeAtEntry')}
                placeholder="e.g. 4215.3"
              />
            </div>
            <div>
              <label className={labelCls}>Total Cycles</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.totalCyclesAtEntry}
                onChange={set('totalCyclesAtEntry')}
                placeholder="e.g. 3100"
              />
            </div>
            <div>
              <label className={labelCls}>Total Landings</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.totalLandingsAtEntry}
                onChange={set('totalLandingsAtEntry')}
                placeholder="e.g. 3100"
              />
            </div>
          </div>

          {savedSigners.length > 0 && (
            <div>
              <p className="text-[10px] text-stone-500 font-semibold uppercase tracking-wide mb-1.5">
                Recent Signers — click to fill
              </p>
              <div className="flex flex-wrap gap-1.5">
                {savedSigners.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, signerName: s.name, signerCertNumber: s.certNumber, signerCertType: s.certType }))}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-amber-300 bg-[#fff8eb] text-stone-700 hover:bg-amber-100 transition-colors"
                  >
                    <FiCheck className="text-green-600 text-[10px]" />
                    {s.name}
                    {s.certNumber && <span className="text-stone-400 font-mono">#{s.certNumber}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Signer Name</label>
              <input
                type="text"
                className={inputCls}
                value={form.signerName}
                onChange={set('signerName')}
                placeholder="A&P / IA name"
              />
            </div>
            <div>
              <label className={labelCls}>Cert Number</label>
              <input
                type="text"
                className={inputCls}
                value={form.signerCertNumber}
                onChange={set('signerCertNumber')}
                placeholder="e.g. 3912345"
              />
            </div>
            <div>
              <label className={labelCls}>Cert Type</label>
              <input
                type="text"
                className={inputCls}
                value={form.signerCertType}
                onChange={set('signerCertType')}
                placeholder="e.g. A&P, IA"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-amber-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-amber-300 text-stone-700 hover:bg-amber-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.workPerformed.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
            >
              <FiCheck />
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
