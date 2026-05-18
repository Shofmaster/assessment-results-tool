/**
 * LogbookEntryReviewPage — multi-jurisdiction maintenance-record reviewer.
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { DocumentExtractor, userFacingExtractionError } from '../services/documentExtractor';
import {
  runManualLogbookComparison,
  comparisonGapsToComplianceFindings,
  type ManualComparisonResult,
} from '../services/manualLogbookComparison';
import { useAppStore } from '../store/appStore';
import {
  useAircraftAssets,
  useAddComplianceFindings,
  useComplianceScopeCompanyId,
  useEntityCapabilityList,
  useEntityOpSpecs,
  useEntityProfile,
  useIsLogbookEnabled,
  useManuals,
  useDefaultClaudeModel,
  useSharedReferenceDocsResolved,
  useTechnicalPublicationsByCompany,
  useUserSettings,
  useLogbookEntries,
  useRosterPersonnel,
} from '../hooks/useConvexData';
import {
  buildLogbookReviewSystem,
  buildLogbookReviewUser,
  LOGBOOK_REVIEW_STANDARD_MAP,
  type CompanyContextPacket,
  type LogbookReviewStandard,
} from '../services/logbookReviewPrompt';
import ComplianceInputPanel from './logbook/entry-review/ComplianceInputPanel';
import EntryReviewHeader from './logbook/entry-review/EntryReviewHeader';
import ManualComparePanel from './logbook/entry-review/ManualComparePanel';
import ResultPane from './logbook/entry-review/ResultPane';
import StandardsDrawer from './logbook/entry-review/StandardsDrawer';
import { callReview, splitEntriesByDateBoundaries, userFacingReviewCallError } from './logbook/entry-review/reviewClient';
import type { PageMode, SmartReviewResult } from './logbook/entry-review/types';

export default function LogbookEntryReviewPage() {
  const storeProjectId = useAppStore((s) => s.activeProjectId);
  const storedStandards = useAppStore((s) => s.logbookReviewStandards as string[]);
  const setStoredStandards = useAppStore((s) => s.setLogbookReviewStandards);
  const userSettings = useUserSettings();
  const activeProjectId = useMemo(() => {
    if (storeProjectId) return storeProjectId;
    const sid = userSettings?.activeProjectId;
    return sid ? String(sid) : null;
  }, [storeProjectId, userSettings?.activeProjectId]);

  const defaultModel = useDefaultClaudeModel();
  const logbookEnabled = useIsLogbookEnabled();
  const addComplianceFindings = useAddComplianceFindings();
  const companyId = useComplianceScopeCompanyId();
  const entityProfile = useEntityProfile(activeProjectId ?? undefined) as {
    companyName?: string;
    faaCertificateNumber?: string;
    easaApprovalRef?: string;
    faaCertTypesHeld?: string[];
    operationsScope?: string;
  } | null;
  const rosterPersonnel = (useRosterPersonnel(activeProjectId ?? undefined) ?? []) as {
    fullName?: string;
    certificateNumber?: string;
  }[];
  const capabilityItems = (useEntityCapabilityList(activeProjectId ?? undefined) ?? []) as {
    articleDescription?: string;
    authorizedFunctions?: string[];
  }[];
  const opSpecs = (useEntityOpSpecs(activeProjectId ?? undefined) ?? []) as {
    certPart?: string;
    paragraph?: string;
    title?: string;
  }[];
  const manuals = (useManuals(activeProjectId ?? undefined) ?? []) as { title?: string; currentRevision?: string }[];
  const technicalPublications = (useTechnicalPublicationsByCompany(companyId) ?? []) as {
    title?: string;
    name?: string;
    revision?: string;
    currentRevision?: string;
    publicationType?: string;
  }[];
  const sharedReferenceDocs = (useSharedReferenceDocsResolved() ?? []) as { name?: string; documentType?: string }[];

  const aircraftList = (useAircraftAssets(activeProjectId ?? undefined) ?? []) as {
    _id: string;
    tailNumber?: string;
    registration?: string;
  }[];
  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  useEffect(() => {
    if (!selectedAircraftId && aircraftList.length > 0) {
      setSelectedAircraftId(String(aircraftList[0]._id));
    }
  }, [aircraftList, selectedAircraftId]);

  const entries = (useLogbookEntries(activeProjectId ?? undefined, selectedAircraftId || undefined) ?? []) as {
    _id: string;
    entryDate?: string;
    rawText?: string;
    workPerformed?: string;
  }[];
  const recentEntries = useMemo(
    () =>
      [...entries]
        .filter((e) => e.entryDate)
        .sort((a, b) => (b.entryDate ?? '').localeCompare(a.entryDate ?? ''))
        .slice(0, 40),
    [entries],
  );

  const [pageMode, setPageMode] = useState<PageMode>('compliance');
  const [standards, setStandards] = useState<LogbookReviewStandard[]>(() => {
    const normalized = (storedStandards ?? []).filter((id): id is LogbookReviewStandard =>
      Boolean(LOGBOOK_REVIEW_STANDARD_MAP[id as LogbookReviewStandard]),
    );
    return normalized.length ? normalized : ['part_43_general'];
  });
  const [standardsDrawerOpen, setStandardsDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'input' | 'results'>('input');

  const [imageMode, setImageMode] = useState(false);
  const [text, setText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const extractorRef = useRef(new DocumentExtractor());
  const [autoSplitEntries, setAutoSplitEntries] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [result, setResult] = useState<SmartReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inspectionType, setInspectionType] = useState('');
  const [manualText, setManualText] = useState('');
  const [compareLogText, setCompareLogText] = useState('');
  const [selectedCompareLog, setSelectedCompareLog] = useState('');
  const manualExtractorRef = useRef(new DocumentExtractor());
  const [extractingManual, setExtractingManual] = useState(false);
  const [comparingManual, setComparingManual] = useState(false);
  const [manualCompareResult, setManualCompareResult] = useState<ManualComparisonResult | null>(null);
  const [savingManualGaps, setSavingManualGaps] = useState(false);
  const [optionalEntryId, setOptionalEntryId] = useState('');

  useEffect(() => {
    setStoredStandards(standards);
  }, [setStoredStandards, standards]);

  const toggleStandard = useCallback((id: LogbookReviewStandard) => {
    setStandards((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((s) => s !== id);
        return next.length ? next : ['part_43_general'];
      }
      return [...prev, id];
    });
  }, []);

  const applyStandardsPreset = useCallback((ids: LogbookReviewStandard[]) => {
    setStandards(ids.length ? ids : ['part_43_general']);
  }, []);

  const hasCustomSelection = useMemo(() => {
    const key = [...standards].sort().join(',');
    return key !== ['part_43_general'].sort().join(',');
  }, [standards]);

  useEffect(() => {
    if (hasCustomSelection || !entityProfile) return;
    const cert = Array.isArray(entityProfile.faaCertTypesHeld) ? String(entityProfile.faaCertTypesHeld[0] ?? '') : '';
    if (cert === '121') setStandards(['part_43_general', 'part_121']);
    else if (cert === '125') setStandards(['part_43_general', 'part_125']);
    else if (cert === '135') setStandards(['part_43_general', 'part_135']);
    else if (cert === '145') setStandards(['part_43_general', 'part_145', 'part_65']);
    else if (entityProfile.easaApprovalRef) setStandards(['easa_part_m', 'easa_part_145']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityProfile]);

  const companyContext = useMemo<CompanyContextPacket>(
    () => ({
      repairStation: {
        companyName: entityProfile?.companyName,
        certNumber: entityProfile?.faaCertificateNumber,
        certTypesHeld: entityProfile?.faaCertTypesHeld,
        easaApprovalRef: entityProfile?.easaApprovalRef,
        operationsScope: entityProfile?.operationsScope,
      },
      opSpecs: opSpecs as CompanyContextPacket['opSpecs'],
      capabilityList: capabilityItems as CompanyContextPacket['capabilityList'],
      roster: rosterPersonnel as CompanyContextPacket['roster'],
      manuals: [
        ...manuals,
        ...technicalPublications.map((p) => ({
          title: p.title || p.name || 'Publication',
          currentRevision: p.revision || p.currentRevision,
          manualType: p.publicationType,
        })),
      ] as CompanyContextPacket['manuals'],
      sharedReferences: sharedReferenceDocs as CompanyContextPacket['sharedReferences'],
    }),
    [entityProfile, opSpecs, capabilityItems, rosterPersonnel, manuals, technicalPublications, sharedReferenceDocs],
  );

  const reviewSystemPrompt = useMemo(() => buildLogbookReviewSystem({ standards }), [standards]);
  const entrySegments = useMemo(() => {
    if (!autoSplitEntries) return text.trim() ? [text.trim()] : [];
    return splitEntriesByDateBoundaries(text);
  }, [text, autoSplitEntries]);

  const resetCompliance = () => {
    setResult(null);
    setError(null);
  };

  const doTextReview = async (src: string) => {
    if (!src.trim()) return;
    setReviewing(true);
    setResult(null);
    setError(null);
    setMobileTab('results');
    try {
      const userText = buildLogbookReviewUser({
        mode: 'text',
        standards,
        entryText: src,
        companyContext,
      });
      setResult(await callReview('text', { text: src, userText }, DEFAULT_CLAUDE_MODEL, reviewSystemPrompt));
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally {
      setReviewing(false);
    }
  };

  const doBatchTextReview = async () => {
    if (entrySegments.length === 0) return;
    setReviewing(true);
    setResult(null);
    setError(null);
    setMobileTab('results');
    try {
      const batchResults: SmartReviewResult[] = [];
      for (const segment of entrySegments) {
        const userText = buildLogbookReviewUser({
          mode: 'text',
          standards,
          entryText: segment,
          companyContext,
        });
        batchResults.push(
          await callReview('text', { text: segment, userText }, DEFAULT_CLAUDE_MODEL, reviewSystemPrompt),
        );
      }
      const top = batchResults.sort((a, b) => a.complianceScore - b.complianceScore)[0];
      setResult(top);
      toast.success(`Reviewed ${batchResults.length} entries. Showing the highest-risk result first.`);
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally {
      setReviewing(false);
    }
  };

  const doImageReview = async (b64: string, mt: string) => {
    setReviewing(true);
    setResult(null);
    setError(null);
    setMobileTab('results');
    try {
      const userText = buildLogbookReviewUser({
        mode: 'image',
        standards,
        companyContext,
      });
      setResult(
        await callReview('image', { base64: b64, mediaType: mt, userText }, DEFAULT_CLAUDE_MODEL, reviewSystemPrompt),
      );
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally {
      setReviewing(false);
    }
  };

  const handleDocUpload = async (file: File) => {
    if (file.type.startsWith('image/')) {
      setImageMode(true);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        if (b64) void doImageReview(b64, file.type || 'image/png');
      };
      reader.readAsDataURL(file);
      return;
    }
    setExtractingDoc(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const extracted = await extractorRef.current.extractText(
        buffer,
        file.name,
        file.type || 'application/octet-stream',
        DEFAULT_CLAUDE_MODEL,
      );
      const cleaned = extracted.trim();
      if (!cleaned) throw new Error('No readable text found in this file.');
      setText((prev) => (prev.trim() ? `${prev}\n\n${cleaned}` : cleaned));
      setSelectedText('');
      setResult(null);
    } catch (err: unknown) {
      setError(userFacingExtractionError(err));
    } finally {
      setExtractingDoc(false);
    }
  };

  const handleManualFileUpload = async (file: File) => {
    setExtractingManual(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const extracted = await manualExtractorRef.current.extractText(
        buffer,
        file.name,
        file.type || 'application/octet-stream',
        defaultModel,
      );
      const cleaned = extracted.trim();
      if (!cleaned) throw new Error('No readable text found in this file.');
      setManualText((prev) => (prev.trim() ? `${prev}\n\n${cleaned}` : cleaned));
      setManualCompareResult(null);
    } catch (err: unknown) {
      setError(userFacingExtractionError(err));
    } finally {
      setExtractingManual(false);
    }
  };

  const doManualCompare = async () => {
    const logSrc = (selectedCompareLog || compareLogText).trim();
    if (!inspectionType.trim() || !manualText.trim() || !logSrc) return;
    setComparingManual(true);
    setManualCompareResult(null);
    setError(null);
    setMobileTab('results');
    try {
      setManualCompareResult(
        await runManualLogbookComparison({
          inspectionType: inspectionType.trim(),
          manualText,
          logEntryText: logSrc,
          model: defaultModel,
        }),
      );
    } catch (err: unknown) {
      setError(userFacingReviewCallError(err));
    } finally {
      setComparingManual(false);
    }
  };

  const saveManualGaps = async () => {
    if (!manualCompareResult || !activeProjectId || !selectedAircraftId) return;
    const gapsPayload = comparisonGapsToComplianceFindings(selectedAircraftId, manualCompareResult, {
      logbookEntryId: optionalEntryId || undefined,
    });
    if (gapsPayload.length === 0) return;
    setSavingManualGaps(true);
    try {
      await addComplianceFindings({
        projectId: activeProjectId as never,
        findings: gapsPayload.map((f) => ({
          aircraftId: f.aircraftId as never,
          logbookEntryId: f.logbookEntryId ? (f.logbookEntryId as never) : undefined,
          ruleId: f.ruleId,
          findingType: f.findingType,
          severity: f.severity,
          title: f.title,
          description: f.description,
          citation: f.citation,
          evidenceSnippet: f.evidenceSnippet,
        })),
      });
      toast.success(`Saved ${gapsPayload.length} finding(s). Open Logbook → Compliance to review.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save findings');
    } finally {
      setSavingManualGaps(false);
    }
  };

  const manualGapCount =
    manualCompareResult?.requiredItems.filter((i) => i.status === 'missing' || i.status === 'unclear').length ?? 0;

  const switchPageMode = (next: PageMode) => {
    setPageMode(next);
    setError(null);
    setMobileTab('input');
    if (next === 'compliance') setManualCompareResult(null);
    else {
      setResult(null);
      setImageMode(false);
    }
  };

  const loading = pageMode === 'compliance' ? reviewing : comparingManual;
  const loadingMessage =
    pageMode === 'compliance'
      ? `Analyzing entry against ${standards.map((id) => LOGBOOK_REVIEW_STANDARD_MAP[id]?.shortLabel ?? id).join(', ')}…`
      : 'Extracting required items from the manual and comparing to the log entry…';

  return (
    <div className="flex min-h-0 flex-1 flex-col w-full min-w-0 box-border p-2 sm:p-3 lg:p-4">
      <EntryReviewHeader
        pageMode={pageMode}
        onPageModeChange={switchPageMode}
        standards={standards}
        onOpenStandards={() => setStandardsDrawerOpen(true)}
        showStandardsControls={pageMode === 'compliance'}
        entityProfile={entityProfile}
        rosterPersonnel={rosterPersonnel}
        opSpecs={opSpecs}
        capabilityItems={capabilityItems}
        manuals={manuals}
        sharedReferenceDocs={sharedReferenceDocs}
        onInsertManualTitle={
          pageMode === 'manualCompare'
            ? (title, revision) =>
                setManualText((prev) =>
                  prev ? `${prev}\n\n[${title} Rev ${revision || '-'}]` : `[${title} Rev ${revision || '-'}]`,
                )
            : undefined
        }
      />

      <div className="lg:hidden flex gap-1 p-0.5 mb-2 rounded-lg bg-white/5 border border-white/10 w-fit">
        <button
          type="button"
          onClick={() => setMobileTab('input')}
          className={`px-3 py-1 rounded-md text-xs font-semibold ${mobileTab === 'input' ? 'bg-sky/20 text-sky-light' : 'text-white/50'}`}
        >
          Input
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('results')}
          className={`px-3 py-1 rounded-md text-xs font-semibold ${mobileTab === 'results' ? 'bg-sky/20 text-sky-light' : 'text-white/50'}`}
        >
          Results
        </button>
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        <div
          className={`${mobileTab === 'results' ? 'hidden lg:flex' : 'flex'} flex-col flex-1 min-h-0 min-w-0 overflow-y-auto`}
        >
          {pageMode === 'compliance' ? (
            <ComplianceInputPanel
              text={text}
              onTextChange={(v) => {
                setText(v);
                setSelectedText('');
              }}
              selectedText={selectedText}
              onSelectedTextChange={setSelectedText}
              autoSplitEntries={autoSplitEntries}
              onAutoSplitChange={setAutoSplitEntries}
              entrySegments={entrySegments}
              imageMode={imageMode}
              onEnterImageMode={() => {
                setImageMode(true);
                resetCompliance();
              }}
              onExitImageMode={() => {
                setImageMode(false);
                resetCompliance();
              }}
              onImageReview={doImageReview}
              onReviewEntry={() => doTextReview(text)}
              onReviewSegment={(segment) => void doTextReview(segment)}
              onReviewSelection={() => void doTextReview(selectedText)}
              onReviewBatch={() => void doBatchTextReview()}
              onClearText={() => {
                setText('');
                setSelectedText('');
                resetCompliance();
              }}
              onDocUpload={(f) => void handleDocUpload(f)}
              extractingDoc={extractingDoc}
              reviewing={reviewing}
            />
          ) : (
            <ManualComparePanel
              activeProjectId={activeProjectId}
              aircraftList={aircraftList}
              logbookEnabled={logbookEnabled}
              inspectionType={inspectionType}
              onInspectionTypeChange={(v) => {
                setInspectionType(v);
                setManualCompareResult(null);
              }}
              manualText={manualText}
              onManualTextChange={(v) => {
                setManualText(v);
                setManualCompareResult(null);
              }}
              compareLogText={compareLogText}
              onCompareLogTextChange={(v) => {
                setCompareLogText(v);
                setSelectedCompareLog('');
                setManualCompareResult(null);
              }}
              selectedCompareLog={selectedCompareLog}
              onSelectedCompareLogChange={setSelectedCompareLog}
              selectedAircraftId={selectedAircraftId}
              onAircraftChange={setSelectedAircraftId}
              optionalEntryId={optionalEntryId}
              onOptionalEntryChange={setOptionalEntryId}
              recentEntries={recentEntries}
              extractingManual={extractingManual}
              comparingManual={comparingManual}
              onManualFileUpload={(f) => void handleManualFileUpload(f)}
              onCompare={() => void doManualCompare()}
            />
          )}
        </div>

        <ResultPane
          pageMode={pageMode}
          standards={standards}
          loading={loading}
          loadingMessage={loadingMessage}
          error={error}
          complianceResult={result}
          manualResult={manualCompareResult}
          onDismissCompliance={resetCompliance}
          onDismissManual={() => {
            setManualCompareResult(null);
            setError(null);
          }}
          onSaveManualGaps={() => void saveManualGaps()}
          canSaveManualGaps={logbookEnabled && !!activeProjectId && !!selectedAircraftId && manualGapCount > 0}
          savingManualGaps={savingManualGaps}
          mobileTab={mobileTab}
        />
      </div>

      <StandardsDrawer
        open={standardsDrawerOpen}
        onClose={() => setStandardsDrawerOpen(false)}
        standards={standards}
        onToggleStandard={toggleStandard}
        onApplyPreset={applyStandardsPreset}
      />
    </div>
  );
}
