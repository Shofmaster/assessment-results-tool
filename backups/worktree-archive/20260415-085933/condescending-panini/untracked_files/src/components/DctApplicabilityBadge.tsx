/**
 * DctApplicabilityBadge — color-coded badge with tooltip for DCT matrix rows.
 * Green = applicable, amber = uncertain, gray = not applicable.
 */

import { useState } from "react";
import type { ApplicabilityResult } from "../services/dctApplicabilityEngine";

interface Props {
  result: ApplicabilityResult | undefined;
  /** If true, shows a compact dot instead of text badge. */
  compact?: boolean;
}

export default function DctApplicabilityBadge({ result, compact = false }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!result) return null;

  const isApplicable = result.applicable;
  const isUncertain = result.applicable && result.confidence < 0.7;

  const color = !isApplicable
    ? "text-white/30 border-white/10 bg-white/5"
    : isUncertain
      ? "text-amber-300 border-amber-400/20 bg-amber-500/10"
      : "text-emerald-300 border-emerald-400/20 bg-emerald-500/10";

  const label = !isApplicable ? "N/A" : isUncertain ? "?" : "✓";
  const tooltip = !isApplicable ? "Not applicable" : isUncertain ? "Uncertain" : "Applicable";

  return (
    <div className="relative inline-flex" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      {compact ? (
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            !isApplicable ? "bg-white/20" : isUncertain ? "bg-amber-400" : "bg-emerald-400"
          }`}
          title={tooltip}
        />
      ) : (
        <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border font-mono ${color} cursor-default`}>
          {label}
        </span>
      )}

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 rounded-lg border border-white/15 bg-slate-900 shadow-xl p-3 pointer-events-none">
          <p className={`text-xs font-semibold mb-1.5 ${
            !isApplicable ? "text-white/50" : isUncertain ? "text-amber-300" : "text-emerald-300"
          }`}>
            {tooltip} {result.confidence > 0 ? `(${Math.round(result.confidence * 100)}% confidence)` : ""}
          </p>

          {result.reasons.length > 0 && (
            <div className="mb-1.5">
              <p className="text-xs text-white/40 mb-0.5">Reasons:</p>
              <ul className="space-y-0.5">
                {result.reasons.map((r, i) => (
                  <li key={i} className="text-xs text-white/65 flex gap-1">
                    <span className="text-emerald-400 shrink-0">✓</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.missingConditions.length > 0 && (
            <div>
              <p className="text-xs text-white/40 mb-0.5">Missing conditions:</p>
              <ul className="space-y-0.5">
                {result.missingConditions.map((m, i) => (
                  <li key={i} className="text-xs text-white/55 flex gap-1">
                    <span className="text-red-400 shrink-0">✗</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
