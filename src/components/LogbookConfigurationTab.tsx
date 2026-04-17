import { useState, useMemo } from 'react';
import {
  useAircraftComponents,
  useAddAircraftComponent,
} from '../hooks/useConvexData';
import {
  type AircraftAsset,
  type LogbookEntry,
  type AircraftComponent,
} from '../types/logbook';
import {
  calcTTL,
  calcUtilizationRate,
  fmtMonths,
  type TTLResult,
} from '../utils/logbookUtils';
import { FiPlus } from 'react-icons/fi';
import { toast } from 'sonner';

export default function LogbookConfigurationTab({
  projectId,
  aircraftId,
  aircraft,
  currentTT,
  entries,
}: {
  projectId: string;
  aircraftId: string;
  aircraft: AircraftAsset;
  currentTT?: number;
  entries: LogbookEntry[];
}) {
  const components = (useAircraftComponents(projectId, aircraftId, 'installed') ?? []) as AircraftComponent[];
  const removedComponents = (useAircraftComponents(projectId, aircraftId, 'removed') ?? []) as AircraftComponent[];
  const addComponent = useAddAircraftComponent();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ partNumber: '', serialNumber: '', description: '', ataChapter: '', position: '' });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!addForm.partNumber.trim() || !addForm.description.trim()) {
      toast.error('Part number and description are required');
      return;
    }
    setSaving(true);
    try {
      await addComponent({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        partNumber: addForm.partNumber.trim(),
        serialNumber: addForm.serialNumber || undefined,
        description: addForm.description.trim(),
        ataChapter: addForm.ataChapter || undefined,
        position: addForm.position || undefined,
      });
      toast.success('Component added');
      setShowAdd(false);
      setAddForm({ partNumber: '', serialNumber: '', description: '', ataChapter: '', position: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to add component');
    } finally {
      setSaving(false);
    }
  };

  // ── Life Limits Dashboard ─────────────────────────────────────────────
  const utilizationRate = useMemo(() => calcUtilizationRate(entries), [entries]);

  const lifeLimitedComponents = useMemo(() => {
    return components
      .filter((c) => c.isLifeLimited && c.lifeLimit)
      .map((c) => ({ c, ttl: calcTTL(c, currentTT) }))
      .filter((x) => x.ttl !== null)
      .sort((a, b) => {
        // Sort by urgency: overdue first, then by remainingPct asc, then manual-check last
        const aR = a.ttl!.manualCheck ? 1 : a.ttl!.remaining <= 0 ? -1 : a.ttl!.remainingPct;
        const bR = b.ttl!.manualCheck ? 1 : b.ttl!.remaining <= 0 ? -1 : b.ttl!.remainingPct;
        return aR - bR;
      }) as { c: AircraftComponent; ttl: TTLResult }[];
  }, [components, currentTT, entries]);

  const overdueCt = lifeLimitedComponents.filter((x) => !x.ttl.manualCheck && x.ttl.remaining <= 0).length;
  const warnCt = lifeLimitedComponents.filter((x) => !x.ttl.manualCheck && x.ttl.remaining > 0 && x.ttl.remainingPct < 0.20).length;

  return (
    <div className="space-y-6 text-stone-800">

      {/* ── Life Limits Dashboard ── */}
      {lifeLimitedComponents.length > 0 && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">Life Limits Dashboard</h3>
            <div className="flex gap-2 text-[11px]">
              {overdueCt > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 font-bold">
                  {overdueCt} OVERDUE
                </span>
              )}
              {warnCt > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                  {warnCt} within 20%
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                {lifeLimitedComponents.length} life-limited
              </span>
              {utilizationRate !== null && (
                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                  ≈ {utilizationRate.toFixed(1)} hrs/mo
                </span>
              )}
            </div>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {lifeLimitedComponents.map(({ c, ttl }) => {
              const isManual = ttl.manualCheck;
              const isOverdue = !isManual && ttl.remaining <= 0;
              const pct = isManual ? 0 : Math.min(1, ttl.currentUsed / ttl.lifeLimit);
              const statusLabel = isManual ? 'manual check'
                : isOverdue ? 'OVERDUE'
                : ttl.remainingPct < 0.05 ? 'CRITICAL'
                : ttl.remainingPct < 0.20 ? 'WARNING'
                : 'OK';
              const statusCls = isManual ? 'bg-sky-100 text-sky-800 border-sky-200'
                : isOverdue ? 'bg-red-200 text-red-900 border-red-300'
                : ttl.remainingPct < 0.05 ? 'bg-red-100 text-red-800 border-red-200'
                : ttl.remainingPct < 0.20 ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-green-100 text-green-800 border-green-200';
              const barColor = isOverdue ? 'bg-red-600'
                : !isManual && ttl.remainingPct < 0.05 ? 'bg-red-500'
                : !isManual && ttl.remainingPct < 0.20 ? 'bg-amber-500'
                : 'bg-emerald-500';
              const borderCls = isOverdue ? 'border-red-300' : !isManual && ttl.remainingPct < 0.20 ? 'border-amber-300' : 'border-amber-200/80';

              // Projected expiry (hours-based only)
              let projExpiry: string | null = null;
              if (!isManual && ttl.unit === 'hours' && ttl.remaining > 0 && utilizationRate && utilizationRate > 0) {
                const moRemaining = ttl.remaining / utilizationRate;
                const exp = new Date();
                exp.setMonth(exp.getMonth() + Math.round(moRemaining));
                projExpiry = exp.toISOString().slice(0, 7);
              }

              return (
                <div key={c._id} className={`rounded-lg border ${borderCls} bg-[#fffdf7] p-4 shadow-sm`}>
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${statusCls}`}>
                          {statusLabel}
                        </span>
                        {c.ataChapter && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-stone-100 text-stone-600 border border-stone-200">
                            ATA {c.ataChapter}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-stone-900 truncate">{c.description}</p>
                      <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                        P/N {c.partNumber}{c.serialNumber && ` · S/N ${c.serialNumber}`}
                        {c.position && ` · ${c.position}`}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {!isManual && (
                    <div className="mb-2">
                      <div className="w-full h-2.5 rounded-full bg-stone-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-stone-500 mt-0.5">
                        <span>{(pct * 100).toFixed(0)}% used</span>
                        <span>{(100 - pct * 100).toFixed(0)}% remaining</span>
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  {isManual ? (
                    <p className="text-xs text-stone-600">
                      Life limit: <span className="font-semibold">{ttl.lifeLimit} {ttl.unit.replace('_', ' ')}</span> — verify manually
                    </p>
                  ) : (
                    <div className="space-y-0.5 text-xs text-stone-700">
                      <div className="flex gap-4 tabular-nums flex-wrap">
                        <span>
                          <span className="text-stone-500">Used: </span>
                          <span className="font-semibold">
                            {ttl.unit === 'calendar_months' ? fmtMonths(ttl.currentUsed) : ttl.currentUsed.toFixed(1)}
                          </span>
                        </span>
                        <span>
                          <span className="text-stone-500">Limit: </span>
                          <span className="font-semibold">
                            {ttl.unit === 'calendar_months' ? fmtMonths(ttl.lifeLimit) : `${ttl.lifeLimit} ${ttl.unit}`}
                          </span>
                        </span>
                        <span className={isOverdue ? 'text-red-700 font-bold' : ''}>
                          <span className="text-stone-500">{isOverdue ? 'Over by: ' : 'Remaining: '}</span>
                          <span className="font-semibold">
                            {ttl.unit === 'calendar_months'
                              ? fmtMonths(Math.abs(ttl.remaining))
                              : `${Math.abs(ttl.remaining).toFixed(1)} ${ttl.unit}`}
                          </span>
                        </span>
                      </div>
                      {projExpiry && (
                        <p className="text-[11px] text-stone-500 mt-1">
                          At {utilizationRate!.toFixed(1)} hrs/mo → expires <span className="text-stone-700 font-medium">{projExpiry}</span>
                          {' '}({fmtMonths(ttl.remaining / utilizationRate!)})
                        </p>
                      )}
                      {ttl.unit === 'calendar_months' && c.installDate && (
                        <p className="text-[11px] text-stone-500">Installed {c.installDate}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aircraft Summary */}
      <div className="bg-[#fffdf7] border border-amber-300/80 rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-900 mb-3 font-['Source_Serif_4',serif]">Aircraft Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div><span className="text-stone-500 block">Tail</span><span className="text-stone-900 font-medium">{aircraft.tailNumber}</span></div>
          <div><span className="text-stone-500 block">Make/Model</span><span className="text-stone-800">{[aircraft.make, aircraft.model].filter(Boolean).join(' ')}</span></div>
          <div><span className="text-stone-500 block">Serial</span><span className="text-stone-800">{aircraft.serial ?? '—'}</span></div>
          <div><span className="text-stone-500 block">Baseline TT</span><span className="text-stone-800">{aircraft.baselineTotalTime ?? '—'}</span></div>
        </div>
      </div>

      {/* Installed Components */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">Installed Components ({components.length})</h3>
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs text-sky-800 hover:text-sky-900 transition-colors"
          >
            <FiPlus /> Add Component
          </button>
        </div>

        {showAdd && (
          <div className="bg-[#fffdf7] border border-amber-300/80 rounded-lg p-4 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {([['partNumber', 'Part Number *'], ['serialNumber', 'Serial Number'], ['description', 'Description *'], ['ataChapter', 'ATA Chapter'], ['position', 'Position']] as const).map(([key, label]) => (
                <div key={key} className={key === 'description' ? 'col-span-2' : ''}>
                  <input
                    type="text"
                    value={addForm[key]}
                    onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={label}
                    className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-sky-600"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-stone-500 hover:text-stone-900">Cancel</button>
              <button type="button" onClick={handleAdd} disabled={saving} className="px-3 py-1 text-xs bg-sky-700 text-white border border-sky-900/20 rounded hover:bg-sky-800 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {components.length === 0 ? (
          <p className="text-xs text-stone-500 py-4 text-center">No components tracked yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-amber-300/80 bg-[#fffdf7]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-600 border-b border-amber-200">
                  <th className="text-left py-2 px-2 font-medium">Part #</th>
                  <th className="text-left py-2 px-2 font-medium">Serial #</th>
                  <th className="text-left py-2 px-2 font-medium">Description</th>
                  <th className="text-left py-2 px-2 font-medium">ATA</th>
                  <th className="text-left py-2 px-2 font-medium">Position</th>
                  <th className="text-left py-2 px-2 font-medium">TSN Install</th>
                  <th className="text-left py-2 px-2 font-medium">Install Date</th>
                  <th className="text-left py-2 px-2 font-medium">Life Limit</th>
                  <th className="text-left py-2 px-2 font-medium">Current TSN</th>
                  <th className="text-left py-2 px-2 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => {
                  const ttl = calcTTL(c, currentTT);
                  return (
                    <tr key={c._id} className={`border-b border-amber-100 hover:bg-amber-50/60 ${ttl && !ttl.manualCheck && ttl.remaining <= 0 ? 'bg-red-50/40' : ''}`}>
                      <td className="py-2 px-2 text-stone-900 font-mono">{c.partNumber}</td>
                      <td className="py-2 px-2 text-stone-700 font-mono">{c.serialNumber ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-700">{c.description}</td>
                      <td className="py-2 px-2 text-stone-600">{c.ataChapter ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600">{c.position ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600 tabular-nums">{c.tsnAtInstall ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600">{c.installDate ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600 tabular-nums">
                        {c.isLifeLimited && c.lifeLimit ? `${c.lifeLimit} ${c.lifeLimitUnit ?? 'hrs'}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-stone-600 tabular-nums">
                        {ttl && !ttl.manualCheck ? ttl.currentUsed.toFixed(1) : '—'}
                      </td>
                      <td className="py-2 px-2">
                        {!ttl ? (
                          <span className="text-stone-400">—</span>
                        ) : ttl.manualCheck ? (
                          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                            Manual check ({ttl.lifeLimit} {ttl.unit})
                          </span>
                        ) : ttl.remaining <= 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 font-semibold">
                            OVERDUE {Math.abs(ttl.remaining).toFixed(1)} hrs
                          </span>
                        ) : ttl.remainingPct < 0.05 ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                            {ttl.remaining.toFixed(1)} hrs left
                          </span>
                        ) : ttl.remainingPct < 0.20 ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            {ttl.remaining.toFixed(1)} hrs left
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 border border-green-200">
                            {ttl.remaining.toFixed(1)} hrs left
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Removed Components */}
      {removedComponents.length > 0 && (
        <details className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-3">
          <summary className="text-xs text-stone-600 cursor-pointer mb-2">Removed Components ({removedComponents.length})</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-500 border-b border-amber-200">
                  <th className="text-left py-1 px-2 font-medium">Part #</th>
                  <th className="text-left py-1 px-2 font-medium">Serial #</th>
                  <th className="text-left py-1 px-2 font-medium">Description</th>
                  <th className="text-left py-1 px-2 font-medium">Removed</th>
                </tr>
              </thead>
              <tbody>
                {removedComponents.map((c) => (
                  <tr key={c._id} className="border-b border-amber-100 text-stone-600">
                    <td className="py-1 px-2 font-mono">{c.partNumber}</td>
                    <td className="py-1 px-2 font-mono">{c.serialNumber ?? '—'}</td>
                    <td className="py-1 px-2">{c.description}</td>
                    <td className="py-1 px-2">{c.removeDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
