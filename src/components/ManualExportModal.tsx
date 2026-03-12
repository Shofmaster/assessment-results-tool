import { useState, useCallback } from 'react';
import {
  FiX,
  FiDownload,
  FiRefreshCw,
  FiPlus,
  FiTrash2,
  FiBookOpen,
  FiCheck,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { Button, GlassCard, Badge } from './ui';
import { ManualDocxGenerator } from '../services/manualDocxGenerator';
import type {
  ManualExportConfig,
  ManualExportData,
  ManualDefinition,
  ManualSection,
} from '../services/manualDocxGenerator';
import { generateDefinitions } from '../services/manualWriterService';

interface ManualExportModalProps {
  open: boolean;
  onClose: () => void;
  approvedSections: ManualSection[];
  manualTypeId: string;
  manualTypeLabel: string;
  standards: string[];
  companyName: string;
  revision: string;
  model: string;
  changeLog: Array<{ section: string; description: string; date: string }>;
  savedDefinitions?: ManualDefinition[];
  onSaveDefinitions?: (defs: ManualDefinition[]) => void;
}

export default function ManualExportModal({
  open,
  onClose,
  approvedSections,
  manualTypeId,
  manualTypeLabel,
  standards,
  companyName,
  revision,
  model,
  changeLog,
  savedDefinitions,
  onSaveDefinitions,
}: ManualExportModalProps) {
  const [config, setConfig] = useState<ManualExportConfig>({
    includeCoverPage: true,
    includeLEP: true,
    includeTOC: true,
    includeDefinitions: true,
    includeAppendix: true,
    appendixIncludeCfrRefs: true,
    appendixIncludeStandardsXref: true,
    appendixIncludeChangeLog: changeLog.length > 0,
    appendixCustomText: '',
  });

  const [definitions, setDefinitions] = useState<ManualDefinition[]>(savedDefinitions || []);
  const [generatingDefs, setGeneratingDefs] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [newDef, setNewDef] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const [manualTitle, setManualTitle] = useState(
    `${companyName} ${manualTypeLabel}`
  );
  const [manualCompany, setManualCompany] = useState(companyName);
  const [manualRevision, setManualRevision] = useState(revision || 'Rev 0');

  const handleGenerateDefinitions = useCallback(async () => {
    if (approvedSections.length === 0) {
      toast.error('No approved sections to extract definitions from');
      return;
    }
    setGeneratingDefs(true);
    try {
      const texts = approvedSections.map((s) => s.generatedContent);
      const defs = await generateDefinitions(texts, manualTypeLabel, model);
      if (defs.length === 0) {
        toast.info('No definitions extracted — try adding some manually');
      } else {
        setDefinitions((prev) => {
          const existing = new Set(prev.map((d) => d.term.toLowerCase()));
          const newDefs = defs.filter((d) => !existing.has(d.term.toLowerCase()));
          return [...prev, ...newDefs].sort((a, b) =>
            a.term.toLowerCase().localeCompare(b.term.toLowerCase())
          );
        });
        toast.success(`Extracted ${defs.length} definitions`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate definitions';
      toast.error(msg);
    } finally {
      setGeneratingDefs(false);
    }
  }, [approvedSections, manualTypeLabel, model]);

  const handleAddDefinition = useCallback(() => {
    if (!newTerm.trim() || !newDef.trim()) return;
    setDefinitions((prev) =>
      [...prev, { term: newTerm.trim(), definition: newDef.trim() }].sort(
        (a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase())
      )
    );
    setNewTerm('');
    setNewDef('');
  }, [newTerm, newDef]);

  const handleRemoveDefinition = useCallback((idx: number) => {
    setDefinitions((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleUpdateDefinition = useCallback(
    (idx: number, field: 'term' | 'definition', value: string) => {
      setDefinitions((prev) =>
        prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d))
      );
    },
    []
  );

  const handleExport = useCallback(async () => {
    if (approvedSections.length === 0) {
      toast.error('No approved sections to export');
      return;
    }

    setExporting(true);
    try {
      const data: ManualExportData = {
        companyName: manualCompany,
        manualTitle,
        manualType: manualTypeLabel,
        revision: manualRevision,
        date: new Date().toLocaleDateString(),
        standards,
        sections: approvedSections,
        definitions,
        changeLog,
      };

      const generator = new ManualDocxGenerator();
      const blob = await generator.generate(config, data);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = manualTitle.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
      a.download = `${safeTitle}_${manualRevision.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onSaveDefinitions?.(definitions);
      toast.success('Manual exported as DOCX');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }, [
    approvedSections, config, definitions, manualCompany, manualTitle,
    manualTypeLabel, manualRevision, standards, changeLog, onSaveDefinitions,
  ]);

  if (!open) return null;

  const approvedCount = approvedSections.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <FiDownload className="text-sky-lighter text-lg" />
            <h2 className="text-lg font-display font-bold text-white">Export Manual as DOCX</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10"
          >
            <FiX className="text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Manual metadata */}
          <div>
            <div className="text-sm font-medium text-white/80 mb-3">Manual Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-white/50 block mb-1">Manual Title</label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light/50"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/50 block mb-1">Company Name</label>
                <input
                  type="text"
                  value={manualCompany}
                  onChange={(e) => setManualCompany(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light/50"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/50 block mb-1">Revision</label>
                <input
                  type="text"
                  value={manualRevision}
                  onChange={(e) => setManualRevision(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light/50"
                />
              </div>
            </div>
          </div>

          {/* Section toggles */}
          <div>
            <div className="text-sm font-medium text-white/80 mb-3">Include in Document</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                { key: 'includeCoverPage', label: 'Cover Page' },
                { key: 'includeLEP', label: 'List of Effective Pages' },
                { key: 'includeTOC', label: 'Table of Contents' },
                { key: 'includeDefinitions', label: 'Definitions' },
                { key: 'includeAppendix', label: 'Appendix' },
              ] as const).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:border-white/20 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={config[key]}
                    onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="accent-sky-400"
                  />
                  <span className="text-xs text-white/80">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Appendix options (only if appendix enabled) */}
          {config.includeAppendix && (
            <div className="pl-4 border-l-2 border-sky/20">
              <div className="text-xs font-medium text-white/60 mb-2">Appendix Sections</div>
              <div className="space-y-2">
                {([
                  { key: 'appendixIncludeCfrRefs', label: 'CFR Reference List' },
                  { key: 'appendixIncludeStandardsXref', label: 'Standards Cross-Reference' },
                  { key: 'appendixIncludeChangeLog', label: `Change Log (${changeLog.length} entries)` },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config[key]}
                      onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.checked }))}
                      className="accent-sky-400"
                    />
                    <span className="text-xs text-white/70">{label}</span>
                  </label>
                ))}
                <div>
                  <label className="text-[11px] text-white/50 block mb-1">Custom Appendix Text (optional)</label>
                  <textarea
                    value={config.appendixCustomText}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, appendixCustomText: e.target.value }))
                    }
                    rows={3}
                    placeholder="Any additional text for the appendix..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-light/50 resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Definitions editor */}
          {config.includeDefinitions && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <FiBookOpen className="text-sky-lighter" />
                  Definitions ({definitions.length})
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateDefinitions}
                  disabled={generatingDefs || approvedCount === 0}
                >
                  {generatingDefs ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <FiRefreshCw className="mr-1" /> Auto-Generate
                    </>
                  )}
                </Button>
              </div>

              {definitions.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5 mb-3">
                  {definitions.map((def, idx) => (
                    <div
                      key={`${def.term}-${idx}`}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/5 group"
                    >
                      {editingIdx === idx ? (
                        <div className="flex-1 space-y-1.5">
                          <input
                            type="text"
                            value={def.term}
                            onChange={(e) =>
                              handleUpdateDefinition(idx, 'term', e.target.value)
                            }
                            className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-sky-light/50"
                          />
                          <input
                            type="text"
                            value={def.definition}
                            onChange={(e) =>
                              handleUpdateDefinition(idx, 'definition', e.target.value)
                            }
                            className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-sky-light/50"
                          />
                          <button
                            type="button"
                            onClick={() => setEditingIdx(null)}
                            className="text-[10px] text-sky-lighter hover:text-white"
                          >
                            Done
                          </button>
                        </div>
                      ) : (
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setEditingIdx(idx)}
                        >
                          <div className="text-xs font-medium text-white truncate">
                            {def.term}
                          </div>
                          <div className="text-[11px] text-white/50 line-clamp-2">
                            {def.definition}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveDefinition(idx)}
                        className="p-1 text-white/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                        title="Remove"
                      >
                        <FiTrash2 className="text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add manual definition */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-white/40 block mb-0.5">Term</label>
                  <input
                    type="text"
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    placeholder="e.g. NDT"
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-light/50"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDefinition()}
                  />
                </div>
                <div className="flex-[2]">
                  <label className="text-[10px] text-white/40 block mb-0.5">Definition</label>
                  <input
                    type="text"
                    value={newDef}
                    onChange={(e) => setNewDef(e.target.value)}
                    placeholder="Non-Destructive Testing"
                    className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-light/50"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDefinition()}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAddDefinition}
                  disabled={!newTerm.trim() || !newDef.trim()}
                >
                  <FiPlus />
                </Button>
              </div>
            </div>
          )}

          {/* Sections summary */}
          <GlassCard padding="sm" border>
            <div className="text-xs font-medium text-white/60 mb-2">
              Approved Sections to Export ({approvedCount})
            </div>
            {approvedCount === 0 ? (
              <p className="text-xs text-amber-400/80">
                No approved sections found. Approve sections in the Manual Writer before exporting.
              </p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {approvedSections.map((sec, i) => (
                  <div
                    key={`${sec.sectionTitle}-${i}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <FiCheck className="text-emerald-400 flex-shrink-0" />
                    <span className="text-white/70 truncate">
                      {sec.sectionNumber && (
                        <span className="text-white/40 mr-1">{sec.sectionNumber}</span>
                      )}
                      {sec.sectionTitle}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <div className="text-xs text-white/40">
            {approvedCount} section{approvedCount !== 1 ? 's' : ''} will be exported
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleExport}
              disabled={exporting || approvedCount === 0}
            >
              {exporting ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                  Exporting...
                </>
              ) : (
                <>
                  <FiDownload className="mr-1" /> Export DOCX
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
