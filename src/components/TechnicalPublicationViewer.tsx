import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiCalendar, FiBook } from 'react-icons/fi';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  useTechnicalPublication,
  usePublicationSections,
  useDocument,
  useDocumentFileUrl,
  useReplacePublicationSections,
  useAddInspectionScheduleItems,
  useDefaultClaudeModel,
  useAircraftAssets,
  useLogbookEntries,
} from '../hooks/useConvexData';
import { detectPublicationTocFromText } from '../services/manualIngestion';
import { RecurringInspectionExtractor } from '../services/recurringInspectionExtractor';
import { resolveExtractedTextForConvexDoc, hasExtractedTextContent } from '../utils/documentExtractedText';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard, Badge, Select } from './ui';
import { toast } from 'sonner';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';

function approximateChapterText(fullText: string, startPage: number, endPage: number): string {
  const t = fullText.trim();
  if (!t) return '';
  const span = Math.max(1, endPage - startPage + 1);
  const guessTotal = Math.max(endPage + 50, Math.floor(t.length / 800));
  const startRatio = Math.max(0, (startPage - 1) / guessTotal);
  const endRatio = Math.min(1, endPage / guessTotal);
  const i0 = Math.floor(startRatio * t.length);
  const i1 = Math.min(t.length, Math.floor(endRatio * t.length) + 8000);
  return t.slice(i0, i1).slice(0, 17000);
}

