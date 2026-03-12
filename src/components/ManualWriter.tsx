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
  useAllSharedReferenceDocs,
  useManualSections,
  useApprovedSectionsByType,
  useAddManualSection,
  useUpdateManualSection,
  useRemoveManualSection,
  useDefaultClaudeModel,
} from '../hooks/useConvexData';
import {
  AVAILABLE_STANDARDS,
  MANUAL_TYPES,
  getSectionTemplates,
  fetchCfrForManualType,
  buildManualWriterSystemPrompt,
  generateManualSection,
  type ManualWriterContext,
  type StandardDefinition,
  type ManualTypeDefinition,
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

  // Rewrite mode state
  const [mode, setMode] = useState<'generate' | 'rewrite'>('generate');
  const [autoAnalyzeMode, setAutoAnalyzeMode] = useState(true);
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

  // Mutations
  const addSection = useAddManualSection();
  const updateSection = useUpdateManualSection();
  const removeSection = useRemoveManualSection();

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

  // KB docs for active standards
  const kbAgentIds = useMemo(
    () => [...new Set(activeStandards.map((s) => s.agentKbId).concat('audit-intelligence-analyst'))],
    [activeStandards]
  );
  const sharedKbDocs = (useSharedAgentDocsByAgents(kbAgentIds) || []) as any[];

  // Saved sections for current project
  const savedSections = (useManualSections(activeProjectId || undefined, manualTypeId) || []) as any[];
  const approvedPrior = (useApprovedSectionsByType(manualTypeId, sectionNumber) || []) as any[];

  // Missing KB warnings
  const missingKbStandards = useMemo(() => {
    return activeStandards.filter((s) => {
      const hasDocs = sharedKbDocs.some(
        (d: any) => d.agentId === s.agentKbId && (d.extractedText || '').length > 0
      );
      return !hasDocs;
    });
  }, [activeStandards, sharedKbDocs]);

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

  const handleGenerate = useCallback(async () => {
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

      const standardsKbEntries = sharedKbDocs.filter(
        (d: any) => d.agentId !== 'audit-intelligence-analyst' && (d.extractedText || '').length > 0
      );
      const standardsKbText = standardsKbEntries.map((d: any) => `--- ${d.name} (${d.agentId}) ---\n${d.extractedText}`).join('\n\n');

      const intelDocs = sharedKbDocs.filter(
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
    activeStandards, allRefDocs, sharedKbDocs, approvedPrior, entityIssues,
    documentReviews, simulationResults, sourceDocId, allDocs, assessments, model,
    mode, autoAnalyzeMode, selectedSimIds, includeReviewFindings, includeCars,
  ]);

  const handleSave = useCallback(async () => {
    if (!generatedText || !activeProjectId) return;
    try {
      await addSection({
        projectId: activeProjectId as any,
        manualType: manualTypeId,
        sectionTitle,
        sectionNumber,
        generatedContent: generatedText,
        activeStandards: activeStandardIds,
      });
      toast.success('Section saved as draft');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  }, [generatedText, activeProjectId, manualTypeId, sectionTitle, sectionNumber, activeStandardIds, addSection]);

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
      <div ref={containerRef} className="p-6 lg:p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-display font-bold text-white mb-4">Manual Writer</h1>
        <GlassCard padding="lg">
          <p className="text-white/70 text-center py-12">Select a project to begin writing manual sections.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-4 lg:p-6 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <FiEdit className="text-sky-lighter text-xl" />
          <h1 className="text-xl lg:text-2xl font-display font-bold text-white">Manual Writer</h1>
        </div>
        <PageModelSelector field="claudeModel" compact disabled={generating} />
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_260px] gap-4">
        {/* LEFT PANEL: Config */}
        <div className="flex flex-col gap-3 overflow-y-auto min-h-0 pr-1">
          {/* Mode toggle */}
          <GlassCard padding="sm" border>
            <div className="text-xs font-medium text-white/60 mb-2">Mode</div>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              <button
                type="button"
                onClick={() => setMode('generate')}
                disabled={generating}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
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
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
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
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
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
              label={mode === 'rewrite' ? 'Non-Conforming Manual *' : 'Source Document (optional)'}
              selectSize="sm"
              value={sourceDocId}
              onChange={(e) => setSourceDocId(e.target.value)}
              disabled={generating}
            >
              <option value="" className="bg-navy-800 text-white">
                {mode === 'rewrite' ? '— Select the manual to rewrite —' : 'None — write from scratch'}
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
              <p className="mt-1.5 text-[11px] text-amber-400/70">Select the document you want to fix. Upload it in the Library if it is not listed.</p>
            )}
          </GlassCard>

          {/* Non-Conformance Sources — shown only in rewrite mode */}
          {mode === 'rewrite' && (
            <GlassCard padding="sm" border>
              <div className="flex items-center gap-2 mb-3">
                <FiList className="text-amber-300 text-sm" />
                <div className="text-sm font-medium text-white/80">Non-Conformance Sources</div>
              </div>

              {/* Auto-analyze toggle */}
              <label className="flex items-start gap-2.5 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={autoAnalyzeMode}
                  onChange={(e) => setAutoAnalyzeMode(e.target.checked)}
                  disabled={generating}
                  className="mt-0.5 accent-amber-400"
                />
                <div>
                  <div className="text-xs font-medium text-white/90">AI auto-identifies gaps</div>
                  <div className="text-[11px] text-white/50 mt-0.5">Let the AI find non-conformances in the selected section before rewriting. Best for unaudited manuals.</div>
                </div>
              </label>

              {!autoAnalyzeMode && (
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <div className="text-[11px] text-white/50 mb-2">Import findings from prior audits to drive the rewrite:</div>

                  {/* Simulation results */}
                  {simulationResults.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-white/70 mb-1.5">Audit Simulations</div>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
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
                                className="accent-amber-400 flex-shrink-0"
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
                        className="accent-amber-400"
                      />
                      <div>
                        <div className="text-[11px] text-white/80">Paperwork Review Findings</div>
                        <div className="text-[10px] text-white/40">{documentReviews.filter((r: any) => r.status === 'completed').length} completed review{documentReviews.filter((r: any) => r.status === 'completed').length !== 1 ? 's' : ''}</div>
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
                        className="accent-amber-400"
                      />
                      <div>
                        <div className="text-[11px] text-white/80">Active CARs / NCRs</div>
                        <div className="text-[10px] text-white/40">{entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length} open item{entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length !== 1 ? 's' : ''}</div>
                      </div>
                    </label>
                  )}

                  {simulationResults.length === 0 && documentReviews.filter((r: any) => r.status === 'completed').length === 0 && entityIssues.filter((i: any) => { const st = i.status ?? 'open'; return st !== 'closed' && st !== 'voided'; }).length === 0 && (
                    <p className="text-[11px] text-white/40 italic">No audit results found for this project. Run an audit simulation or enable Auto-analyze above.</p>
                  )}
                </div>
              )}
            </GlassCard>
          )}

          {/* Section TOC */}
          <GlassCard padding="sm" border className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-white/80">Sections</div>
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="text-xs text-sky-lighter hover:text-white transition-colors flex items-center gap-1"
              >
                <FiPlus className="text-[10px]" />
                Custom
              </button>
            </div>

            {showCustomInput && (
              <input
                type="text"
                value={customSectionTitle}
                onChange={(e) => setCustomSectionTitle(e.target.value)}
                placeholder="Custom section title..."
                className="w-full mb-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light/50"
              />
            )}

            <div className="flex-1 overflow-y-auto space-y-0.5">
              {sectionTemplates.map((sec, idx) => (
                <button
                  key={`${sec.title}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedSectionIdx(idx);
                    setShowCustomInput(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    !showCustomInput && selectedSectionIdx === idx
                      ? 'bg-sky/20 text-white border border-sky-light/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="font-medium truncate">{sec.title}</div>
                  {sec.number && <div className="text-[10px] text-white/40 mt-0.5">{sec.number}</div>}
                </button>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* CENTER PANEL: Output */}
        <div className="flex flex-col gap-3 min-h-0">
          <GlassCard padding="sm" border className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-white/80 flex items-center gap-2">
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
                  onClick={handleGenerate}
                  disabled={generating || !sectionTitle.trim() || (mode === 'rewrite' && !sourceDocId)}
                  className={mode === 'rewrite' && !generating ? 'bg-amber-500/20 border-amber-400/40 hover:bg-amber-500/30 text-amber-200' : ''}
                >
                  {generating ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                      {mode === 'rewrite' ? 'Rewriting...' : 'Generating...'}
                    </>
                  ) : generatedText ? (
                    <>
                      <FiRefreshCw className="mr-1" /> {mode === 'rewrite' ? 'Re-Rewrite' : 'Regenerate'}
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

            <div className="flex-1 min-h-0 overflow-y-auto">
              {displayText ? (
                <div className="whitespace-pre-wrap text-sm text-white/90 leading-relaxed font-mono px-1">
                  {displayText}
                  {generating && <span className="inline-block w-1.5 h-4 bg-sky-lighter animate-pulse ml-0.5 align-middle" />}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-white/40 gap-3 py-12">
                  <FiEdit className="text-3xl" />
                  <p className="text-sm text-center max-w-xs">
                    Select a manual type, standards, and section — then click Generate to create a compliant manual section.
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Saved sections */}
          {savedSections.length > 0 && (
            <GlassCard padding="sm" border className="max-h-60 overflow-y-auto">
              <div className="text-sm font-medium text-white/80 mb-2 flex items-center gap-2">
                <FiFileText className="text-sky-lighter" />
                Saved Sections ({savedSections.length})
              </div>
              <div className="space-y-1.5">
                {savedSections.map((sec: any) => (
                  <div
                    key={sec._id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">{sec.sectionTitle}</div>
                      <div className="text-[10px] text-white/40 flex items-center gap-2">
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
                        onClick={() => handleCopy(sec.generatedContent)}
                        className="p-1 text-white/40 hover:text-white transition-colors"
                        title="Copy"
                      >
                        <FiCopy className="text-xs" />
                      </button>
                      {sec.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => handleApprove(sec._id)}
                          className="p-1 text-white/40 hover:text-emerald-400 transition-colors"
                          title="Approve"
                        >
                          <FiCheck className="text-xs" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(sec._id)}
                        className="p-1 text-white/40 hover:text-red-400 transition-colors"
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
        <div className="flex flex-col gap-3 overflow-y-auto min-h-0">
          <GlassCard padding="sm" border>
            <div className="text-sm font-medium text-white/80 mb-2">Active Standards</div>
            <div className="space-y-1">
              {activeStandards.length === 0 ? (
                <p className="text-xs text-white/40">No standards selected</p>
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
            <div className="text-sm font-medium text-white/80 mb-2">Data Sources</div>
            {dataSourcesToShow.length === 0 ? (
              <p className="text-xs text-white/40">Generate a section to see data sources used</p>
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
            <div className="text-sm font-medium text-white/80 mb-2">Project Context</div>
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
            <div className="text-sm font-medium text-white/80 mb-2">Reference Manuals</div>
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
              <div className="text-sm font-medium text-white/80 flex items-center gap-1.5">
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
              <p className="text-xs text-white/40">
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
    </div>
  );
}
