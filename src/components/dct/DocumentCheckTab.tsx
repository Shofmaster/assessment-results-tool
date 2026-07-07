import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { FiEye, FiPlayCircle } from 'react-icons/fi';
import { Button, GlassCard } from '../ui';
import { DctContextPill, DctDocumentSummary, DctReferencePills } from '../DctContextUi';
import { ParsedEvidencePanel } from './ParsedEvidencePanel';
import { PageModelSelector } from '../PageModelSelector';
import { AUDIT_AGENTS, DCT_TRACEABILITY_AGENT_IDS } from '../../services/auditAgents';
import { type DctFindingSeverity } from '../../services/dctDocumentCheckEngine';
import { getConvexErrorMessage } from '../../utils/convexError';
import {
  findingSeverityBadgeClass,
  sortFindingsBySeverity,
  statusBadgeClass,
  type DctCheckVerdict,
  type DocumentCheckFinding,
  type DocumentCheckSeverityTotals,
} from '../../utils/dctCompliancePresenter';

/**
 * Document Check tab: run applicable DCT questions against entity/regulatory/SMS
 * manuals, review/edit severity-scored findings, set a verdict, and browse the
 * saved document-check session history.
 */
export function DocumentCheckTab({
  documentCheckRunning,
  applicableRows,
  corpusDocCount,
  documentCheckButtonLabel,
  documentCheckProgress,
  localDctDocumentCheckAgentId,
  setLocalDctDocumentCheckAgentId,
  dctDocumentCheckAgentId,
  upsertUserSettings,
  documentCheckScope,
  setDocumentCheckScope,
  documentCheckNotes,
  setDocumentCheckNotes,
  documentCheckVerdict,
  setDocumentCheckVerdict,
  documentCheckSeverityCounts,
  documentCheckFindings,
  setDocumentCheckFindings,
  enrichedByComparisonId,
  activeDocumentCheckId,
  setActiveDocumentCheckId,
  documentChecks,
  onRunDocumentCheck,
  onCustomizeSelection,
  onSaveDocumentCheck,
  onCompleteDocumentCheck,
  onDownloadPdf,
}: {
  documentCheckRunning: boolean;
  applicableRows: any[];
  /** Number of manual-corpus documents in scope (metadata only — no text is loaded up front). */
  corpusDocCount: number;
  documentCheckButtonLabel: string;
  documentCheckProgress: { processed: number; total: number };
  localDctDocumentCheckAgentId: string;
  setLocalDctDocumentCheckAgentId: (s: string) => void;
  dctDocumentCheckAgentId: string;
  upsertUserSettings: (args: any) => Promise<unknown>;
  documentCheckScope: string;
  setDocumentCheckScope: Dispatch<SetStateAction<string>>;
  documentCheckNotes: string;
  setDocumentCheckNotes: Dispatch<SetStateAction<string>>;
  documentCheckVerdict: DctCheckVerdict;
  setDocumentCheckVerdict: Dispatch<SetStateAction<DctCheckVerdict>>;
  documentCheckSeverityCounts: DocumentCheckSeverityTotals;
  documentCheckFindings: DocumentCheckFinding[];
  setDocumentCheckFindings: Dispatch<SetStateAction<DocumentCheckFinding[]>>;
  enrichedByComparisonId: Map<string, any>;
  activeDocumentCheckId: string | null;
  setActiveDocumentCheckId: (s: string | null) => void;
  documentChecks: any[] | undefined;
  onRunDocumentCheck: () => void | Promise<void>;
  onCustomizeSelection: () => void;
  onSaveDocumentCheck: () => void | Promise<void>;
  onCompleteDocumentCheck: () => void | Promise<void>;
  onDownloadPdf: () => void | Promise<void>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <GlassCard>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FiEye /> Document Check
            </h2>
            <p className="text-xs text-white/60 mt-1">
              Check applicable DCT questions against entity/regulatory/SMS manuals and capture severity-scored findings.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              icon={<FiPlayCircle />}
              onClick={() => void onRunDocumentCheck()}
              disabled={documentCheckRunning || applicableRows.length === 0 || corpusDocCount === 0}
            >
              {documentCheckButtonLabel}
            </Button>
            <button
              type="button"
              onClick={onCustomizeSelection}
              disabled={documentCheckRunning || applicableRows.length === 0 || corpusDocCount === 0}
              className="text-xs text-white/60 underline hover:text-white disabled:opacity-40"
              title="Hand-pick which DCT questions to run"
            >
              Customize selection…
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <GlassCard className="!p-3 border border-white/10">
            <div className="text-[10px] uppercase text-white/50 tracking-wide">Applicable requirements</div>
            <div className="text-xl font-semibold text-white mt-1">{applicableRows.length}</div>
          </GlassCard>
          <GlassCard className="!p-3 border border-white/10">
            <div className="text-[10px] uppercase text-white/50 tracking-wide">Manual documents in scope</div>
            <div className="text-xl font-semibold text-white mt-1">{corpusDocCount}</div>
          </GlassCard>
        </div>

        {documentCheckRunning && documentCheckProgress.total > 0 ? (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-white/60 mb-1">
              <span>Running document check</span>
              <span>
                {documentCheckProgress.processed}/{documentCheckProgress.total}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400/80"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((documentCheckProgress.processed / documentCheckProgress.total) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Perspective</label>
            <select
              value={localDctDocumentCheckAgentId}
              onChange={async (e) => {
                const next = e.target.value;
                setLocalDctDocumentCheckAgentId(next);
                try {
                  await upsertUserSettings({ dctDocumentCheckAgentId: next });
                } catch (err) {
                  toast.error('Failed to save perspective', {
                    description: getConvexErrorMessage(err),
                  });
                  setLocalDctDocumentCheckAgentId(dctDocumentCheckAgentId);
                }
              }}
              disabled={documentCheckRunning}
              className="w-full h-10 px-3 text-sm rounded-lg bg-white/10 border border-white/20 text-white"
            >
              {(DCT_TRACEABILITY_AGENT_IDS as readonly string[]).map((id) => {
                const agent = AUDIT_AGENTS.find((a) => a.id === id);
                const label = id === 'generic' ? 'Generic auditor' : agent?.name ?? id;
                return (
                  <option key={id} value={id} className="bg-navy-800 text-white">
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <PageModelSelector field="dctDocumentCheckModel" />
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Scope</label>
            <textarea
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm min-h-24"
              value={documentCheckScope}
              onChange={(e) => setDocumentCheckScope(e.target.value)}
              placeholder="What sections or requirement domains should this run emphasize?"
            />
          </div>
          <div>
            <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Notes</label>
            <textarea
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm min-h-24"
              value={documentCheckNotes}
              onChange={(e) => setDocumentCheckNotes(e.target.value)}
              placeholder="Optional reviewer notes for this session"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(['pass', 'conditional', 'fail'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setDocumentCheckVerdict(v)}
              className={`px-3 py-1.5 rounded-lg border text-xs uppercase tracking-wide ${
                documentCheckVerdict === v
                  ? v === 'pass'
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : v === 'conditional'
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                      : 'bg-red-500/20 border-red-400/40 text-red-200'
                  : 'bg-white/5 border-white/15 text-white/60'
              }`}
            >
              {v}
            </button>
          ))}
          {documentCheckSeverityCounts.critical > 0 ? (
            <span className="text-xs text-red-200 ml-2">Critical findings present: auto-fail recommended.</span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {(['critical', 'major', 'minor', 'observation'] as const).map((severity) => (
            <div key={severity} className={`rounded-lg border px-3 py-2 ${findingSeverityBadgeClass(severity)}`}>
              <div className="text-[10px] uppercase tracking-wide opacity-80">{severity}</div>
              <div className="text-lg font-semibold mt-0.5">{documentCheckSeverityCounts[severity]}</div>
            </div>
          ))}
        </div>

        <ul className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {sortFindingsBySeverity(documentCheckFindings).map((finding) => {
            const traceRow = enrichedByComparisonId.get(String(finding.comparisonId));
            return (
            <li key={finding.comparisonId} className="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
              <div className="flex items-start gap-2 flex-wrap mb-2">
                <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase shrink-0 ${findingSeverityBadgeClass(finding.severity)}`}>
                  {finding.severity}
                </span>
                <span className="text-[10px] uppercase text-white/50 shrink-0 pt-0.5">{finding.status}</span>
                <div className="min-w-0 flex-1">
                  {traceRow ? (
                    <>
                      <DctContextPill doc={traceRow.dctDocument} />
                      {traceRow.dctDocument.fileName ? (
                        <div className="text-[10px] text-white/40 truncate mt-0.5" title={traceRow.dctDocument.fileName}>
                          {traceRow.dctDocument.fileName}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs text-white/50 truncate block">{finding.dctFileName ?? 'DCT'}</span>
                  )}
                </div>
              </div>
              <div className="text-sm text-white mb-2">{finding.questionText}</div>
              {traceRow ? <DctReferencePills question={traceRow.question} /> : null}
              {traceRow ? (
                <details className="mt-1.5 mb-2">
                  <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                    Full DCT context…
                  </summary>
                  <DctDocumentSummary doc={traceRow.dctDocument} question={traceRow.question} />
                </details>
              ) : null}
              {finding.rationale ? (
                <ParsedEvidencePanel text={finding.rationale} fallbackEvidence={finding.evidenceSnippet} />
              ) : finding.evidenceSnippet ? (
                <p className="text-xs text-white/60 italic">{finding.evidenceSnippet}</p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <select
                  className="bg-white/10 border border-white/15 rounded px-2 py-1 text-xs"
                  value={finding.severity}
                  onChange={(e) =>
                    setDocumentCheckFindings((prev) =>
                      prev.map((row) =>
                        row.comparisonId === finding.comparisonId
                          ? { ...row, severity: e.target.value as DctFindingSeverity }
                          : row,
                      ),
                    )
                  }
                >
                  {['critical', 'major', 'minor', 'observation'].map((s) => (
                    <option key={s} value={s} className="bg-navy-800">
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  className="bg-white/10 border border-white/15 rounded px-2 py-1 text-xs"
                  value={finding.humanStatus ?? 'draft'}
                  onChange={(e) =>
                    setDocumentCheckFindings((prev) =>
                      prev.map((row) =>
                        row.comparisonId === finding.comparisonId
                          ? { ...row, humanStatus: e.target.value as 'draft' | 'accepted' | 'needs_work' }
                          : row,
                      ),
                    )
                  }
                >
                  <option value="draft" className="bg-navy-800">Draft</option>
                  <option value="accepted" className="bg-navy-800">Accepted</option>
                  <option value="needs_work" className="bg-navy-800">Needs work</option>
                </select>
              </div>
            </li>
            );
          })}
          {!documentCheckFindings.length ? (
            <li className="text-sm text-white/50 border border-dashed border-white/15 rounded-lg p-4">
              Run a document check to generate severity-scored findings.
            </li>
          ) : null}
        </ul>

        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void onSaveDocumentCheck()} disabled={!activeDocumentCheckId}>
            Save session
          </Button>
          <Button variant="secondary" onClick={() => void onCompleteDocumentCheck()} disabled={!activeDocumentCheckId}>
            Complete review
          </Button>
          <Button variant="secondary" onClick={() => void onDownloadPdf()}>
            Download session PDF
          </Button>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-sm font-semibold text-white mb-3">Document check history</h3>
        <ul className="space-y-2 max-h-[780px] overflow-y-auto pr-1">
          {(documentChecks ?? []).map((row) => (
            <li key={row._id}>
              <button
                type="button"
                onClick={() => {
                  setActiveDocumentCheckId(String(row._id));
                  setDocumentCheckScope(row.scope ?? '');
                  setDocumentCheckNotes(row.notes ?? '');
                  setDocumentCheckVerdict((row.verdict as DctCheckVerdict | undefined) ?? 'pending');
                  setDocumentCheckFindings(Array.isArray(row.findings) ? (row.findings as DocumentCheckFinding[]) : []);
                }}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                  activeDocumentCheckId === String(row._id)
                    ? 'border-sky-400/40 bg-sky-500/10'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/70 uppercase">{row.status}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusBadgeClass(
                    row.verdict === 'pass' ? 'green' : row.verdict === 'fail' ? 'red' : 'yellow',
                  )}`}>
                    {row.verdict ?? 'pending'}
                  </span>
                </div>
                <div className="text-white/80 text-xs mt-1">
                  {new Date(row.createdAt ?? row.startedAt).toLocaleString()}
                </div>
                <div className="text-white/50 text-[11px] mt-1 truncate">
                  {(row.totals?.questions ?? 0)} questions · {row.model ?? 'model n/a'}
                </div>
              </button>
            </li>
          ))}
          {!documentChecks?.length ? <li className="text-white/40 text-xs">No document checks yet.</li> : null}
        </ul>
      </GlassCard>
    </div>
  );
}
