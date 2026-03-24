import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  FiEdit,
  FiCheck,
  FiRefreshCw,
  FiTrash2,
  FiChevronDown,
  FiPlus,
  FiAlertTriangle,
  FiBookOpen,
  FiFileText,
  FiZap,
  FiCopy,
  FiShield,
  FiClock,
  FiTool,
  FiList,
  FiDownload,
  FiSettings,
  FiChevronRight,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useAssessments,
  useEntityIssues,
  useDocumentReviews,
  useSimulationResults,
  useSharedAgentDocsByAgents,
  useAllProjectAgentDocs,
  useAllSharedReferenceDocs,
  useManualSections,
  useApprovedSectionsByType,
  useApprovedSectionsForExport,
  useAddManualSection,
  useUpdateManualSection,
  useRemoveManualSection,
  useDefaultClaudeModel,
} from '../hooks/useConvexData';
import ManualExportModal from './ManualExportModal';
import PreGenerationInterviewModal from './PreGenerationInterviewModal';
import type { ManualSection as ExportManualSection } from '../services/manualDocxGenerator';
import {
  AVAILABLE_STANDARDS,
  MANUAL_TYPES,
  WRITING_STYLES,
  getSectionTemplates,
  fetchCfrForManualType,
  buildManualWriterSystemPrompt,
  generateManualSection,
  generateInterviewQuestions,
  type ManualWriterContext,
  type StandardDefinition,
  type ManualTypeDefinition,
  type WritingStyle,
} from '../services/manualWriterService';
import {
  checkManualForUpdates,
  type ManualRegUpdateResult,
} from '../services/manualRegUpdateChecker';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard, Badge, Select } from './ui';
import { PageModelSelector } from './PageModelSelector';

