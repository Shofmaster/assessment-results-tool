/**
 * EntryReviewCard — renders a single parsed logbook entry with its review
 * findings, confidence badges, and deterministic engine findings.
 */

import { useState } from 'react';
import {
  FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiChevronDown, FiChevronUp,
  FiLoader, FiRefreshCw, FiTool, FiSave, FiDownload,
} from 'react-icons/fi';
import type { ParsedLogEntry } from '../../types/logbook';
import type { RawFinding } from '../../services/complianceEngine';
import { generateCompliantRewrite, type RewrittenEntry } from '../../services/entryFixService';
import { getCitationLink } from '../../services/cfrDeepLink';
import EntryFixDiff from './EntryFixDiff';

// ── Types shared with orchestrator ───────────────────────────────────────────

interface SmartReviewFinding {
  severity: 'critical' | 'major' | 'advisory';
  category: string;
  field?: string;
  citation: string;
  issue: string;
  suggestedText?: string;
}

interface SmartReviewResult {
  overallCompliance: 'compliant' | 'minor_issues' | 'major_issues' | 'non_compliant';
  complianceScore: number;
  findings: SmartReviewFinding[];
  suggestedWorkPerformed?: string;
  suggestedRts?: string;
  regulatoryFramework: 'FAA' | 'EASA';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreBadgeClass(score: number): string {
  if (score >= 85) return 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40';
  if (score >= 70) return 'text-amber-300 bg-amber-500/20 border-amber-500/40';
  if (score >= 50) return 'text-orange-300 bg-orange-500/20 border-orange-500/40';
  return 'text-red-300 bg-red-500/20 border-red-500/40';
}

function confidenceBadge(value: number | undefined): string {
  if (value == null) return 'bg-white/5 text-white/30';
  if (value >= 0.9) return 'bg-emerald-500/15 text-emerald-300';
  if (value >= 0.7) return 'bg-amber-500/15 text-amber-300';
  return 'bg-red-500/15 text-red-300';
}

function severityIcon(s: string) {
  if (s === 'critical') return <FiAlertCircle className="text-red-400 flex-shrink-0 mt-0.5" />;
  if (s === 'major') return <FiAlertTriangle className="text-orange-400 flex-shrink-0 mt-0.5" />;
  return <FiCheckCircle className="text-sky-400 flex-shrink-0 mt-0.5" />;
}

function severityBadgeCls(s: string): string {
  if (s === 'critical') return 'text-red-300 bg-red-500/15 border-red-500/30';
  if (s === 'major') return 'text-orange-300 bg-orange-500/15 border-orange-500/30';
  return 'text-sky-300 bg-sky-500/15 border-sky-500/30';
}

// ── Component ────────────────────────────────────────────────────────────────

interface EntryReviewCardProps {
  index: number;
  entry: ParsedLogEntry;
  reviewResult?: SmartReviewResult;
  engineFindings?: RawFinding[];
  reviewing?: boolean;
  onReview?: () => void;
  /** Enabled when activeProjectId + aircraftId are set. */
  onSaveAsDraft?: () => void;
  onImportToLogbook?: () => void;
  /** True if project context is missing — buttons shown disabled with tooltip. */
  projectContextMissing?: boolean;
}

const STRUCTURED_FIELDS: { key: keyof ParsedLogEntry; label: string }[] = [
  { key: 'entryDate', label: 'Date' },
  { key: 'workPerformed', label: 'Work Performed' },
  { key: 'ataChapter', label: 'ATA Chapter' },
  { key: 'totalTimeAtEntry', label: 'Total Time' },
  { key: 'signerName', label: 'Signer' },
  { key: 'signerCertNumber', label: 'Cert #' },
  { key: 'signerCertType', label: 'Cert Type' },
  { key: 'returnToServiceStatement', label: 'RTS Statement' },
  { key: 'entryType', label: 'Entry Type' },
];

export default function EntryReviewCard({
  index,
  entry,
  reviewResult,
  engineFindings,
  reviewing,
  onReview,
  onSaveAsDraft,
  onImportToLogbook,
  projectContextMissing,
}: EntryReviewCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [rewrite, setRewrite] = useState<RewrittenEntry | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);

  const allFindings: Array<{ source: 'llm' | 'engine'; severity: string; title: string; description: string; citation: string; suggestedText?: string }> = [];

  // LLM findings
  if (reviewResult) {
    for (const f of reviewResult.findings) {
      allFindings.push({
        source: 'llm',
        severity: f.severity,
        title: f.field ? `${f.field}: ${f.issue}` : f.issue,
        description: f.issue,
        citation: f.citation,
        suggestedText: f.suggestedText,
      });
    }
  }

  // Deterministic engine findings
  if (engineFindings) {
    for (const f of engineFindings) {
      allFindings.push({
        source: 'engine',
        severity: f.severity,
        title: f.title,
        description: f.description,
        citation: f.citation,
      });
    }
  }

