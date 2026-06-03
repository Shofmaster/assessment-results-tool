import { FiDownload, FiFileText, FiRefreshCw } from 'react-icons/fi';
import { Button, GlassCard } from '../ui';

/**
 * Reports tab: saved report-snapshot history + revision-check run history,
 * with actions to export a PDF or persist a new snapshot.
 */
export function ReportsTab({
  reports,
  revisions,
  onPdf,
  onPersistReport,
}: {
  reports: any[] | undefined;
  revisions: any[] | undefined;
  onPdf: () => void;
  onPersistReport: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FiFileText /> Reports
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<FiDownload />} onClick={() => void onPdf()}>
              PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void onPersistReport()}>
              Save snapshot
            </Button>
          </div>
        </div>
        <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">History</h3>
        <ul className="text-sm space-y-1.5 text-white/80 max-h-[440px] overflow-y-auto pr-1">
          {(reports ?? []).map((r) => (
            <li
              key={r._id}
              className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg hover:bg-white/5 border border-white/5"
            >
              <span className="truncate">{r.title}</span>
              <span className="text-white/40 whitespace-nowrap text-xs">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
          {!reports?.length ? <li className="text-white/40 px-3 py-2">No saved reports yet.</li> : null}
        </ul>
      </GlassCard>

      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FiRefreshCw /> Revision checks
        </h2>
        <ul className="text-xs text-white/70 space-y-2 max-h-[440px] overflow-y-auto pr-1">
          {(revisions ?? []).map((r) => (
            <li key={r._id} className="border-l-2 border-sky-500/40 pl-3 py-1">
              <div className="text-white/50 text-[10px] uppercase">{r.kind}</div>
              <div className="text-white/90">{r.summary}</div>
              <div className="text-white/30 text-[10px] mt-0.5">
                {r.startedAt ? new Date(r.startedAt).toLocaleString() : ''}
              </div>
            </li>
          ))}
          {!revisions?.length ? <li className="text-white/40">No runs yet.</li> : null}
        </ul>
      </GlassCard>
    </div>
  );
}
