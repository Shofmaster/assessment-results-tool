import { useMemo, useState } from 'react';
import { FiLayers } from 'react-icons/fi';
import { GlassCard } from '../ui';
import { inferApplicabilityTokens } from '../../utils/dctApplicability';
import type { TabKey } from './types';

export type DctFileSummary = {
  doc: any;
  applicable: number;
  unsure: number;
  notApplicable: number;
  total: number;
};

/**
 * Collapsible overview that groups ingested DCT files by peer group and shows
 * an applicable/unsure/N-A breakdown per group, with a jump-to-matrix action.
 */
export function CategoryTriageSection({
  dctFileSummaries,
  profile,
  setMatrixDocFilterId,
  setActiveTab,
  setMatrixFilter,
}: {
  dctFileSummaries: DctFileSummary[];
  profile: any;
  setMatrixDocFilterId: (id: string | null) => void;
  setActiveTab: (tab: TabKey) => void;
  setMatrixFilter: (f: string) => void;
}) {
  const [open, setOpen] = useState(dctFileSummaries.length > 0);

  const profileTokens = useMemo(() => inferApplicabilityTokens(profile), [profile]);

  type GroupEntry = {
    peerGroupLabel: string;
    description: string | null;
    applicable: number;
    unsure: number;
    notApplicable: number;
    total: number;
    docs: DctFileSummary[];
  };

  const groups = useMemo<GroupEntry[]>(() => {
    const map = new Map<string, GroupEntry>();
    for (const s of dctFileSummaries) {
      const key = s.doc.peerGroupLabel ?? s.doc.fileName ?? 'Unknown';
      if (!map.has(key)) {
        // Pick the best human-readable description available on the DCT document.
        const d = s.doc;
        const description: string | null =
          d.mlfName ?? d.mlfLabel ?? d.specialtyLabel ?? d.purpose ?? null;
        map.set(key, { peerGroupLabel: key, description, applicable: 0, unsure: 0, notApplicable: 0, total: 0, docs: [] });
      }
      const g = map.get(key)!;
      g.applicable += s.applicable;
      g.unsure += s.unsure;
      g.notApplicable += s.notApplicable;
      g.total += s.total;
      g.docs.push(s);
    }
    return [...map.values()].sort((a, b) => b.applicable - a.applicable || b.unsure - a.unsure);
  }, [dctFileSummaries]);

  if (!dctFileSummaries.length) return null;

  return (
    <GlassCard className="!p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-white"
      >
        <span className="flex items-center gap-2">
          <FiLayers className="text-sky-400 shrink-0" />
          Category triage — {dctFileSummaries.length} DCT file{dctFileSummaries.length === 1 ? '' : 's'} in {groups.length} group{groups.length === 1 ? '' : 's'}
        </span>
        <span className="text-white/40 text-xs shrink-0">{open ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {profileTokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-white/50 shrink-0">Matched tokens:</span>
              {profileTokens.map((t: string) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full border border-sky-400/40 bg-sky-500/10 text-sky-200 text-[10px] font-medium"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {groups.map((g) => {
              const appPct = g.total ? Math.round((g.applicable / g.total) * 100) : 0;
              const unsurePct = g.total ? Math.round((g.unsure / g.total) * 100) : 0;
              const naPct = Math.max(0, 100 - appPct - unsurePct);
              return (
                <div key={g.peerGroupLabel} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {g.description ? (
                          <>
                            <span className="text-sm text-white/90 font-medium">{g.description}</span>
                            <span className="text-[10px] text-white/40 font-mono bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                              {g.peerGroupLabel}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-white/90 font-medium truncate">{g.peerGroupLabel}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-white/50 mt-0.5">
                        {g.docs.length} file{g.docs.length === 1 ? '' : 's'} · {g.total} req
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <span className="text-[10px] text-emerald-300">{g.applicable} applicable</span>
                      <span className="text-[10px] text-amber-200/90">{g.unsure} unsure</span>
                      <span className="text-[10px] text-white/40">{g.notApplicable} N/A</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (g.docs.length === 1) {
                            setMatrixDocFilterId(String(g.docs[0].doc._id));
                          } else {
                            setMatrixDocFilterId(null);
                            setMatrixFilter(g.peerGroupLabel);
                          }
                          setActiveTab('matrix');
                        }}
                        className="px-2 py-0.5 rounded border border-sky-400/40 bg-sky-500/10 text-sky-200 text-[10px] hover:bg-sky-500/20 transition-colors"
                      >
                        View in Matrix →
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex h-1.5 w-full rounded-full overflow-hidden bg-white/10">
                    {appPct > 0 && (
                      <div className="bg-emerald-500/80" style={{ width: `${appPct}%` }} title={`Applicable: ${g.applicable}`} />
                    )}
                    {unsurePct > 0 && (
                      <div className="bg-amber-400/80" style={{ width: `${unsurePct}%` }} title={`Unsure: ${g.unsure}`} />
                    )}
                    {naPct > 0 && (
                      <div className="bg-white/20" style={{ width: `${naPct}%` }} title={`N/A: ${g.notApplicable}`} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