export default function TechnicalPublicationViewer() {
  const { publicationId } = useParams<{ publicationId: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const convex = useConvex();
  const defaultModel = useDefaultClaudeModel();

  const pub = useTechnicalPublication(publicationId) as any;
  const sections = usePublicationSections(publicationId) as any[] | undefined;
  const doc = useDocument(pub?.documentId) as any;
  const fileUrl = useDocumentFileUrl(pub?.documentId) as string | null | undefined;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isToc, setIsToc] = useState(false);
  const [isSchedule, setIsSchedule] = useState(false);
  const [previewItems, setPreviewItems] = useState<any[] | null>(null);
  const [aircraftId, setAircraftId] = useState<string>('');
  const replaceSections = useReplacePublicationSections();
  const addScheduleItems = useAddInspectionScheduleItems();

  const projectId = pub?.projectId as string | undefined;
  const aircraftList = useAircraftAssets(projectId) as any[] | undefined;
  const logEntries = useLogbookEntries(projectId, aircraftId || undefined) as any[] | undefined;

  const selected = sections?.find((s) => String(s._id) === String(selectedId)) ?? null;

  const pdfSrc = useMemo(() => {
    if (!fileUrl || !selected) return fileUrl ?? null;
    const page = Math.max(1, selected.startPage);
    return `${fileUrl}#page=${page}`;
  }, [fileUrl, selected]);

  const matchingInspections = useMemo(() => {
    if (!selected || !logEntries?.length) return [];
    const chap = selected.ataChapter?.replace(/^0+/, '') || '';
    return logEntries
      .filter((e) => e.entryType === 'inspection' || e.entryType === 'regulatory_check')
      .filter((e) => {
        const ac = (e.ataChapter || '').replace(/^0+/, '');
        return !chap || !ac || ac === chap;
      })
      .sort((a, b) => (b.entryDate || '').localeCompare(a.entryDate || ''))
      .slice(0, 12);
  }, [selected, logEntries]);

  const handleDetectToc = async () => {
    if (!publicationId || !doc || !hasExtractedTextContent(doc)) {
      toast.error('No extracted text yet. Wait for indexing or re-upload.');
      return;
    }
    setIsToc(true);
    try {
      const text = await resolveExtractedTextForConvexDoc(doc, convex);
      const parsed = await detectPublicationTocFromText(text, defaultModel);
      if (!parsed.length) {
        toast.warning('No TOC detected');
        return;
      }
      await replaceSections({
        publicationId: publicationId as any,
        sections: parsed.map((s) => ({
          ataChapter: s.ataChapter,
          ataSection: s.ataSection,
          title: s.title,
          startPage: s.startPage,
          endPage: s.endPage,
          depth: s.depth,
        })),
      });
      toast.success(`Saved ${parsed.length} sections`);
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    } finally {
      setIsToc(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!selected || !projectId || !doc || !hasExtractedTextContent(doc)) {
      toast.error('Select a chapter and ensure text is available.');
      return;
    }
    setIsSchedule(true);
    setPreviewItems(null);
    try {
      const full = await resolveExtractedTextForConvexDoc(doc, convex);
      const slice = approximateChapterText(full, selected.startPage, selected.endPage);
      const extractor = new RecurringInspectionExtractor();
      const res = await extractor.extractFromDocument(
        {
          id: String(doc._id),
          name: `${pub?.title} — ATA ${selected.ataChapter}`,
          extractedText: slice,
        },
        defaultModel,
        undefined,
        { defaultAtaChapter: selected.ataChapter }
      );
      setPreviewItems(res.items);
      if (!res.items.length) toast.message('No recurring intervals found in this chapter slice');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    } finally {
      setIsSchedule(false);
    }
  };

  const handleCommitSchedule = async () => {
    if (!previewItems?.length || !projectId) return;
    try {
      await addScheduleItems({
        projectId: projectId as any,
        items: previewItems.map((it) => ({
          sourceDocumentId: doc?._id,
          sourceDocumentName: pub?.title,
          title: it.title,
          description: it.description,
          category: it.category,
          intervalType: it.intervalType,
          intervalMonths: it.intervalMonths,
          intervalDays: it.intervalDays,
          intervalValue: it.intervalValue,
          regulationRef: it.regulationRef,
          isRegulatory: it.isRegulatory,
          lastPerformedAt: it.lastPerformedAt || undefined,
          lastPerformedSource: it.lastPerformedAt ? 'document' : undefined,
          documentExcerpt: it.documentExcerpt,
          ataChapter: it.ataChapter,
        })),
      });
      toast.success(`Added ${previewItems.length} schedule items`);
      setPreviewItems(null);
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  if (!publicationId) {
    return null;
  }

  if (pub === undefined) {
    return (
      <div className="p-8 text-white/60 text-center">
        <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-sky rounded-full mx-auto mb-3" />
        Loading…
      </div>
    );
  }

  if (!pub) {
    return (
      <div className="p-8 text-center">
        <p className="text-white/70 mb-4">Publication not found.</p>
        <Button onClick={() => navigate('/library')}>Back to library</Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<FiArrowLeft />} onClick={() => navigate('/library')}>
          Library
        </Button>
        <h1 className="text-2xl font-display font-bold text-white truncate flex-1 min-w-0">{pub.title}</h1>
        <Badge>{pub.publicationType}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void handleDetectToc()} disabled={isToc}>
          {isToc ? 'Detecting TOC…' : 'Re-detect TOC'}
        </Button>
        {projectId ? (
          <Select
            className="min-w-[200px]"
            label="Logbook scope"
            selectSize="sm"
            value={aircraftId}
            onChange={(e) => setAircraftId(e.target.value)}
          >
            <option value="">All aircraft in project</option>
            {(aircraftList || []).map((a: any) => (
              <option key={a._id} value={a._id}>
                {a.tailNumber}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        <GlassCard className="lg:col-span-4 flex flex-col min-h-[320px] max-h-[70vh]">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <FiBook /> ATA outline
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {(sections || []).map((s: any) => (
              <button
                key={s._id}
                type="button"
                onClick={() => setSelectedId(s._id)}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                  selectedId === s._id
                    ? 'border-sky-light/50 bg-sky/20 text-white'
                    : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                }`}
              >
                <span className="font-mono text-sky-200">ATA {s.ataChapter}</span> — {s.title}
                <span className="block text-xs text-white/50">
                  pp. {s.startPage}–{s.endPage}
                </span>
              </button>
            ))}
            {!sections?.length ? (
              <p className="text-white/50 text-sm py-4">No sections yet. Use Re-detect TOC after upload.</p>
            ) : null}
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-8 flex flex-col min-h-[320px] max-h-[70vh]">
          <h2 className="text-lg font-semibold mb-2">Document preview</h2>
          {pdfSrc ? (
            <iframe title="PDF" src={pdfSrc} className="flex-1 w-full min-h-[400px] rounded-lg border border-white/10 bg-black/40" />
          ) : (
            <p className="text-white/50 text-sm">No PDF file attached to this document.</p>
          )}

          {selected ? (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="text-sm text-white/80">
                Selected: <strong>ATA {selected.ataChapter}</strong> — {selected.title}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<FiCalendar />}
                  onClick={() => void handleCreateSchedule()}
                  disabled={isSchedule}
                >
                  {isSchedule ? 'Extracting…' : 'Create schedule from chapter'}
                </Button>
              </div>
              {previewItems && previewItems.length > 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="font-medium mb-2">Preview ({previewItems.length} items)</div>
                  <ul className="max-h-40 overflow-y-auto space-y-1 text-white/80">
                    {previewItems.map((it, i) => (
                      <li key={i}>
                        {it.title} — {it.intervalMonths ? `${it.intervalMonths} mo` : it.intervalValue ? `${it.intervalValue} ${it.intervalType}` : '—'}
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-2" size="sm" onClick={() => void handleCommitSchedule()}>
                    Save to inspection schedule
                  </Button>
                </div>
              ) : null}

              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                <div className="font-medium mb-2">Recent inspections (logbook{aircraftId ? ', this tail' : ''})</div>
                {matchingInspections.length === 0 ? (
                  <p className="text-white/50">No matching inspection entries for this ATA chapter.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {matchingInspections.map((e: any) => (
                      <li key={e._id} className="border-b border-white/5 pb-2">
                        <span className="text-sky-200">{e.entryDate || '—'}</span> — {e.workPerformed?.slice(0, 120) || e.rawText?.slice(0, 120)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </GlassCard>
      </div>
    </div>
  );
}
