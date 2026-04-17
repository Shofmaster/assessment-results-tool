import { useState, useMemo } from 'react';
import {
  useLogbookEntries,
  useComplianceFindings,
  useComplianceRules,
  useAddComplianceFindings,
  useUpdateComplianceFindingStatus,
  useAddEntityIssue,
  useConvertFindingToIssue,
  useInspectionScheduleItems,
  useUpdateInspectionScheduleLastPerformed,
  useSeedComplianceRules,
  useSeedRulePack,
  useIsAdmin,
} from '../hooks/useConvexData';
import { runComplianceChecks, detectTimeDiscrepancies } from '../services/complianceEngine';
import { findingToIssueArgs, buildScheduleUpdates } from '../services/logbookIntegration';
import { detectChronicIssues } from '../services/chronicIssueDetector';
import type { ChronicIssueResult } from '../services/chronicIssueDetector';
import { ALL_RULE_PACKS, RULE_PACK_LABELS } from '../data/regulatoryRulePacks';
import {
  getAllAdSbReferences,
  type LogbookEntry,
  type ComplianceFinding,
  type ComplianceRule,
} from '../types/logbook';
import type { InspectionScheduleItem } from '../types/inspectionSchedule';
import {
  FiAlertTriangle,
  FiClock,
  FiCheck,
  FiX,
  FiChevronRight,
  FiPlay,
  FiTool,
  FiRefreshCw,
} from 'react-icons/fi';
import { toast } from 'sonner';

