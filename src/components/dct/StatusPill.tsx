/** Small colored count tile used in the overview status breakdown grid. */
export function StatusPill({
  color,
  label,
  count,
  pct,
}: {
  color: 'emerald' | 'amber' | 'red' | 'white';
  label: string;
  count: number;
  pct: number;
}) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    red: 'bg-red-500/10 text-red-200 border-red-500/30',
    white: 'bg-white/5 text-white/70 border-white/10',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[color]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-lg font-semibold">{count}</span>
        <span className="text-[10px] opacity-60">{pct}%</span>
      </div>
    </div>
  );
}
