/** Stylized Quality Command Center preview used as the landing hero visual. */
export default function LandingProductPreview() {
  return (
    <div
      className="landing-product-preview relative w-full max-w-3xl mx-auto lg:mx-0 lg:max-w-none"
      aria-hidden="true"
    >
      <div className="relative rounded-sm border border-[#1e3a5f] bg-[#0c1c30] shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[#1e3a5f] bg-[#0a1628] px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-sm bg-accent-gold" />
            <span className="font-landing-display text-[13px] tracking-wide text-white/90 truncate">
              Quality Command Center
            </span>
          </div>
          <span className="text-[11px] text-white/40 font-landing tabular-nums shrink-0">Part 145 · Live</span>
        </div>

        <div className="grid sm:grid-cols-[1fr_1.15fr] gap-0">
          {/* Readiness */}
          <div className="p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-[#1e3a5f]">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-landing font-semibold">
              Audit readiness
            </p>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-landing-display text-5xl leading-none text-white tabular-nums">84</span>
              <span className="text-sm text-sky-light pb-1">/ 100</span>
            </div>
            <div className="mt-4 h-1.5 w-full bg-white/10 overflow-hidden">
              <div className="landing-readiness-bar h-full w-[84%] bg-sky" />
            </div>
            <p className="mt-3 text-xs text-white/50 leading-relaxed">
              3 open findings · 2 manuals past review · Inspection block next week
            </p>
          </div>

          {/* Issues list */}
          <div className="p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-landing font-semibold">
              Needs attention
            </p>
            <ul className="mt-3 space-y-2.5">
              {[
                { label: 'Training currency — 2 technicians', tone: 'text-accent-gold' },
                { label: 'RSM Rev H awaiting acceptance', tone: 'text-sky-light' },
                { label: 'CAR-241 overdue evidence', tone: 'text-rose-300' },
              ].map((row) => (
                <li
                  key={row.label}
                  className="flex items-start gap-2.5 text-[13px] text-white/75 leading-snug"
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${row.tone} bg-current`} />
                  {row.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="grid grid-cols-3 border-t border-[#1e3a5f] divide-x divide-[#1e3a5f] text-center">
          {[
            { k: 'Library', v: '1,248 docs' },
            { k: 'Guided audits', v: '12 active' },
            { k: 'Next EPI', v: '18 days' },
          ].map((cell) => (
            <div key={cell.k} className="px-2 py-3">
              <div className="text-[10px] uppercase tracking-wider text-white/35 font-landing">{cell.k}</div>
              <div className="mt-0.5 text-xs font-semibold text-white/80 font-landing tabular-nums">{cell.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
