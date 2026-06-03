/** Compact label/value pair used in the DCT Compliance settings + overview panels. */
export function InfoRow({
  label,
  value,
  highlight,
  note,
}: {
  label: string;
  value: string;
  highlight?: 'amber' | 'red' | 'green';
  note?: string;
}) {
  const highlightClass =
    highlight === 'amber'
      ? 'text-amber-200'
      : highlight === 'red'
        ? 'text-red-300'
        : highlight === 'green'
          ? 'text-emerald-300'
          : 'text-white';
  return (
    <div>
      <div className="text-white/50 text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`text-sm mt-0.5 ${highlightClass}`}>
        {value}
        {note ? <span className="ml-1 text-[10px] uppercase">({note})</span> : null}
      </div>
    </div>
  );
}
