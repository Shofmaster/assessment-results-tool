import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiDownload } from 'react-icons/fi';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAppStore } from '../store/appStore';
import {
  useAircraftAssets,
  useInspectionScheduleItems,
  useLogbookEntries,
  useScheduleLogbookCrossRef,
} from '../hooks/useConvexData';
import { buildComplianceReportPdf } from '../services/complianceReportPdf';
import { Button, GlassCard, Select } from './ui';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { toast } from 'sonner';

function downloadBlob(filename: string, data: Uint8Array) {
  const blob = new Blob([data as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComplianceReport() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const aircraft = (useAircraftAssets(activeProjectId ?? undefined) ?? []) as any[];
  const [aircraftId, setAircraftId] = useState<string>('');

  const effectiveAircraftId = aircraftId || aircraft[0]?._id;
  const scheduleItems = useInspectionScheduleItems(activeProjectId ?? undefined) as any[] | undefined;
  const entries = useLogbookEntries(activeProjectId ?? undefined, effectiveAircraftId) as any[] | undefined;
  const cross = useScheduleLogbookCrossRef(scheduleItems, entries);

  const statusByAta = useMemo(() => {
    const map = new Map<string, { ata: string; overdue: number; due_soon: number; current: number; never: number }>();
    for (const row of cross) {
      const ata = row.item.ataChapter || row.item.category || '—';
      if (!map.has(ata)) map.set(ata, { ata, overdue: 0, due_soon: 0, current: 0, never: 0 });
      const m = map.get(ata)!;
      if (row.status === 'overdue') m.overdue += 1;
      else if (row.status === 'due_soon') m.due_soon += 1;
      else if (row.status === 'current') m.current += 1;
      else m.never += 1;
    }
    return Array.from(map.values());
  }, [cross]);

  const handlePdf = async () => {
    try {
      const bytes = await buildComplianceReportPdf('Inspection schedule vs logbook', cross);
      downloadBlob(`compliance-report-${new Date().toISOString().slice(0, 10)}.pdf`, bytes);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'PDF failed');
    }
  };

  const handleCsv = () => {
    const lines = [
      ['title', 'status', 'nextDue', 'lastEvidence', 'matchedEntryDate', 'ataChapter'].join(','),
      ...cross.map((r) =>
        [
          JSON.stringify(r.item.title),
          r.status,
          r.nextDue ?? '',
          r.lastEvidenceDate ?? '',
          r.matchedEntry?.entryDate ?? '',
          r.item.ataChapter ?? '',
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  if (!activeProjectId) {
    return (
      <div className="p-8 text-center text-white/70">
        Select a project to view the compliance report.
        <Button className="mt-4 block mx-auto" onClick={() => navigate('/logbook')}>
          Open Logbook
        </Button>
      </div>
    );
  }

  if (!aircraft.length) {
    return (
      <div className="p-8 text-center text-white/70">
        Add an aircraft to the project to correlate the schedule with logbook entries.
        <Button className="mt-4 block mx-auto" onClick={() => navigate('/logbook')}>
          Open Logbook
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 overflow-auto">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Button variant="secondary" icon={<FiArrowLeft />} onClick={() => navigate(-1)}>
          Back
        </Button>
        <h1 className="text-2xl font-display font-bold text-white flex-1">Compliance report</h1>
        <Button variant="primary" icon={<FiDownload />} onClick={() => void handlePdf()}>
          PDF
        </Button>
        <Button variant="secondary" icon={<FiDownload />} onClick={handleCsv}>
          CSV
        </Button>
      </div>

      <GlassCard className="mb-6">
        <label className="block text-sm text-white/70 mb-2">Aircraft (logbook join)</label>
        <Select
          className="max-w-md"
          value={effectiveAircraftId ?? ''}
          onChange={(e) => setAircraftId(e.target.value)}
        >
          {aircraft.map((a: any) => (
            <option key={a._id} value={a._id}>
              {a.tailNumber}
            </option>
          ))}
        </Select>
      </GlassCard>

      <GlassCard className="mb-6 min-h-[320px] h-[360px]">
        <h2 className="text-lg font-semibold text-white mb-2">Schedule items by ATA vs status</h2>
        {statusByAta.length === 0 ? (
          <p className="text-white/50 text-sm">No schedule items or no ATA tags — add items from Inspection Schedule or extract from manuals.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusByAta} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" />
              <XAxis dataKey="ata" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
              <YAxis tick={{ fill: '#cbd5e1', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
              <Legend />
              <Bar dataKey="overdue" stackId="a" fill="#f87171" name="Overdue" />
              <Bar dataKey="due_soon" stackId="a" fill="#fbbf24" name="Due soon" />
              <Bar dataKey="current" stackId="a" fill="#4ade80" name="Current" />
              <Bar dataKey="never" stackId="a" fill="#94a3b8" name="No date / never" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-3">Detail</h2>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto text-sm">
          <table className="w-full text-left text-white/90">
            <thead className="sticky top-0 bg-slate-900/95">
              <tr>
                <th className="p-2">Title</th>
                <th className="p-2">Status</th>
                <th className="p-2">Next due</th>
                <th className="p-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {cross.map((r) => (
                <tr key={r.item._id} className="border-t border-white/10">
                  <td className="p-2">{r.item.title}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.nextDue ?? '—'}</td>
                  <td className="p-2 text-white/70">
                    {r.matchedEntry?.entryDate ?? r.lastEvidenceDate ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
