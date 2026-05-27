import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiX, FiBookOpen, FiTool, FiClipboard, FiAlertTriangle, FiFileText } from 'react-icons/fi';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  useResearchDiscrepancy,
  useAcceptResearchAsLogbookDraft,
  useFleetAircraft,
} from '../hooks/useConvexData';
import { useAppStore } from '../store/appStore';
import type { AircraftDiscrepancy, DiscrepancyResearchResult } from '../types/discrepancy';

interface Props {
  discrepancyId: string;
  onClose: () => void;
}

export default function DiscrepancyResearchModal({ discrepancyId, onClose }: Props) {
  const discrepancy = useQuery((api as any).avianisIntegration.getDiscrepancy, {
    discrepancyId: discrepancyId as any,
  }) as AircraftDiscrepancy | null | undefined;
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const aircraftList = (useFleetAircraft(activeProjectId ?? undefined) ?? []) as Array<{
    _id: string;
    tailNumber: string;
    make?: string;
    model?: string;
  }>;

  const research = useResearchDiscrepancy();
  const acceptResearch = useAcceptResearchAsLogbookDraft();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptedDraftId, setAcceptedDraftId] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<DiscrepancyResearchResult | null>(null);

  const result = localResult ?? (discrepancy?.research ?? null);
  const aircraft = useMemo(
    () => aircraftList.find((a) => a._id === discrepancy?.aircraftId),
    [aircraftList, discrepancy?.aircraftId],
  );

  // Auto-run research the first time the modal opens for a discrepancy with no cached result.
  useEffect(() => {
    if (!discrepancy) return;
    if (discrepancy.research) return;
    if (localResult) return;
    if (loading) return;
    runResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discrepancy?._id]);

  const runResearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await research({ discrepancyId: discrepancyId as any })) as DiscrepancyResearchResult;
      setLocalResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = (await acceptResearch({ discrepancyId: discrepancyId as any })) as {
        draftId: string;
      };
      setAcceptedDraftId(res.draftId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create draft entry');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start gap-4 p-5 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky to-indigo-500 flex items-center justify-center flex-shrink-0">
            <FiTool className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-display font-bold">Discrepancy Research</h2>
            {discrepancy && (
              <p className="text-sm text-white/70 mt-1">
                <span className="font-medium">{aircraft?.tailNumber ?? 'Aircraft'}</span>
                {aircraft?.make || aircraft?.model
                  ? ` · ${[aircraft?.make, aircraft?.model].filter(Boolean).join(' ')}`
                  : ''}{' '}
                · {discrepancy.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <FiX className="text-xl" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="text-center py-10">
              <div className="inline-block w-10 h-10 border-4 border-sky-light/30 border-t-sky-light rounded-full animate-spin" />
              <p className="text-sm text-white/70 mt-3">
                Searching manuals and analyzing the discrepancy…
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-200">
              {error}
            </div>
          )}

          {!loading && result && (
            <>
              {result.noManualReferencesFound && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-200 flex items-start gap-2">
                  <FiAlertTriangle className="mt-0.5 flex-shrink-0" />
                  <span>
                    No specific manual references found for this aircraft. The guidance below is
                    based on general best practice — verify against your aircraft's published data.
                  </span>
                </div>
              )}

              <Section icon={<FiBookOpen />} title="Problem Analysis">
                <p className="whitespace-pre-line text-sm text-white/85">
                  {result.problemAnalysis}
                </p>
              </Section>

              {result.likelyRootCauses.length > 0 && (
                <Section title="Likely Root Causes">
                  <ol className="list-decimal pl-5 space-y-1 text-sm text-white/85">
                    {result.likelyRootCauses.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ol>
                </Section>
              )}

              {result.troubleshootingSteps.length > 0 && (
                <Section title="Troubleshooting Steps">
                  <ol className="list-decimal pl-5 space-y-1 text-sm text-white/85">
                    {result.troubleshootingSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </Section>
              )}

              {result.correctiveAction && (
                <Section title="Corrective Action">
                  <p className="whitespace-pre-line text-sm text-white/85">
                    {result.correctiveAction}
                  </p>
                </Section>
              )}

              {result.partsNeeded.length > 0 && (
                <Section title="Parts Needed">
                  <ul className="text-sm text-white/85 space-y-1">
                    {result.partsNeeded.map((p, i) => (
                      <li key={i}>
                        <span className="font-mono text-sky-light">{p.partNumber}</span>
                        {p.description ? ` — ${p.description}` : ''}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {result.references.length > 0 && (
                <Section icon={<FiFileText />} title="Manual References">
                  <ul className="space-y-2">
                    {result.references.map((r, i) => (
                      <li
                        key={i}
                        className="rounded-lg bg-white/5 border border-white/10 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium">{r.docName}</span>
                          <span className="text-xs text-white/50">chunk #{r.chunkIndex}</span>
                        </div>
                        <p className="text-white/75 italic">{r.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {result.suggestedLogbookEntry.workPerformed && (
                <Section icon={<FiClipboard />} title="Suggested Logbook Entry">
                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-white/50">
                        Work performed
                      </div>
                      <p className="text-white/85 whitespace-pre-line">
                        {result.suggestedLogbookEntry.workPerformed}
                      </p>
                    </div>
                    {result.suggestedLogbookEntry.ataChapter && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-white/50">
                          ATA chapter
                        </div>
                        <p className="text-white/85">
                          {result.suggestedLogbookEntry.ataChapter}
                        </p>
                      </div>
                    )}
                    {result.suggestedLogbookEntry.returnToServiceStatement && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-white/50">
                          Return-to-service statement
                        </div>
                        <p className="text-white/85 whitespace-pre-line">
                          {result.suggestedLogbookEntry.returnToServiceStatement}
                        </p>
                      </div>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        <div className="border-t border-white/10 p-4 flex flex-wrap items-center gap-3">
          <button
            onClick={runResearch}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {result ? 'Re-run research' : 'Run research'}
          </button>
          <div className="flex-1" />
          {acceptedDraftId ? (
            <Link
              to="/logbook/entry-review"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all"
            >
              Draft entry created · Go to Logbook
            </Link>
          ) : (
            <button
              onClick={handleAccept}
              disabled={!result || accepting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-sky to-sky-light hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting ? 'Creating draft…' : 'Use as log entry'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm uppercase tracking-wider font-semibold text-white/70 flex items-center gap-2 mb-2">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}