export default function LogbookFindingsTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const findings = (useComplianceFindings(projectId, aircraftId) ?? []) as ComplianceFinding[];
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const rules = (useComplianceRules() ?? []) as ComplianceRule[];
  const scheduleItems = (useInspectionScheduleItems(projectId) ?? []) as InspectionScheduleItem[];
  const addFindings = useAddComplianceFindings();
  const updateFindingStatus = useUpdateComplianceFindingStatus();
  const addEntityIssue = useAddEntityIssue();
  const convertFindingToIssue = useConvertFindingToIssue();
  const updateScheduleLastPerformed = useUpdateInspectionScheduleLastPerformed();
  const seedRules = useSeedComplianceRules();
  const seedRulePack = useSeedRulePack();
  const isAdmin = useIsAdmin();

  const [running, setRunning] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [chronicResult, setChronicResult] = useState<ChronicIssueResult | null>(null);
  const [analyzingChronic, setAnalyzingChronic] = useState(false);
  const [chronicExpandedIdx, setChronicExpandedIdx] = useState<number | null>(null);

  const loadedPacks = useMemo(() => {
    const packs = new Set<string>();
    for (const r of rules) packs.add(r.regulatoryPack);
    return packs;
  }, [rules]);

  const handleSeedPack = async (packId: string) => {
    const packRules = ALL_RULE_PACKS[packId];
    if (!packRules) return;
    try {
      const result = await seedRulePack({ rules: packRules });
      toast.success(`Seeded ${result.seeded} rules from ${RULE_PACK_LABELS[packId] ?? packId}`);
    } catch (err: any) {
      toast.error(err.message || `Failed to seed ${packId}`);
    }
  };

  const handleConvertToIssue = async (finding: ComplianceFinding) => {
    try {
      const issueArgs = findingToIssueArgs(finding, projectId);
      const issueId = await (addEntityIssue as any)(issueArgs);
      await convertFindingToIssue({ findingId: finding._id as any, issueId: issueId as any });
      toast.success('Finding converted to CAR');
    } catch (err: any) {
      toast.error(err.message || 'Failed to convert finding');
    }
  };

  const handleSyncSchedule = async () => {
    if (entries.length === 0 || scheduleItems.length === 0) {
      toast.info('Need both logbook entries and schedule items to sync.');
      return;
    }
    setSyncing(true);
    try {
      const updates = buildScheduleUpdates(entries, scheduleItems);
      if (updates.length === 0) {
        toast.info('No schedule items matched logbook entries.');
      } else {
        for (const update of updates) {
          await updateScheduleLastPerformed({
            itemId: update.itemId as any,
            lastPerformedAt: update.lastPerformedAt,
          });
        }
        toast.success(`Updated ${updates.length} schedule item(s) from logbook entries`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Schedule sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDetectChronic = async () => {
    if (entries.length < 2) { toast.error('Need at least 2 logbook entries to detect chronic issues.'); return; }
    setAnalyzingChronic(true);
    setChronicResult(null);
    setChronicExpandedIdx(null);
    try {
      const result = await detectChronicIssues(entries);
      setChronicResult(result);
      if (result.clusters.length === 0) {
        toast.success('No chronic issues detected in this aircraft\'s history.');
      } else {
        toast.success(`Found ${result.clusters.length} chronic issue${result.clusters.length > 1 ? 's' : ''} across ${result.entriesAnalysed} entries.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Chronic issue analysis failed');
    } finally {
      setAnalyzingChronic(false);
    }
  };

  const filtered = useMemo(() => {
    if (!statusFilter) return findings;
    return findings.filter((f) => f.status === statusFilter);
  }, [findings, statusFilter]);

  const handleRunChecks = async () => {
    if (entries.length === 0) { toast.error('No logbook entries to check. Parse a document first.'); return; }
    if (rules.length === 0) { toast.error('No compliance rules loaded. Seed Part 43/91 rules first.'); return; }
    setRunning(true);
    try {
      const ruleFindings = runComplianceChecks(entries, rules, aircraftId);
      const timeFindings = detectTimeDiscrepancies(entries, aircraftId);
      const allFindings = [...ruleFindings, ...timeFindings];

      if (allFindings.length === 0) {
        toast.success('No compliance issues detected.');
      } else {
        await addFindings({
          projectId: projectId as any,
          findings: allFindings.map((f) => ({
            ...f,
            aircraftId: aircraftId as any,
            logbookEntryId: f.logbookEntryId as any,
          })),
        });
        toast.success(`Found ${allFindings.length} compliance finding(s)`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Compliance check failed');
    } finally {
      setRunning(false);
    }
  };

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, major: 0, minor: 0 };
    for (const f of findings.filter((f) => f.status === 'open')) {
      if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
    }
    return counts;
  }, [findings]);

  const adSbMatrix = useMemo(() => {
    const map = new Map<string, { date?: string; entryId: string }[]>();
    for (const entry of entries) {
      for (const ref of getAllAdSbReferences(entry)) {
        const list = map.get(ref) ?? [];
        list.push({ date: entry.entryDate, entryId: entry._id });
        map.set(ref, list);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ref, occurrences]) => ({
        ref,
        latestDate: [...occurrences].map((o) => o.date).filter(Boolean).sort().at(-1),
        count: occurrences.length,
      }));
  }, [entries]);

  return (
    <div className="space-y-4 text-stone-800">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRunChecks}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800 disabled:opacity-50"
        >
          <FiPlay /> {running ? 'Running...' : 'Run Compliance Checks'}
        </button>
        <button
          type="button"
          onClick={handleSyncSchedule}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 border border-amber-300 rounded-lg hover:bg-amber-50 disabled:opacity-50"
        >
          <FiClock /> {syncing ? 'Syncing...' : 'Sync Schedule'}
        </button>
        <button
          type="button"
          onClick={handleDetectChronic}
          disabled={analyzingChronic || entries.length < 2}
          className="flex items-center gap-2 px-3 py-2 text-sm text-violet-900 border border-violet-300 bg-violet-50 rounded-lg hover:bg-violet-100 disabled:opacity-50"
          title="Use AI to find recurring defects across the logbook history"
        >
          <FiRefreshCw className={analyzingChronic ? 'animate-spin' : ''} />
          {analyzingChronic ? 'Analysing…' : 'Detect Chronic Issues'}
        </button>
        {isAdmin && (
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-xs text-stone-700 border border-amber-300 rounded-lg hover:bg-amber-50"
            >
              <FiTool /> Seed Rules
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-72 bg-[#fffaf2] border border-amber-300 rounded-lg shadow-xl z-50">
              {!loadedPacks.has('part43') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await seedRules();
                      toast.success(`Seeded ${result.seeded} Part 43/91 rules`);
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-stone-900"
                >
                  Part 43 + Part 91 (core)
                </button>
              )}
              {Object.entries(ALL_RULE_PACKS).map(([packId]) => (
                <button
                  key={packId}
                  type="button"
                  disabled={loadedPacks.has(packId)}
                  onClick={() => handleSeedPack(packId)}
                  className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-stone-900 disabled:opacity-40 disabled:cursor-default"
                >
                  {RULE_PACK_LABELS[packId] ?? packId}
                  {loadedPacks.has(packId) && <span className="ml-2 text-green-700">(loaded)</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ml-auto px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:border-sky-600"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      {/* Severity Summary */}
      <div className="flex gap-4">
        {([['critical', 'bg-red-100 text-red-800 border-red-200'], ['major', 'bg-orange-100 text-orange-800 border-orange-200'], ['minor', 'bg-amber-100 text-amber-800 border-amber-200']] as const).map(([sev, cls]) => (
          <div key={sev} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${cls}`}>
            {severityCounts[sev]} {sev}
          </div>
        ))}
      </div>

      {/* Chronic Issues Panel */}
      {chronicResult && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-violet-200">
            <div className="flex items-center gap-2">
              <FiRefreshCw className="text-violet-700" />
              <span className="text-sm font-semibold text-violet-900 font-['Source_Serif_4',serif]">
                Chronic Issue Analysis
              </span>
              {chronicResult.clusters.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-violet-200 text-violet-900 border border-violet-300">
                  {chronicResult.clusters.length} pattern{chronicResult.clusters.length > 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <span className="text-[10px] text-stone-500">
              {chronicResult.entriesAnalysed} entries analysed
              {chronicResult.entriesSkipped > 0 && ` · ${chronicResult.entriesSkipped} skipped (cap)`}
            </span>
          </div>

          {chronicResult.clusters.length === 0 ? (
            <p className="px-4 py-3 text-sm text-stone-600">No recurring defect patterns detected.</p>
          ) : (
            <div className="divide-y divide-violet-200">
              {chronicResult.clusters.map((cluster, idx) => {
                const isExpanded = chronicExpandedIdx === idx;
                const riskCls =
                  cluster.riskLevel === 'high'
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : cluster.riskLevel === 'medium'
                    ? 'bg-orange-100 text-orange-800 border-orange-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200';
                const borderCls =
                  cluster.riskLevel === 'high'
                    ? 'border-l-red-500'
                    : cluster.riskLevel === 'medium'
                    ? 'border-l-orange-500'
                    : 'border-l-amber-500';
                return (
                  <div key={idx} className={`border-l-4 ${borderCls}`}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-violet-100/60 transition-colors"
                      onClick={() => setChronicExpandedIdx(isExpanded ? null : idx)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${riskCls}`}>
                              {cluster.riskLevel}
                            </span>
                            <span className="text-sm font-semibold text-stone-900">
                              {cluster.theme}
                            </span>
                            <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                              {cluster.category}{cluster.ataChapter ? ` · ATA ${cluster.ataChapter}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-stone-600 flex-wrap">
                            <span className="font-semibold text-violet-800">{cluster.occurrences}× in {cluster.spanDays} days</span>
                            <span>{cluster.firstSeen} → {cluster.lastSeen}</span>
                          </div>
                          <p className="mt-1 text-xs text-stone-700 italic">{cluster.recommendation}</p>
                        </div>
                        <FiChevronRight
                          className={`flex-shrink-0 text-violet-500 transition-transform mt-1 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-1.5">
                        <p className="text-[10px] text-stone-500 uppercase tracking-wide font-semibold mb-2">
                          Matching Entries
                        </p>
                        {cluster.entries.map((e) => (
                          <div
                            key={e._id}
                            className="flex gap-3 rounded border border-violet-200 bg-white px-3 py-2 text-xs"
                          >
                            <span className="font-mono text-stone-500 flex-shrink-0 w-24">{e.entryDate ?? '—'}</span>
                            <span className="text-stone-800 flex-1 min-w-0 truncate font-['Source_Serif_4',serif]">
                              {e.workPerformed || e.rawText.slice(0, 100)}
                            </span>
                            {e.totalTimeAtEntry !== undefined && (
                              <span className="font-mono tabular-nums text-stone-500 flex-shrink-0">
                                {e.totalTimeAtEntry.toFixed(1)} hrs
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AD/SB Compliance Matrix */}
      {adSbMatrix.length > 0 && (
        <details className="rounded-lg border border-amber-300/80 bg-[#fffdf7] shadow-sm">
          <summary className="flex items-center gap-2 cursor-pointer px-4 py-3 select-none text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">
            <FiCheck className="text-green-700 flex-shrink-0" />
            AD/SB References
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-800 border border-green-200 font-semibold">
              {adSbMatrix.length} documented
            </span>
          </summary>
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-500 border-b border-amber-200">
                  <th className="text-left py-2 px-2 font-medium">AD/SB Reference</th>
                  <th className="text-left py-2 px-2 font-medium">Last Complied</th>
                  <th className="text-right py-2 px-2 font-medium">Entries</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {adSbMatrix.map(({ ref, latestDate, count }) => (
                  <tr key={ref} className="border-b border-amber-100 hover:bg-amber-50/50">
                    <td className="py-1.5 px-2 font-mono text-stone-900">{ref}</td>
                    <td className="py-1.5 px-2 text-stone-600">{latestDate ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right text-stone-600 tabular-nums">{count}</td>
                    <td className="py-1.5 px-2">
                      <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 border border-green-200 text-[10px] font-medium">
                        Documented
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Findings List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          <FiAlertTriangle className="text-3xl mx-auto mb-2" />
          <p className="text-sm">{findings.length === 0 ? 'No findings yet. Run compliance checks to analyze entries.' : 'No findings match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <FindingCard key={f._id} finding={f} onUpdateStatus={updateFindingStatus} onConvertToIssue={handleConvertToIssue} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── FindingCard ────────────────────────────────────────────────────── */

function FindingCard({ finding, onUpdateStatus, onConvertToIssue }: { finding: ComplianceFinding; onUpdateStatus: any; onConvertToIssue: (f: ComplianceFinding) => void }) {
  const severityColors: Record<string, string> = {
    critical: 'border-l-red-600 bg-red-50',
    major: 'border-l-orange-600 bg-orange-50',
    minor: 'border-l-amber-600 bg-amber-50',
  };

  return (
    <div className={`border border-amber-300/80 border-l-2 ${severityColors[finding.severity] ?? ''} rounded-lg p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${
              finding.severity === 'critical' ? 'bg-red-100 text-red-800' :
              finding.severity === 'major' ? 'bg-orange-100 text-orange-800' :
              'bg-amber-100 text-amber-800'
            }`}>{finding.severity}</span>
            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-stone-100 text-stone-600">{finding.findingType.replace('_', ' ')}</span>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
              finding.status === 'open' ? 'bg-sky-100 text-sky-900' :
              finding.status === 'resolved' ? 'bg-green-100 text-green-800' :
              finding.status === 'false_positive' ? 'bg-stone-100 text-stone-500' :
              'bg-amber-100 text-amber-800'
            }`}>{finding.status}</span>
          </div>
          <h4 className="text-sm font-medium text-stone-900 mb-1 font-['Source_Serif_4',serif]">{finding.title}</h4>
          <p className="text-xs text-stone-700 mb-2">{finding.description}</p>
          <div className="text-[11px] text-sky-700 font-mono">{finding.citation}</div>
        </div>
        {finding.status === 'open' && (
          <div className="flex gap-1 flex-shrink-0">
            {!finding.convertedToIssueId && (
              <button
                type="button"
                onClick={() => onConvertToIssue(finding)}
                className="p-1.5 text-stone-500 hover:text-sky-800 hover:bg-sky-100 rounded transition-colors"
                title="Convert to CAR"
              >
                <FiAlertTriangle className="text-sm" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onUpdateStatus({ findingId: finding._id as any, status: 'acknowledged' })}
              className="p-1.5 text-stone-500 hover:text-amber-800 hover:bg-amber-100 rounded transition-colors"
              title="Acknowledge"
            >
              <FiCheck className="text-sm" />
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus({ findingId: finding._id as any, status: 'false_positive' })}
              className="p-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
              title="Mark false positive"
            >
              <FiX className="text-sm" />
            </button>
          </div>
        )}
      </div>
      {finding.evidenceSnippet && (
        <pre className="mt-2 text-[10px] text-stone-600 bg-[#fffdf7] border border-amber-200 rounded p-2 whitespace-pre-wrap">{finding.evidenceSnippet}</pre>
      )}
    </div>
  );
}
