import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { FiClock, FiLayers, FiSettings, FiZap } from 'react-icons/fi';
import { Button, GlassCard } from '../ui';
import { InfoRow } from './InfoRow';
import { PageModelSelector } from '../PageModelSelector';
import { AUDIT_AGENTS, DCT_TRACEABILITY_AGENT_IDS } from '../../services/auditAgents';
import { getConvexErrorMessage } from '../../utils/convexError';
import type { Id } from '../../../convex/_generated/dataModel';

type ApplicabilityMode = 'heuristics_only' | 'structured_preferred';
type ApplicabilitySaveState = 'idle' | 'saving' | 'saved' | 'error';

type ApplicabilityFieldPatch = {
  showAllDcts?: boolean;
  includedPeerGroupSubstrings?: string[];
  excludedPeerGroupSubstrings?: string[];
  applicabilityMode?: ApplicabilityMode;
  selectedClassRatingIds?: Id<'entityClassRatings'>[];
  selectedCapabilityIds?: Id<'entityCapabilityList'>[];
};

/**
 * Settings tab: schedule controls + reference-library sync, the applicability
 * filter panel (show-all, manual corpus, mode, include/exclude, structured
 * rating/capability selectors), and the traceability run configuration.
 */
export function SettingsTab({
  settings,
  summary,
  activeProjectId,
  completeCheck,
  upsertDctProjectSettings,
  upsertUserSettings,
  dctLibraryRefsWithFile,
  toolDocuments,
  newLibraryHashesAvailable,
  syncingLibrary,
  onSyncFromReferenceLibrary,
  localShowAllDcts,
  setLocalShowAllDcts,
  applicabilitySaveState,
  saveApplicabilityField,
  useManualCorpusForApplicability,
  setUseManualCorpusForApplicability,
  manualApplicabilityTokens,
  applicabilityMode,
  setApplicabilityMode,
  includeOverride,
  setIncludeOverride,
  excludeOverride,
  setExcludeOverride,
  flushIncludeExcludeOverrides,
  allClassRatings,
  allCapabilityItems,
  selectedRatingIds,
  setSelectedRatingIds,
  selectedCapabilityIds,
  setSelectedCapabilityIds,
  selectedRatingIdsList,
  selectedCapabilityIdsList,
  localDctTraceabilityAgentId,
  setLocalDctTraceabilityAgentId,
  dctTraceabilityAgentId,
  traceRunning,
}: {
  settings: any;
  summary: any;
  activeProjectId: string;
  completeCheck: (args: any) => Promise<unknown>;
  upsertDctProjectSettings: (args: any) => Promise<unknown>;
  upsertUserSettings: (args: any) => Promise<unknown>;
  dctLibraryRefsWithFile: any[];
  toolDocuments: any[] | undefined;
  newLibraryHashesAvailable: number;
  syncingLibrary: boolean;
  onSyncFromReferenceLibrary: () => void | Promise<void>;
  localShowAllDcts: boolean;
  setLocalShowAllDcts: Dispatch<SetStateAction<boolean>>;
  applicabilitySaveState: ApplicabilitySaveState;
  saveApplicabilityField: (patch: ApplicabilityFieldPatch) => Promise<boolean>;
  useManualCorpusForApplicability: boolean;
  setUseManualCorpusForApplicability: Dispatch<SetStateAction<boolean>>;
  manualApplicabilityTokens: string[];
  applicabilityMode: ApplicabilityMode;
  setApplicabilityMode: Dispatch<SetStateAction<ApplicabilityMode>>;
  includeOverride: string;
  setIncludeOverride: Dispatch<SetStateAction<string>>;
  excludeOverride: string;
  setExcludeOverride: Dispatch<SetStateAction<string>>;
  flushIncludeExcludeOverrides: () => void;
  allClassRatings: any[] | undefined;
  allCapabilityItems: any[] | undefined;
  selectedRatingIds: Record<string, boolean>;
  setSelectedRatingIds: Dispatch<SetStateAction<Record<string, boolean>>>;
  selectedCapabilityIds: Record<string, boolean>;
  setSelectedCapabilityIds: Dispatch<SetStateAction<Record<string, boolean>>>;
  selectedRatingIdsList: (map: Record<string, boolean>) => Id<'entityClassRatings'>[];
  selectedCapabilityIdsList: (map: Record<string, boolean>) => Id<'entityCapabilityList'>[];
  localDctTraceabilityAgentId: string;
  setLocalDctTraceabilityAgentId: (s: string) => void;
  dctTraceabilityAgentId: string;
  traceRunning: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Schedule */}
      <GlassCard>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <FiClock /> Schedule
        </h2>
        <div className="space-y-3 text-sm text-white/80">
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Last check" value={settings?.lastCheckCompletedAt ? new Date(settings.lastCheckCompletedAt).toLocaleDateString() : '—'} />
            <InfoRow
              label="Next due"
              value={settings?.nextDueAt ? new Date(settings.nextDueAt).toLocaleDateString() : '—'}
              highlight={summary?.overdue ? 'amber' : undefined}
              note={summary?.overdue ? 'overdue' : undefined}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                await completeCheck({ projectId: activeProjectId as Id<'projects'> });
                toast.success('Check completed; next due date advanced.');
              }}
            >
              Complete check
            </Button>
            <label className="inline-flex items-center gap-2 text-xs text-white/60">
              Interval
              <select
                className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white"
                defaultValue={String(settings?.scheduleIntervalDays ?? 7)}
                onChange={async (e) => {
                  await upsertDctProjectSettings({
                    projectId: activeProjectId as Id<'projects'>,
                    scheduleIntervalDays: Number(e.target.value),
                  });
                  toast.success('Schedule updated');
                }}
              >
                {[1, 7, 14, 30].map((d) => (
                  <option key={d} value={d} className="bg-navy-800">
                    {d} days
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <FiLayers className="text-sky-300" /> Reference library
          </h3>
          <div className="text-xs text-white/60 space-y-1">
            <p>
              Library files: <span className="text-white">{dctLibraryRefsWithFile.length}</span>
              {' · '}Ingested: <span className="text-white">{toolDocuments?.length ?? 0}</span>
              {' · '}New: {' '}
              <span className={newLibraryHashesAvailable > 0 ? 'text-amber-200' : 'text-white/50'}>
                {newLibraryHashesAvailable}
              </span>
            </p>
            <p>
              Last ingest: {settings?.lastXmlIngestAt ? new Date(settings.lastXmlIngestAt).toLocaleString() : '—'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            disabled={syncingLibrary || newLibraryHashesAvailable === 0}
            onClick={() => void onSyncFromReferenceLibrary()}
          >
            {syncingLibrary ? 'Syncing…' : 'Sync from library'}
          </Button>
        </div>
      </GlassCard>

      {/* Applicability */}
      <GlassCard>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <FiSettings /> Applicability filters
        </h2>
        <div className="space-y-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-white/80">
            <input
              type="checkbox"
              checked={localShowAllDcts}
              disabled={applicabilitySaveState === 'saving'}
              onChange={(e) => {
                const checked = e.target.checked;
                setLocalShowAllDcts(checked);
                void saveApplicabilityField({ showAllDcts: checked }).then((ok) => {
                  if (!ok) setLocalShowAllDcts(settings?.showAllDcts === true);
                });
              }}
            />
            Show all DCTs (ignore profile applicability)
          </label>
          {localShowAllDcts ? (
            <p className="text-xs text-sky-100/80 pl-6">
              When enabled, every DCT requirement is classified as applicable and applicability coverage shows 100%.
              Turn off to filter by entity profile, class ratings, and op specs.
            </p>
          ) : null}

          <label className="flex items-start gap-2 cursor-pointer text-white/80">
            <input
              type="checkbox"
              className="mt-1"
              checked={useManualCorpusForApplicability}
              onChange={(e) => setUseManualCorpusForApplicability(e.target.checked)}
            />
            <span className="text-xs">
              Use inline manual excerpts (entity/regulatory/SMS) alongside the entity profile when inferring applicability.
            </span>
          </label>
          {useManualCorpusForApplicability && manualApplicabilityTokens.length === 0 ? (
            <p className="text-xs text-amber-200/80 pl-6">
              No inline extracted text found — extract documents in Library or disable this option.
            </p>
          ) : useManualCorpusForApplicability ? (
            <p className="text-xs text-white/40 pl-6 truncate" title={manualApplicabilityTokens.join(', ')}>
              Tokens: {manualApplicabilityTokens.slice(0, 10).join(', ')}
              {manualApplicabilityTokens.length > 10 ? ` +${manualApplicabilityTokens.length - 10} more` : ''}
            </p>
          ) : null}

          <div>
            <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Mode</label>
            <select
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
              value={applicabilityMode}
              onChange={(e) => {
                const mode = e.target.value as ApplicabilityMode;
                setApplicabilityMode(mode);
                void saveApplicabilityField({ applicabilityMode: mode });
              }}
            >
              <option value="structured_preferred" className="bg-navy-800">Structured preferred (ratings then heuristics)</option>
              <option value="heuristics_only" className="bg-navy-800">Heuristics only</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Include</label>
              <input
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                placeholder="145, repair"
                value={includeOverride}
                onChange={(e) => setIncludeOverride(e.target.value)}
                onBlur={() => flushIncludeExcludeOverrides()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <p className="text-[10px] text-white/40 mt-1">Saved on blur or Enter</p>
            </div>
            <div>
              <label className="text-white/50 text-xs uppercase tracking-wide block mb-1">Exclude</label>
              <input
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
                placeholder="121, airline"
                value={excludeOverride}
                onChange={(e) => setExcludeOverride(e.target.value)}
                onBlur={() => flushIncludeExcludeOverrides()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <p className="text-[10px] text-white/40 mt-1">Saved on blur or Enter</p>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-xs text-white/60 hover:text-white/90 list-none flex items-center gap-2">
              <span className="transition-transform group-open:rotate-90">▸</span>
              Structured selectors ({(allClassRatings?.length ?? 0) + (allCapabilityItems?.length ?? 0)})
            </summary>
            <div className="mt-3 space-y-2">
              <div className="max-h-32 overflow-auto rounded border border-white/10 p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white/45 text-xs font-medium">Class ratings</p>
                  {(allClassRatings?.length ?? 0) > 0 ? (
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        className="underline hover:opacity-80 text-white/60"
                        onClick={() => {
                          const next: Record<string, boolean> = {};
                          for (const row of allClassRatings ?? []) next[String(row._id)] = true;
                          setSelectedRatingIds(next);
                          void saveApplicabilityField({
                            selectedClassRatingIds: selectedRatingIdsList(next),
                          });
                        }}
                      >
                        Select all
                      </button>
                      <span className="opacity-40">|</span>
                      <button
                        type="button"
                        className="underline hover:opacity-80 text-white/60"
                        onClick={() => {
                          setSelectedRatingIds({});
                          void saveApplicabilityField({ selectedClassRatingIds: [] });
                        }}
                      >
                        Deselect all
                      </button>
                    </div>
                  ) : null}
                </div>
                {(allClassRatings ?? []).map((row) => (
                  <label key={row._id} className="flex items-center gap-2 text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={!!selectedRatingIds[String(row._id)]}
                      onChange={(e) => {
                        const id = String(row._id);
                        const next = { ...selectedRatingIds, [id]: e.target.checked };
                        if (!e.target.checked) delete next[id];
                        setSelectedRatingIds(next);
                        void saveApplicabilityField({
                          selectedClassRatingIds: selectedRatingIdsList(next),
                        });
                      }}
                    />
                    <span>{row.category} class {row.classNumber}</span>
                  </label>
                ))}
                {!allClassRatings?.length ? <p className="text-white/35 text-xs">No class ratings on file.</p> : null}
              </div>
              <div className="max-h-32 overflow-auto rounded border border-white/10 p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white/45 text-xs font-medium">Capability list items</p>
                  {(allCapabilityItems?.length ?? 0) > 0 ? (
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        className="underline hover:opacity-80 text-white/60"
                        onClick={() => {
                          const next: Record<string, boolean> = {};
                          for (const row of allCapabilityItems ?? []) next[String(row._id)] = true;
                          setSelectedCapabilityIds(next);
                          void saveApplicabilityField({
                            selectedCapabilityIds: selectedCapabilityIdsList(next),
                          });
                        }}
                      >
                        Select all
                      </button>
                      <span className="opacity-40">|</span>
                      <button
                        type="button"
                        className="underline hover:opacity-80 text-white/60"
                        onClick={() => {
                          setSelectedCapabilityIds({});
                          void saveApplicabilityField({ selectedCapabilityIds: [] });
                        }}
                      >
                        Deselect all
                      </button>
                    </div>
                  ) : null}
                </div>
                {(allCapabilityItems ?? []).map((row) => (
                  <label key={row._id} className="flex items-center gap-2 text-xs text-white/80">
                    <input
                      type="checkbox"
                      checked={!!selectedCapabilityIds[String(row._id)]}
                      onChange={(e) => {
                        const id = String(row._id);
                        const next = { ...selectedCapabilityIds, [id]: e.target.checked };
                        if (!e.target.checked) delete next[id];
                        setSelectedCapabilityIds(next);
                        void saveApplicabilityField({
                          selectedCapabilityIds: selectedCapabilityIdsList(next),
                        });
                      }}
                    />
                    <span>{row.articleDescription}</span>
                  </label>
                ))}
                {!allCapabilityItems?.length ? <p className="text-white/35 text-xs">No capability list items on file.</p> : null}
              </div>
            </div>
          </details>

          <div className="flex items-center gap-3 text-xs text-white/50">
            {applicabilitySaveState === 'saving' ? (
              <span className="text-sky-200/90">Saving filters…</span>
            ) : applicabilitySaveState === 'saved' ? (
              <span className="text-emerald-200/90">Filters saved</span>
            ) : applicabilitySaveState === 'error' ? (
              <span className="text-rose-200/90">Save failed — retry by changing a filter</span>
            ) : (
              <span>Changes save when you edit each control</span>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Traceability configuration */}
      <GlassCard className="lg:col-span-2">
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <FiZap /> Traceability configuration
        </h2>
        <p className="text-xs text-white/60 mb-4">
          Configure the perspective and model used when you run traceability. Use the{' '}
          <strong>Run traceability</strong> button in the page header or the Step 3 card to
          start a run.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-white/50 text-xs uppercase tracking-wide">Perspective</label>
            <select
              value={localDctTraceabilityAgentId}
              onChange={async (e) => {
                const next = e.target.value;
                setLocalDctTraceabilityAgentId(next);
                try {
                  await upsertUserSettings({ dctTraceabilityAgentId: next });
                } catch (err) {
                  console.error('[userSettings.upsert] Failed to save DCT traceability perspective:', err);
                  toast.error('Failed to save perspective', {
                    description: getConvexErrorMessage(err),
                  });
                  setLocalDctTraceabilityAgentId(dctTraceabilityAgentId);
                }
              }}
              disabled={traceRunning}
              className="h-10 px-3 text-sm rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-sky-light min-w-[220px] disabled:opacity-50"
              aria-label="DCT traceability perspective"
            >
              {(DCT_TRACEABILITY_AGENT_IDS as readonly string[]).map((id) => {
                const agent = AUDIT_AGENTS.find((a) => a.id === id);
                const label =
                  id === 'generic' ? 'Generic auditor' : agent?.name ?? id;
                return (
                  <option key={id} value={id} className="bg-navy-800 text-white">
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-white/50 text-xs uppercase tracking-wide">Model</label>
            <PageModelSelector field="dctTraceabilityModel" compact disabled={traceRunning} />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