  const score = reviewResult?.complianceScore;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white/[0.03] border-b border-white/10 text-left"
      >
        <span className="text-xs font-mono text-white/30 w-6 text-right">#{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/80 truncate">
            {entry.entryDate ?? 'No date'} — {entry.entryType ?? 'maintenance'}
          </p>
          <p className="text-xs text-white/40 truncate mt-0.5">
            {entry.workPerformed?.slice(0, 80) ?? entry.rawText.slice(0, 80)}
          </p>
        </div>
        {typeof score === 'number' && (
          <span className={`text-sm font-mono px-2.5 py-1 rounded-lg border ${scoreBadgeClass(score)}`}>
            {score}
          </span>
        )}
        {reviewing && <FiLoader className="animate-spin text-sky-light" />}
        {expanded ? <FiChevronUp className="text-white/30" /> : <FiChevronDown className="text-white/30" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Parsed fields grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {STRUCTURED_FIELDS.map(({ key, label }) => {
              const val = entry[key];
              if (val == null || val === '' || val === false) return null;
              const conf = entry.fieldConfidence?.[key];
              return (
                <div key={key} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">{label}</p>
                    <p className="text-xs text-white/70 break-words">
                      {typeof val === 'number' ? val.toLocaleString() : String(val)}
                    </p>
                  </div>
                  {conf != null && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${confidenceBadge(conf)}`}>
                      {(conf * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* AD/SB references */}
          {(entry.adReferences?.length || entry.sbReferences?.length) ? (
            <div className="flex flex-wrap gap-1.5">
              {entry.adReferences?.map((ref, i) => (
                <span key={`ad-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">
                  AD: {ref}
                </span>
              ))}
              {entry.sbReferences?.map((ref, i) => (
                <span key={`sb-${i}`} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  SB: {ref}
                </span>
              ))}
            </div>
          ) : null}

          {/* Raw text toggle */}
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
          >
            {showRaw ? 'Hide raw text' : 'Show raw text'}
          </button>
          {showRaw && (
            <pre className="text-xs text-white/50 bg-white/[0.02] border border-white/5 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">
              {entry.rawText}
            </pre>
          )}

          {/* Review button */}
          {!reviewResult && !reviewing && onReview && (
            <button
              type="button"
              onClick={onReview}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky/15 text-sky-light border border-sky/30 hover:bg-sky/25 transition-colors"
            >
              <FiRefreshCw className="text-[10px]" />
              Review this entry
            </button>
          )}

          {/* Findings */}
          {allFindings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-white/50">
                Findings ({allFindings.length})
              </p>
              {allFindings.map((f, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-white/5 bg-white/[0.02]"
                >
                  {severityIcon(f.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${severityBadgeCls(f.severity)}`}>
                        {f.severity}
                      </span>
                      {f.source === 'engine' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 border border-white/10">
                          Deterministic
                        </span>
                      )}
                      {(() => {
                        const href = getCitationLink(f.citation);
                        return href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-400/60 hover:text-sky-300 font-mono underline underline-offset-2">{f.citation}</a>
                        ) : (
                          <span className="text-[10px] text-white/30 font-mono">{f.citation}</span>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-white/70">{f.description}</p>
                    {f.suggestedText && (
                      <p className="text-xs text-emerald-300/70 mt-1 italic">
                        Suggestion: {f.suggestedText}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Suggested improvements */}
          {reviewResult?.suggestedWorkPerformed && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/60 mb-1">Suggested Work Description</p>
              <p className="text-xs text-emerald-200/80">{reviewResult.suggestedWorkPerformed}</p>
            </div>
          )}
          {reviewResult?.suggestedRts && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/60 mb-1">Suggested RTS Statement</p>
              <p className="text-xs text-emerald-200/80">{reviewResult.suggestedRts}</p>
            </div>
          )}

          {/* Apply suggestions / fix flow */}
          {reviewResult && allFindings.length > 0 && !rewrite && (
            <button
              type="button"
              disabled={fixing}
              onClick={async () => {
                setFixing(true); setFixError(null);
                try {
                  const result = await generateCompliantRewrite(
                    entry,
                    reviewResult.findings,
                    engineFindings ?? [],
                  );
                  setRewrite(result);
                } catch (err) {
                  setFixError(err instanceof Error ? err.message : String(err));
                } finally { setFixing(false); }
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {fixing ? <FiLoader className="animate-spin text-[10px]" /> : <FiTool className="text-[10px]" />}
              {fixing ? 'Generating rewrite…' : 'Apply suggestions'}
            </button>
          )}
          {fixError && (
            <p className="text-xs text-red-300/70">{fixError}</p>
          )}

          {/* Fix diff */}
          {rewrite && (
            <EntryFixDiff
              originalText={entry.rawText}
              rewrite={rewrite}
              onDismiss={() => setRewrite(null)}
            />
          )}

          {/* Compliant badge when clean */}
          {reviewResult && allFindings.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 text-xs">
              <FiCheckCircle />
              No compliance issues found
            </div>
          )}

          {/* Project integration buttons */}
          {reviewResult && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                disabled={projectContextMissing || !onSaveAsDraft}
                onClick={onSaveAsDraft}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={projectContextMissing ? 'Set an active project and aircraft to save as draft' : 'Save as draft entry'}
              >
                <FiSave className="text-[10px]" />
                Save as Draft
              </button>
              <button
                type="button"
                disabled={projectContextMissing || !onImportToLogbook}
                onClick={onImportToLogbook}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title={projectContextMissing ? 'Set an active project and aircraft to import' : 'Import directly to logbook'}
              >
                <FiDownload className="text-[10px]" />
                Import to Logbook
              </button>
              {projectContextMissing && (
                <span className="text-[10px] text-white/25 italic">Requires active project + aircraft</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