export default function ManualWriter() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);

  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const model = useDefaultClaudeModel();

  // Data sources
  const entityDocs = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const allDocs = (useDocuments(activeProjectId || undefined) || []) as any[];
  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const entityIssues = (useEntityIssues(activeProjectId || undefined) || []) as any[];
  const documentReviews = (useDocumentReviews(activeProjectId || undefined) || []) as any[];
  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const allRefDocs = (useAllSharedReferenceDocs() || []) as any[];

  // Config state
  const [manualTypeId, setManualTypeId] = useState(MANUAL_TYPES[0].id);
  const [activeStandardIds, setActiveStandardIds] = useState<string[]>(['faa']);
  const [sourceDocId, setSourceDocId] = useState<string>('');
  const [selectedSectionIdx, setSelectedSectionIdx] = useState(0);
  const [customSectionTitle, setCustomSectionTitle] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [sectionSearch, setSectionSearch] = useState('');

  // Rewrite mode state
  const [mode, setMode] = useState<'generate' | 'rewrite'>('generate');
  const [autoAnalyzeMode, setAutoAnalyzeMode] = useState(true);
  const [showRewriteSources, setShowRewriteSources] = useState(false);
  const [selectedSimIds, setSelectedSimIds] = useState<string[]>([]);
  const [includeReviewFindings, setIncludeReviewFindings] = useState(true);
  const [includeCars, setIncludeCars] = useState(true);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [generatedText, setGeneratedText] = useState('');
  const [dataSourcesToShow, setDataSourcesToShow] = useState<Array<{ label: string; count: number | string }>>([]);

  // Regulatory update check state
  const [checkingRegUpdates, setCheckingRegUpdates] = useState(false);
  const [regUpdateResult, setRegUpdateResult] = useState<ManualRegUpdateResult | null>(null);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);

  // Writing style / format config state
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('formal');
  const [citationsEnabled, setCitationsEnabled] = useState(true);
  const [fontChoice, setFontChoice] = useState<string>('Calibri');
  const [marginsChoice, setMarginsChoice] = useState<string>('standard');
  const [showDocxFormat, setShowDocxFormat] = useState(false);

  // Per-section tone and citation overrides (keyed by section title)
  const [sectionToneOverrides, setSectionToneOverrides] = useState<Record<string, WritingStyle>>({});
  const [sectionCitationOverrides, setSectionCitationOverrides] = useState<Record<string, boolean | null>>({});

  // Pre-generation interview state
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState<string[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<string[]>([]);
  const [interviewLoading, setInterviewLoading] = useState(false);

  // Mutations
  const addSection = useAddManualSection();
  const updateSection = useUpdateManualSection();
  const removeSection = useRemoveManualSection();

  // Approved sections for export
  const approvedForExport = (useApprovedSectionsForExport(activeProjectId || undefined, manualTypeId) || []) as any[];

  // Derived values
  const manualType = MANUAL_TYPES.find((m) => m.id === manualTypeId) ?? MANUAL_TYPES[0];
  const activeStandards = AVAILABLE_STANDARDS.filter((s) => activeStandardIds.includes(s.id));
  const sectionTemplates = useMemo(
    () => getSectionTemplates(manualTypeId, activeStandardIds),
    [manualTypeId, activeStandardIds]
  );

  const selectedSection = sectionTemplates[selectedSectionIdx] ?? sectionTemplates[0];
  const sectionTitle = showCustomInput ? customSectionTitle : selectedSection?.title ?? '';
  const sectionNumber = showCustomInput ? undefined : selectedSection?.number;
  const filteredSectionTemplates = useMemo(() => {
    const query = sectionSearch.trim().toLowerCase();
    return sectionTemplates
      .map((sec, idx) => ({ sec, idx }))
      .filter(({ sec }) => {
        if (!query) return true;
        return sec.title.toLowerCase().includes(query) || (sec.number || '').toLowerCase().includes(query);
      });
  }, [sectionTemplates, sectionSearch]);

  // KB docs for active standards
  const kbAgentIds = useMemo(
    () => [...new Set(activeStandards.map((s) => s.agentKbId).concat('audit-intelligence-analyst'))],
    [activeStandards]
  );
  const sharedKbDocs = (useSharedAgentDocsByAgents(kbAgentIds) || []) as any[];
  const projectKbDocs = (useAllProjectAgentDocs(activeProjectId || undefined) || []) as any[];
  const allKbDocs = useMemo(
    () =>
      [...sharedKbDocs, ...projectKbDocs].filter(
        (d: any) => kbAgentIds.includes(d.agentId) && (d.extractedText || '').length > 0
      ),
    [sharedKbDocs, projectKbDocs, kbAgentIds]
  );

  // Saved sections for current project
  const savedSections = (useManualSections(activeProjectId || undefined, manualTypeId) || []) as any[];
  const approvedPrior = (useApprovedSectionsByType(manualTypeId, sectionNumber) || []) as any[];

  // Section completeness map: title → 'missing' | 'draft' | 'approved'
  const sectionCompletionMap = useMemo(() => {
    const map: Record<string, 'missing' | 'draft' | 'approved'> = {};
    for (const tmpl of sectionTemplates) {
      const saved = savedSections.find(
        (s: any) => s.sectionTitle === tmpl.title || (tmpl.number && s.sectionNumber === tmpl.number)
      );
      if (!saved) map[tmpl.title] = 'missing';
      else if (saved.status === 'approved') map[tmpl.title] = 'approved';
      else map[tmpl.title] = 'draft';
    }
    return map;
  }, [sectionTemplates, savedSections]);

  const approvedCount = useMemo(
    () => Object.values(sectionCompletionMap).filter((v) => v === 'approved').length,
    [sectionCompletionMap]
  );
  const draftCount = useMemo(
    () => Object.values(sectionCompletionMap).filter((v) => v === 'draft').length,
    [sectionCompletionMap]
  );

  // Missing KB warnings
  const missingKbStandards = useMemo(() => {
    return activeStandards.filter((s) => {
      const hasDocs = allKbDocs.some(
        (d: any) => d.agentId === s.agentKbId && (d.extractedText || '').length > 0
      );
      return !hasDocs;
    });
  }, [activeStandards, allKbDocs]);

  // Reset section selection when templates change
  useEffect(() => {
    setSelectedSectionIdx(0);
    setShowCustomInput(false);
  }, [manualTypeId, activeStandardIds.join(',')]);

  const toggleStandard = useCallback((stdId: string) => {
    setActiveStandardIds((prev) =>
      prev.includes(stdId) ? prev.filter((id) => id !== stdId) : [...prev, stdId]
    );
  }, []);

  // Step 1: validate, load interview questions, open modal
  const handleRequestGenerate = useCallback(async () => {
    if (!sectionTitle.trim()) {
      toast.error('Enter a section title');
      return;
    }
    if (!activeProjectId) {
      toast.error('Select a project first');
      return;
    }
    if (mode === 'rewrite' && !sourceDocId) {
      toast.error('Select the non-conforming manual document to rewrite');
      return;
    }

    // Open interview modal and load questions
    setInterviewOpen(true);
    setInterviewLoading(true);
    setInterviewQuestions([]);
    setInterviewAnswers([]);

    try {
      const latestAssessment = assessments[assessments.length - 1];
      const assessmentData = latestAssessment?.data;
      const companyName = (assessmentData as any)?.companyName || 'Organization';
      const assessmentSummary = assessmentData ? JSON.stringify(assessmentData, null, 2) : '';
      const manualTypeDef = MANUAL_TYPES.find((m) => m.id === manualTypeId) ?? MANUAL_TYPES[0];
      const questions = await generateInterviewQuestions(
        manualTypeDef,
        sectionTitle,
        sectionNumber,
        activeStandards,
        companyName,
        assessmentSummary,
        model
      );
      setInterviewQuestions(questions);
      setInterviewAnswers(new Array(questions.length).fill(''));
    } catch {
      // Fallback: open with empty questions so user can skip
      setInterviewQuestions([]);
      setInterviewAnswers([]);
    } finally {
      setInterviewLoading(false);
    }
  }, [
    sectionTitle, sectionNumber, activeProjectId, mode, sourceDocId,
    assessments, manualTypeId, activeStandards, model,
  ]);

  // Step 2: called from interview modal confirm or skip
  const handleConfirmInterview = useCallback((answers: string[]) => {
    setInterviewOpen(false);
    const qaText = interviewQuestions.length > 0
      ? interviewQuestions
          .map((q, i) => `Q: ${q}\nA: ${answers[i]?.trim() || '(Not provided)'}`)
          .join('\n\n')
      : '';
    const effectiveTone = sectionToneOverrides[sectionTitle] ?? writingStyle;
    const effectiveCitations =
      sectionCitationOverrides[sectionTitle] !== undefined
        ? (sectionCitationOverrides[sectionTitle] as boolean)
        : citationsEnabled;
    executeGenerate(qaText || undefined, effectiveTone, effectiveCitations);
  }, [interviewQuestions, sectionTitle, sectionToneOverrides, writingStyle, sectionCitationOverrides, citationsEnabled]);

  // Core generation logic (was handleGenerate)
  const executeGenerate = useCallback(async (
    interviewAnswersText: string | undefined,
    effectiveStyle: WritingStyle,
    effectiveCitations: boolean,
  ) => {
    setGenerating(true);
    setStreamedText('');
    setGeneratedText('');

    try {
      // Gather data sources
      const cfrText = await fetchCfrForManualType(manualTypeId);

      const refDocs = allRefDocs.filter(
        (d: any) => d.documentType === manualType.refDocType && (d.extractedText || '').length > 0
      );
      const referenceDocText = refDocs.map((d: any) => `--- ${d.name} ---\n${d.extractedText}`).join('\n\n');

      const standardsKbEntries = allKbDocs.filter(
        (d: any) => d.agentId !== 'audit-intelligence-analyst' && (d.extractedText || '').length > 0
      );
      const standardsKbText = standardsKbEntries.map((d: any) => `--- ${d.name} (${d.agentId}) ---\n${d.extractedText}`).join('\n\n');

      const intelDocs = allKbDocs.filter(
        (d: any) => d.agentId === 'audit-intelligence-analyst' && (d.extractedText || '').length > 0
      );
      const auditIntelligenceMemory = intelDocs.map((d: any) => d.extractedText).join('\n\n');


      const approvedPriorText = approvedPrior
        .map((s: any) => `--- ${s.sectionTitle} (${s.sectionNumber || 'N/A'}) [standards: ${(s.activeStandards || []).join(', ')}] ---\n${s.generatedContent}`)
        .join('\n\n');

      const activeCars = entityIssues
        .filter((i: any) => {
          const st = i.status ?? 'open';
          return st !== 'closed' && st !== 'voided';
        })
        .map((i: any) => `- [${i.carNumber || 'N/A'}] ${i.severity?.toUpperCase()}: ${i.title} — ${i.description}${i.regulationRef ? ` (${i.regulationRef})` : ''}`)
        .join('\n');

      const reviewFindings = documentReviews
        .filter((r: any) => r.status === 'completed' && r.findings)
        .flatMap((r: any) => {
          const findings = Array.isArray(r.findings) ? r.findings : [];
          return findings.map((f: any) => `- [${f.severity?.toUpperCase() || 'NOTE'}] ${f.description}${f.location ? ` (${f.location})` : ''}`);
        })
        .join('\n');

      const sourceDoc = sourceDocId ? allDocs.find((d: any) => d._id === sourceDocId) : null;
      const sourceDocumentText = sourceDoc?.extractedText ?? '';

      const latestAssessment = assessments[assessments.length - 1];
      const assessmentData = latestAssessment?.data;
      const companyName = assessmentData?.companyName || 'Organization';
      const assessmentSummary = assessmentData ? JSON.stringify(assessmentData, null, 2) : '';

      // Build non-conformances block for rewrite mode
      let nonConformancesToAddress = '';
      if (mode === 'rewrite' && !autoAnalyzeMode) {
        const ncLines: string[] = [];

        // Discrepancies from selected simulation results
        if (selectedSimIds.length > 0) {
          const selectedSims = simulationResults.filter((s: any) => selectedSimIds.includes(s._id));
          selectedSims.forEach((sim: any) => {
            const discs: any[] = sim.discrepancies || [];
            if (discs.length > 0) {
              ncLines.push(`=== Audit Simulation: ${sim.name || 'Unnamed'} ===`);
              discs.forEach((d: any) => {
                ncLines.push(`- [${d.severity?.toUpperCase() || 'FINDING'}] ${d.title}: ${d.description}${d.regulationRef ? ` (${d.regulationRef})` : ''}${d.sourceAgent ? ` [${d.sourceAgent}]` : ''}`);
              });
            }
          });
        }

        // Paperwork review findings
        if (includeReviewFindings) {
          const reviewLines = documentReviews
            .filter((r: any) => r.status === 'completed' && r.findings)
            .flatMap((r: any) => {
              const findings = Array.isArray(r.findings) ? r.findings : [];
              if (findings.length === 0) return [];
              return [
                `=== Paperwork Review: ${r.documentName || 'Document'} ===`,
                ...findings.map((f: any) => `- [${f.severity?.toUpperCase() || 'NOTE'}] ${f.description}${f.location ? ` (${f.location})` : ''}`),
              ];
            });
          ncLines.push(...reviewLines);
        }

        // Active CARs
        if (includeCars) {
          const carLines = entityIssues
            .filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; })
            .map((i: any) => `- [CAR ${i.carNumber || 'N/A'}] ${i.severity?.toUpperCase()}: ${i.title} — ${i.description}${i.regulationRef ? ` (${i.regulationRef})` : ''}`);
          if (carLines.length > 0) {
            ncLines.push('=== Active CARs / NCRs ===', ...carLines);
          }
        }

        nonConformancesToAddress = ncLines.join('\n');
      }

      const isRewrite = mode === 'rewrite';

      const ctx: ManualWriterContext = {
        manualType,
        sectionTitle,
        sectionNumber,
        activeStandards,
        cfrText,
        referenceDocText,
        standardsKbText,
        auditIntelligenceMemory,
        approvedPriorSections: approvedPriorText,
        paperworkReviewFindings: isRewrite ? '' : reviewFindings,
        assessmentSummary,
        activeCars: isRewrite ? '' : activeCars,
        sourceDocumentText,
        companyName,
        rewriteMode: isRewrite,
        nonConformancesToAddress: isRewrite ? nonConformancesToAddress : undefined,
        autoAnalyzeMode: isRewrite ? autoAnalyzeMode : undefined,
        writingStyle: effectiveStyle,
        citationsEnabled: effectiveCitations,
        interviewAnswers: interviewAnswersText || undefined,
      };

      const systemPrompt = buildManualWriterSystemPrompt(ctx);

      const ncCount = nonConformancesToAddress ? nonConformancesToAddress.split('\n').filter((l) => l.startsWith('-')).length : 0;

      setDataSourcesToShow([
        { label: 'CFR text', count: cfrText ? `${Math.round(cfrText.length / 1000)}k chars` : 'none' },
        { label: 'Standards KB docs', count: standardsKbEntries.length },
        { label: 'Reference manuals', count: refDocs.length },
        { label: 'Audit intel memory', count: intelDocs.length },
        { label: 'Approved prior sections', count: approvedPrior.length },
        ...(isRewrite
          ? [
              { label: 'Non-conforming manual', count: sourceDocumentText ? 'loaded' : 'none' },
              { label: 'Non-conformances', count: autoAnalyzeMode ? 'AI auto-detect' : ncCount },
            ]
          : [
              { label: 'Review findings', count: reviewFindings ? reviewFindings.split('\n').filter(Boolean).length : 0 },
              { label: 'Active CARs', count: activeCars ? activeCars.split('\n').filter(Boolean).length : 0 },
              { label: 'Source document', count: sourceDocumentText ? 'loaded' : 'none' },
            ]),
      ]);

      const rewriteUserMessage = 'Rewrite the section now, correcting all identified non-conformances and achieving full compliance with all active standards. Output only the rewritten manual section text.';

      const finalText = await generateManualSection(
        systemPrompt,
        model,
        { onText: (chunk) => setStreamedText((prev) => prev + chunk) },
        isRewrite ? rewriteUserMessage : undefined
      );

      setGeneratedText(finalText);
      setStreamedText('');
      toast.success(isRewrite ? 'Section rewritten' : 'Section generated');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [
    sectionTitle, sectionNumber, activeProjectId, manualTypeId, manualType,
    activeStandards, allRefDocs, allKbDocs, approvedPrior, entityIssues,
    documentReviews, simulationResults, sourceDocId, allDocs, assessments, model,
    mode, autoAnalyzeMode, selectedSimIds, includeReviewFindings, includeCars,
  ]);

  // Convenience: save draft passing through per-section overrides
  const handleSaveWithOverrides = useCallback(async () => {
    if (!generatedText || !activeProjectId) return;
    try {
      const toneOverride = sectionToneOverrides[sectionTitle] ?? undefined;
      const citationsOverride =
        sectionCitationOverrides[sectionTitle] !== undefined
          ? sectionCitationOverrides[sectionTitle]
          : undefined;
      await (addSection as any)({
        projectId: activeProjectId as any,
        manualType: manualTypeId,
        sectionTitle,
        sectionNumber,
        generatedContent: generatedText,
        activeStandards: activeStandardIds,
        toneOverride,
        citationsOverride,
      });
      toast.success('Section saved as draft');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  }, [
    generatedText, activeProjectId, manualTypeId, sectionTitle, sectionNumber,
    activeStandardIds, addSection, sectionToneOverrides, sectionCitationOverrides,
  ]);

  const handleSave = handleSaveWithOverrides;

  const handleApprove = useCallback(async (sectionId: string) => {
    try {
      await updateSection({ sectionId: sectionId as any, status: 'approved' });
      toast.success('Section approved');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  }, [updateSection]);

  const handleDelete = useCallback(async (sectionId: string) => {
    try {
      await removeSection({ sectionId: sectionId as any });
      toast.success('Section removed');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  }, [removeSection]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }, []);

  const handleLoadSavedSection = useCallback((sec: any) => {
    setGeneratedText(sec.generatedContent || '');
    setStreamedText('');
    const matchingIdx = sectionTemplates.findIndex((s) => s.title === sec.sectionTitle);
    if (matchingIdx >= 0) {
      setSelectedSectionIdx(matchingIdx);
      setShowCustomInput(false);
    } else {
      setCustomSectionTitle(sec.sectionTitle || '');
      setShowCustomInput(true);
    }
    toast.success('Loaded saved section into editor');
  }, [sectionTemplates]);

  // Clear reg-update results whenever the manual type changes
  useEffect(() => {
    setRegUpdateResult(null);
  }, [manualTypeId]);

  const handleCheckRegUpdates = useCallback(async () => {
    setCheckingRegUpdates(true);
    setRegUpdateResult(null);
    try {
      const sectionsForCheck = savedSections.map((s: any) => ({
        sectionTitle: s.sectionTitle,
        sectionNumber: s.sectionNumber,
        updatedAt: s.updatedAt,
        cfrRefs: s.cfrRefs,
      }));
      const result = await checkManualForUpdates(manualType, sectionsForCheck, model);
      setRegUpdateResult(result);
      const staleCount = result.sectionsToReview.length;
      if (staleCount > 0) {
        toast.warning(`${staleCount} section${staleCount > 1 ? 's' : ''} may need review due to regulatory updates`);
      } else {
        toast.success('All CFR parts are current — no regulatory updates detected');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Update check failed';
      toast.error(msg);
    } finally {
      setCheckingRegUpdates(false);
    }
  }, [manualType, savedSections, model]);

  const displayText = generating ? streamedText : generatedText;

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
        <h1 className="text-2xl font-display font-bold text-white mb-4">Manual Writer</h1>
        <GlassCard padding="lg">
          <p className="text-white/70 text-center py-12">Select a project to begin writing manual sections.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <FiEdit className="text-sky-lighter text-xl" />
          <h1 className="text-xl lg:text-2xl font-display font-bold text-white">Manual Writer</h1>
          <Badge variant="outline" size="sm" className="text-[10px] text-white/70 border-white/20 hidden sm:inline-flex">
            {mode === 'rewrite' ? 'Rewrite Mode' : 'Generate Mode'}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {approvedForExport.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowExportModal(true)}
              disabled={generating}
            >
              <FiDownload className="mr-1" /> Export DOCX
              <Badge variant="success" size="sm" className="ml-1.5">
                {approvedForExport.length}
              </Badge>
            </Button>
          )}
          <PageModelSelector field="claudeModel" compact disabled={generating} />
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-5 overflow-y-auto scrollbar-thin lg:overflow-hidden">
        {/* LEFT PANEL: Config */}
        <div className="flex flex-col gap-3 overflow-y-auto scrollbar-thin min-h-0 pr-1 max-h-none lg:max-h-none">
          <GlassCard padding="sm" border>
            <div className="text-sm sm:text-xs font-medium text-white/80 sm:text-white/70 mb-2">Workflow</div>
            <ol className="list-decimal pl-4 space-y-1.5 text-[11px] text-white/60">
              <li>1) Choose mode and manual type</li>
              <li>2) Select standards and section</li>
              <li>3) Add source context (required in rewrite mode)</li>
              <li>4) Generate or rewrite, review, then save/approve</li>
            </ol>
          </GlassCard>

          {/* Mode toggle */}
          <GlassCard padding="sm" border>
            <div className="text-sm sm:text-xs font-medium text-white/75 sm:text-white/60 mb-2">Mode</div>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                type="button"
                onClick={() => setMode('generate')}
                disabled={generating}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/60 active:scale-[0.99] ${
                  mode === 'generate'
                    ? 'bg-sky/30 text-white border-r border-white/10'
                    : 'bg-white/5 text-white/50 hover:text-white/70 border-r border-white/10'
                }`}
              >
                <FiZap className="text-[11px]" /> Generate
              </button>
              <button
                type="button"
                onClick={() => setMode('rewrite')}
                disabled={generating}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 active:scale-[0.99] ${
                  mode === 'rewrite'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-white/5 text-white/50 hover:text-white/70'
                }`}
              >
                <FiTool className="text-[11px]" /> Rewrite
              </button>
            </div>
            {mode === 'rewrite' && (
              <p className="mt-2 text-[11px] text-amber-300/70 leading-snug">
                Rewrite mode takes a non-conforming manual and corrects it to meet the selected standards.
              </p>
            )}
          </GlassCard>

          <GlassCard padding="sm" border>
            <Select
              label="Manual Type"
              selectSize="sm"
              value={manualTypeId}
              onChange={(e) => setManualTypeId(e.target.value)}
              disabled={generating}
            >
              {MANUAL_TYPES.map((mt) => (
                <option key={mt.id} value={mt.id} className="bg-navy-800 text-white">
                  {mt.label}
                </option>
              ))}
            </Select>
          </GlassCard>

          {/* Manual Settings */}
          <GlassCard padding="sm" border>
            <div className="flex items-center gap-1.5 mb-3">
              <FiSettings className="text-sky-lighter text-sm" />
              <div className="text-sm font-medium text-white/80">Manual Settings</div>
            </div>

            {/* Writing Style */}
            <div className="mb-3">
              <label className="block text-xs text-white/60 mb-1">Writing Style</label>
              <select
                value={writingStyle}
                onChange={(e) => setWritingStyle(e.target.value as WritingStyle)}
                disabled={generating}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-light/60 disabled:opacity-50"
              >
                {WRITING_STYLES.map((s) => (
                  <option key={s.id} value={s.id} className="bg-navy-800 text-white">
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-white/40 leading-snug">
                {WRITING_STYLES.find((s) => s.id === writingStyle)?.description}
              </p>
            </div>

            {/* Citations toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={citationsEnabled}
                onChange={(e) => setCitationsEnabled(e.target.checked)}
                disabled={generating}
                className="accent-sky-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 rounded-sm"
              />
              <div>
                <div className="text-xs font-medium text-white/85">Include inline citations</div>
                <div className="text-[11px] text-white/45">§ references and standard clauses in generated text</div>
              </div>
            </label>

            {/* DOCX Format (collapsible) */}
            <button
              type="button"
              onClick={() => setShowDocxFormat((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 rounded"
            >
              <FiChevronRight className={`text-[10px] transition-transform ${showDocxFormat ? 'rotate-90' : ''}`} />
              DOCX Format
            </button>

            {showDocxFormat && (
              <div className="mt-2 space-y-2 pl-2 border-l border-white/10">
                <div>
                  <label className="block text-[11px] text-white/55 mb-1">Font</label>
                  <select
                    value={fontChoice}
                    onChange={(e) => setFontChoice(e.target.value)}
                    disabled={generating}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-light/60 disabled:opacity-50"
                  >
                    {['Calibri', 'Times New Roman', 'Arial', 'Georgia'].map((f) => (
                      <option key={f} value={f} className="bg-navy-800 text-white">{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-white/55 mb-1">Margins</label>
                  <select
                    value={marginsChoice}
                    onChange={(e) => setMarginsChoice(e.target.value)}
                    disabled={generating}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-sky-light/60 disabled:opacity-50"
                  >
                    <option value="standard" className="bg-navy-800 text-white">Standard (1")</option>
                    <option value="condensed" className="bg-navy-800 text-white">Condensed (0.5")</option>
                    <option value="expanded" className="bg-navy-800 text-white">Expanded (1.25")</option>
                  </select>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Standards multi-select */}
          <GlassCard padding="sm" border>
            <div className="text-sm font-medium mb-2 text-white/80">Standards</div>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_STANDARDS.map((std) => {
                const active = activeStandardIds.includes(std.id);
                return (
                  <button
                    key={std.id}
                    type="button"
                    onClick={() => toggleStandard(std.id)}
                    disabled={generating}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.99] ${
                      active
                        ? 'bg-sky/20 border-sky-light/40 text-white'
                        : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70 hover:border-white/20'
                    }`}
                  >
                    {std.label}
                  </button>
                );
              })}
            </div>
            {missingKbStandards.length > 0 && (
              <div className="mt-2 space-y-1">
                {missingKbStandards.map((s) => (
                  <div key={s.id} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                    <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
                    <span>No {s.label} docs in KB — upload in Admin</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Source document picker */}
          <GlassCard padding="sm" border>
            <Select
              label={mode === 'rewrite' ? 'Source Manual (required)' : 'Source Document (optional)'}
              selectSize="sm"
              value={sourceDocId}
              onChange={(e) => setSourceDocId(e.target.value)}
              disabled={generating}
            >
              <option value="" className="bg-navy-800 text-white">
                {mode === 'rewrite' ? '— Select the manual section source —' : 'None — write from scratch'}
              </option>
              {allDocs
                .filter((d: any) => (d.extractedText || '').length > 0)
                .map((d: any) => (
                  <option key={d._id} value={d._id} className="bg-navy-800 text-white">
                    {d.name}
                  </option>
                ))}
            </Select>
            {mode === 'rewrite' && !sourceDocId && (
              <p className="mt-1.5 text-[11px] text-amber-400/70">Select the source manual you want to fix. Upload it in the Library if it is not listed.</p>
            )}
          </GlassCard>

          {/* Non-Conformance Sources — shown only in rewrite mode */}
          {mode === 'rewrite' && (
            <GlassCard padding="sm" border>
              <div className="flex items-center gap-2 mb-3">
                <FiList className="text-amber-300 text-sm" />
                <div className="text-sm font-medium text-white/80">Non-Conformance Sources</div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setShowRewriteSources((prev) => !prev)}
                  disabled={generating}
                >
                  {showRewriteSources ? 'Hide' : 'Show'}
                </Button>
              </div>

              {/* Auto-analyze toggle */}
              <label className="flex items-start gap-2.5 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={autoAnalyzeMode}
                  onChange={(e) => setAutoAnalyzeMode(e.target.checked)}
                  disabled={generating}
                  className="mt-0.5 accent-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 rounded-sm"
                />
                <div>
                  <div className="text-xs font-medium text-white/90">AI auto-identifies gaps</div>
                  <div className="text-xs sm:text-[11px] text-white/60 sm:text-white/50 mt-0.5">Let the AI find non-conformances in the selected section before rewriting. Best for unaudited manuals.</div>
                </div>
              </label>

              {!autoAnalyzeMode && showRewriteSources && (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <div className="text-xs sm:text-[11px] text-white/60 sm:text-white/50 mb-2">Import findings from prior audits to drive the rewrite:</div>

                  {/* Simulation results */}
                  {simulationResults.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-white/70 mb-1.5">Audit Simulations</div>
                      <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
                        {simulationResults.map((sim: any) => {
                          const discCount = (sim.discrepancies || []).length;
                          const checked = selectedSimIds.includes(sim._id);
                          return (
                            <label key={sim._id} className="flex items-center gap-2 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedSimIds((prev) =>
                                    checked ? prev.filter((id) => id !== sim._id) : [...prev, sim._id]
                                  )
                                }
                                disabled={generating}
                                className="accent-amber-400 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 rounded-sm"
                              />
                              <span className="text-[11px] text-white/70 group-hover:text-white/90 transition-colors truncate flex-1">{sim.name || 'Unnamed simulation'}</span>
                              {discCount > 0 && (
                                <Badge variant="outline" size="sm" className="flex-shrink-0 text-[10px]">
                                  {discCount} findings
                                </Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Paperwork reviews */}
                  {documentReviews.filter((r: any) => r.status === 'completed').length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeReviewFindings}
                        onChange={(e) => setIncludeReviewFindings(e.target.checked)}
                        disabled={generating}
                        className="accent-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 rounded-sm"
                      />
                      <div>
                        <div className="text-[11px] text-white/80">Paperwork Review Findings</div>
                        <div className="text-[11px] sm:text-[10px] text-white/50 sm:text-white/40">{documentReviews.filter((r: any) => r.status === 'completed').length} completed review{documentReviews.filter((r: any) => r.status === 'completed').length !== 1 ? 's' : ''}</div>
                      </div>
                    </label>
                  )}

                  {/* Active CARs */}
                  {entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeCars}
                        onChange={(e) => setIncludeCars(e.target.checked)}
                        disabled={generating}
                        className="accent-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 rounded-sm"
                      />
                      <div>
                        <div className="text-[11px] text-white/80">Active CARs / NCRs</div>
                        <div className="text-[11px] sm:text-[10px] text-white/50 sm:text-white/40">{entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length} open item{entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length !== 1 ? 's' : ''}</div>
                      </div>
                    </label>
                  )}

                  {simulationResults.length === 0 && documentReviews.filter((r: any) => r.status === 'completed').length === 0 && entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length === 0 && (
                    <p className="text-[11px] text-white/40 italic">No audit results found for this project. Run an audit simulation or enable Auto-analyze above.</p>
                  )}
                </div>
              )}
              {!autoAnalyzeMode && !showRewriteSources && (
                <p className="text-[11px] text-white/45">
                  Optional imported findings are hidden. Click Show to include simulations, paperwork reviews, and CARs.
                </p>
              )}
            </GlassCard>
          )}

          {/* Section TOC */}
          <GlassCard padding="sm" border className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80">Sections</div>
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="text-xs text-sky-lighter hover:text-white transition-colors flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 rounded"
              >
                <FiPlus className="text-[10px]" />
                Custom
              </button>
            </div>

            {/* Completeness progress bar */}
            {sectionTemplates.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-[11px] text-white/50 mb-1">
                  <span>{approvedCount} / {sectionTemplates.length} approved</span>
                  {draftCount > 0 && <span className="text-amber-400/70">{draftCount} draft</span>}
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500/70 transition-all duration-300"
                    style={{ width: `${(approvedCount / sectionTemplates.length) * 100}%` }}
                  />
                  <div
                    className="h-full bg-amber-400/60 transition-all duration-300"
                    style={{ width: `${(draftCount / sectionTemplates.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {showCustomInput && (
              <input
                type="text"
                value={customSectionTitle}
                onChange={(e) => setCustomSectionTitle(e.target.value)}
                placeholder="Custom section title..."
                className="w-full mb-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
              />
            )}

            <input
              type="text"
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
              placeholder="Search sections or citations..."
              className="w-full mb-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
            />

            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-0.5 relative">
              <div className="sticky top-0 h-3 bg-gradient-to-b from-navy-900/70 to-transparent pointer-events-none z-[1]" />
              {filteredSectionTemplates.map(({ sec, idx }) => {
                const completionStatus = sectionCompletionMap[sec.title] ?? 'missing';
                return (
                  <button
                    key={`${sec.title}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedSectionIdx(idx);
                      setShowCustomInput(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.995] ${
                      !showCustomInput && selectedSectionIdx === idx
                        ? 'bg-sky/20 text-white border border-sky-light/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {/* Status dot */}
                      <div
                        className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                          completionStatus === 'approved'
                            ? 'bg-emerald-400'
                            : completionStatus === 'draft'
                              ? 'bg-amber-400'
                              : 'bg-white/20'
                        }`}
                        title={completionStatus === 'approved' ? 'Approved' : completionStatus === 'draft' ? 'Draft saved' : 'Not started'}
                      />
                      <span className="font-medium truncate">{sec.title}</span>
                    </div>
                    {sec.number && <div className="text-[11px] sm:text-[10px] text-white/50 sm:text-white/40 mt-0.5 pl-3">{sec.number}</div>}
                  </button>
                );
              })}
              {filteredSectionTemplates.length === 0 && (
                <p className="text-[11px] text-white/40 px-2 py-2">No sections match this search.</p>
              )}
              <div className="sticky bottom-0 h-3 bg-gradient-to-t from-navy-900/70 to-transparent pointer-events-none z-[1]" />
            </div>

            {/* Per-section override controls — shown when a section is selected */}
            {!showCustomInput && selectedSection && (
              <div className="mt-2 pt-2 border-t border-white/10 space-y-2">
                <div className="text-[11px] text-white/40 font-medium">Override for selected section</div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-white/55 flex-shrink-0 w-12">Tone</label>
                  <select
                    value={sectionToneOverrides[selectedSection.title] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value as WritingStyle | '';
                      setSectionToneOverrides((prev) => {
                        const next = { ...prev };
                        if (!val) delete next[selectedSection.title];
                        else next[selectedSection.title] = val;
                        return next;
                      });
                    }}
                    disabled={generating}
                    className="flex-1 bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-light/60 disabled:opacity-50"
                  >
                    <option value="" className="bg-navy-800 text-white">— Inherit global —</option>
                    {WRITING_STYLES.map((s) => (
                      <option key={s.id} value={s.id} className="bg-navy-800 text-white">{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-white/55 flex-shrink-0 w-12">Citations</label>
                  <select
                    value={
                      sectionCitationOverrides[selectedSection.title] === undefined
                        ? ''
                        : sectionCitationOverrides[selectedSection.title] === null
                          ? ''
                          : sectionCitationOverrides[selectedSection.title]
                            ? 'on'
                            : 'off'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setSectionCitationOverrides((prev) => {
                        const next = { ...prev };
                        if (val === '') delete next[selectedSection.title];
                        else next[selectedSection.title] = val === 'on';
                        return next;
                      });
                    }}
                    disabled={generating}
                    className="flex-1 bg-white/10 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-sky-light/60 disabled:opacity-50"
                  >
                    <option value="" className="bg-navy-800 text-white">— Inherit global —</option>
                    <option value="on" className="bg-navy-800 text-white">On</option>
                    <option value="off" className="bg-navy-800 text-white">Off</option>
                  </select>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {/* CENTER PANEL: Output */}
        <div className="flex flex-col gap-3 min-h-0 max-h-none lg:max-h-none overflow-hidden">
          <GlassCard padding="sm" border className="flex-1 min-h-0 flex flex-col">
            <div className="sticky top-0 z-10 -mx-1 px-1 py-1 mb-3 bg-navy-900/70 backdrop-blur supports-[backdrop-filter]:bg-navy-900/60 lg:static lg:mx-0 lg:px-0 lg:py-0 lg:bg-transparent lg:backdrop-blur-none">
              <div className="flex items-center justify-between">
              <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 flex items-center gap-2">
                <FiBookOpen className="text-sky-lighter" />
                {sectionTitle || 'Select a section'}
                {sectionNumber && (
                  <Badge variant="outline" size="sm">
                    {sectionNumber}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {generatedText && !generating && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(generatedText)}
                      title="Copy to clipboard"
                    >
                      <FiCopy className="mr-1" /> Copy
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSave}>
                      <FiCheck className="mr-1" /> Save Draft
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant={generating ? 'ghost' : 'primary'}
                  onClick={handleRequestGenerate}
                  disabled={generating || !sectionTitle.trim() || (mode === 'rewrite' && !sourceDocId)}
                className={mode === 'rewrite' && !generating ? 'bg-amber-500/20 border-amber-400/40 hover:bg-amber-500/30 text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.15)] focus-visible:ring-2 focus-visible:ring-amber-300/60 active:scale-[0.99]' : 'focus-visible:ring-2 focus-visible:ring-sky-lighter/60 active:scale-[0.99]'}
                >
                  {generating ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                      {mode === 'rewrite' ? 'Rewriting...' : 'Generating...'}
                    </>
                  ) : generatedText ? (
                    <>
                      <FiRefreshCw className="mr-1" /> {mode === 'rewrite' ? 'Rewrite Again' : 'Regenerate'}
                    </>
                  ) : mode === 'rewrite' ? (
                    <>
                      <FiTool className="mr-1" /> Rewrite Section
                    </>
                  ) : (
                    <>
                      <FiZap className="mr-1" /> Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
            </div>

            {mode === 'rewrite' && !sourceDocId && (
              <div className="mb-3 px-3 py-2 rounded-lg border border-amber-400/25 bg-amber-500/10 text-[11px] text-amber-200/85">
                Rewrite mode requires a source manual. Select it in the left panel before running Rewrite Section.
              </div>
            )}

            {/* Start from prior approved — shown when prior approved sections exist */}
            {approvedPrior.length > 0 && !generatedText && !generating && (
              <div className="mb-3 px-3 py-2 rounded-lg border border-sky-light/20 bg-sky/10 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-sky-lighter">Prior approved version available</div>
                  <div className="text-[10px] text-white/50">{approvedPrior.length} approved section{approvedPrior.length > 1 ? 's' : ''} from similar manuals</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const first = approvedPrior[0];
                    if (first) setGeneratedText(first.generatedContent);
                    toast.success('Loaded prior approved version');
                  }}
                  className="text-sky-lighter flex-shrink-0 text-[11px]"
                >
                  Use as starting point
                </Button>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin relative">
              <div className="sticky top-0 h-3 bg-gradient-to-b from-navy-900/60 to-transparent pointer-events-none z-[1]" />
              {displayText ? (
                <div className="whitespace-pre-wrap text-sm text-white/90 leading-relaxed font-mono px-1">
                  {displayText}
                  {generating && <span className="inline-block w-1.5 h-4 bg-sky-lighter animate-pulse ml-0.5 align-middle" />}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-white/40 gap-3 py-12">
                  <FiEdit className="text-3xl" />
                  <p className="text-sm text-center max-w-xs">
                    {mode === 'rewrite'
                      ? 'Choose the non-conforming source document and section, then click Rewrite Section to produce a compliant replacement.'
                      : 'Select a manual type, standards, and section — then click Generate to create a compliant manual section.'}
                  </p>
                </div>
              )}
              <div className="sticky bottom-0 h-3 bg-gradient-to-t from-navy-900/60 to-transparent pointer-events-none z-[1]" />
            </div>
          </GlassCard>

          {/* Saved sections */}
          {savedSections.length > 0 && (
            <GlassCard padding="sm" border className="max-h-none md:max-h-60 overflow-y-auto scrollbar-thin">
              <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 mb-2 flex items-center gap-2">
                <FiFileText className="text-sky-lighter" />
                Saved Sections ({savedSections.length})
              </div>
              <div className="space-y-1.5">
                {savedSections.map((sec: any) => (
                  <div
                    key={sec._id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">{sec.sectionTitle}</div>
                      <div className="text-[11px] sm:text-[10px] text-white/50 sm:text-white/40 flex items-center gap-2">
                        {sec.sectionNumber && <span>{sec.sectionNumber}</span>}
                        <Badge
                          variant={sec.status === 'approved' ? 'success' : 'outline'}
                          size="sm"
                        >
                          {sec.status}
                        </Badge>
                        {sec.activeStandards?.length > 0 && (
                          <span>{sec.activeStandards.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadSavedSection(sec)}
                        className="p-1.5 sm:p-1 text-white/40 hover:text-sky-lighter transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.96]"
                        title="Load draft into editor"
                      >
                        <FiChevronDown className="text-xs" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(sec.generatedContent)}
                        className="p-1.5 sm:p-1 text-white/40 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.96]"
                        title="Copy"
                      >
                        <FiCopy className="text-xs" />
                      </button>
                      {sec.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleApprove(sec._id)}
                          className="p-1.5 sm:p-1 text-white/40 hover:text-emerald-400 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 active:scale-[0.96]"
                          title="Approve"
                        >
                          <FiCheck className="text-xs" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(sec._id)}
                        className="p-1.5 sm:p-1 text-white/40 hover:text-red-400 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 active:scale-[0.96]"
                        title="Delete"
                      >
                        <FiTrash2 className="text-xs" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        {/* RIGHT PANEL: Data sources */}
        <div className="flex flex-col gap-3 overflow-y-auto scrollbar-thin min-h-0 max-h-none lg:max-h-none">
          <GlassCard padding="sm" border>
            <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 mb-2">Active Standards</div>
            <div className="space-y-1">
              {activeStandards.length === 0 ? (
                <p className="text-sm sm:text-xs text-white/55 sm:text-white/40">No standards selected</p>
              ) : (
                activeStandards.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-lighter flex-shrink-0" />
                    <span className="text-white/70">{s.label}</span>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          <GlassCard padding="sm" border>
            <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 mb-2">Data Sources</div>
            {dataSourcesToShow.length === 0 ? (
              <div className="space-y-1.5">
                <p className="text-sm sm:text-xs text-white/55 sm:text-white/40">Generate a section to see data sources used</p>
                <p className="text-[11px] sm:text-[10px] text-white/45 sm:text-white/35">
                  Tip: add standards KB docs and reference manuals for more complete citations and structure.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {dataSourcesToShow.map((ds) => (
                  <div key={ds.label} className="flex items-center justify-between text-xs">
                    <span className="text-white/60">{ds.label}</span>
                    <span className={`font-mono ${ds.count === 'none' || ds.count === 0 ? 'text-white/30' : 'text-sky-lighter'}`}>
                      {String(ds.count)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard padding="sm" border>
            <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 mb-2">Project Context</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-white/60">Entity documents</span>
                <span className="text-white/40 font-mono">{entityDocs.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Assessments</span>
                <span className="text-white/40 font-mono">{assessments.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Active CARs</span>
                <span className="text-white/40 font-mono">
                  {entityIssues.filter((i: any) => {
                    const st = i.status ?? 'open';
                    return st !== 'closed' && st !== 'voided';
                  }).length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60">Paperwork reviews</span>
                <span className="text-white/40 font-mono">
                  {documentReviews.filter((r: any) => r.status === 'completed').length}
                </span>
              </div>
            </div>
          </GlassCard>

          <GlassCard padding="sm" border>
            <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 mb-2">Reference Manuals</div>
            {allRefDocs.filter((d: any) => d.documentType === manualType.refDocType).length === 0 ? (
              <div className="flex items-start gap-1.5 text-xs text-amber-400/80">
                <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
                <span>No reference {manualType.label} uploaded. Upload in Admin for best results.</span>
              </div>
            ) : (
              <div className="space-y-1">
                {allRefDocs
                  .filter((d: any) => d.documentType === manualType.refDocType)
                  .map((d: any) => (
                    <div key={d._id} className="text-xs text-white/60 truncate">
                      {d.name}
                    </div>
                  ))}
              </div>
            )}
          </GlassCard>

          {/* Regulatory Updates panel */}
          <GlassCard padding="sm" border>
            <div className="flex items-center justify-between mb-2">
              <div className="text-base sm:text-sm font-medium text-white/90 sm:text-white/80 flex items-center gap-1.5">
                <FiShield className="text-sky-lighter" />
                Regulatory Updates
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCheckRegUpdates}
                disabled={checkingRegUpdates || generating}
                title="Check eCFR for amendments to the relevant CFR parts"
              >
                {checkingRegUpdates ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <FiRefreshCw className="text-xs" />
                )}
              </Button>
            </div>

            {!regUpdateResult && !checkingRegUpdates && (
              <p className="text-sm sm:text-xs text-white/55 sm:text-white/40">
                Click refresh to check whether any {manualType.cfrParts.map((p) => `Part ${p}`).join(' / ')} regulations have been amended since your sections were written.
              </p>
            )}

            {checkingRegUpdates && (
              <p className="text-xs text-white/50 animate-pulse">Checking eCFR for amendments…</p>
            )}

            {regUpdateResult && (
              <div className="space-y-2">
                {/* Per-part status rows */}
                <div className="space-y-1">
                  {regUpdateResult.parts.map((p) => (
                    <div key={p.part} className="flex items-center justify-between text-xs">
                      <span className="text-white/60">{p.citation}</span>
                      <div className="flex items-center gap-1.5">
                        {p.lastAmendedOn && (
                          <span className="text-white/30 font-mono text-[10px]">{p.lastAmendedOn}</span>
                        )}
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            p.status === 'current'
                              ? 'bg-emerald-400'
                              : p.status === 'updated'
                                ? 'bg-amber-400'
                                : 'bg-white/20'
                          }`}
                          title={
                            p.status === 'current'
                              ? 'No changes since your sections were written'
                              : p.status === 'updated'
                                ? 'This part was amended after your sections were written'
                                : 'Amendment date unavailable'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sections to review */}
                {regUpdateResult.sectionsToReview.length > 0 ? (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="flex items-center gap-1 text-xs text-amber-400/90 mb-1 font-medium">
                      <FiAlertTriangle className="text-[10px]" />
                      Sections to review ({regUpdateResult.sectionsToReview.length})
                    </div>
                    <div className="space-y-0.5">
                      {regUpdateResult.sectionsToReview.map((title) => (
                        <div key={title} className="text-xs text-white/60 truncate pl-2">• {title}</div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => handleCopy(regUpdateResult.sectionsToReview.join('\n'))}
                    >
                      <FiCopy className="mr-1" /> Copy review list
                    </Button>
                    <p className="text-[10px] text-white/45 mt-1">
                      Next step: update each listed section, approve as needed, then run this check again.
                    </p>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-emerald-400/80 flex items-center gap-1">
                    <FiCheck className="text-[10px]" />
                    All sections are current
                  </div>
                )}

                {/* Claude's change summary */}
                {regUpdateResult.summary && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="text-[10px] text-white/50 leading-relaxed whitespace-pre-wrap">
                      {regUpdateResult.summary}
                    </div>
                  </div>
                )}

                {/* Checked-at timestamp */}
                <div className="flex items-center gap-1 text-[10px] text-white/25 mt-1">
                  <FiClock className="text-[9px]" />
                  Checked {new Date(regUpdateResult.checkedAt).toLocaleString()}
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Export DOCX modal */}
      <ManualExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        approvedSections={approvedForExport.map((s: any) => ({
          sectionTitle: s.sectionTitle,
          sectionNumber: s.sectionNumber,
          generatedContent: s.generatedContent,
          cfrRefs: s.cfrRefs,
          status: s.status,
          updatedAt: s.updatedAt,
        } as ExportManualSection))}
        manualTypeId={manualTypeId}
        manualTypeLabel={manualType.label}
        standards={activeStandards.map((s) => s.label)}
        companyName={
          (assessments[assessments.length - 1]?.data as any)?.companyName || 'Organization'
        }
        revision="Rev 0"
        model={model}
        changeLog={[]}
        formatConfig={{ font: fontChoice as any, margins: marginsChoice as any }}
      />

      {/* Pre-generation interview modal */}
      <PreGenerationInterviewModal
        open={interviewOpen}
        loading={interviewLoading}
        sectionTitle={sectionTitle}
        questions={interviewQuestions}
        answers={interviewAnswers}
        onAnswerChange={(i, val) =>
          setInterviewAnswers((prev) => {
            const next = [...prev];
            next[i] = val;
            return next;
          })
        }
        onConfirm={() => handleConfirmInterview(interviewAnswers)}
        onSkip={() => handleConfirmInterview([])}
        onClose={() => setInterviewOpen(false)}
      />
    </div>
  );
}
