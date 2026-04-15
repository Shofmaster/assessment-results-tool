/**
 * EntryReviewContextBar — framework, operator type, and optional aircraft selector
 * for the Entry Review page. Persists selections to localStorage.
 */

import { useState, useEffect } from 'react';

export type OperatorType = 'part91_owner' | 'part135' | 'part145' | 'ia_inspector' | 'other';
export type Framework = 'FAA' | 'EASA';

interface EntryReviewContextBarProps {
  framework: Framework;
  operatorType: OperatorType;
  onFrameworkChange: (f: Framework) => void;
  onOperatorTypeChange: (t: OperatorType) => void;
}

const OPERATOR_LABELS: Record<OperatorType, string> = {
  part91_owner: 'Part 91 Owner/Operator',
  part135: 'Part 135 Operator',
  part145: 'Part 145 Repair Station',
  ia_inspector: 'IA Inspector',
  other: 'Other',
};

const LS_KEY = 'aviation-entry-review-context';

interface PersistedContext {
  framework: Framework;
  operatorType: OperatorType;
}

export function usePersistedReviewContext(): [PersistedContext, (ctx: Partial<PersistedContext>) => void] {
  const [ctx, setCtx] = useState<PersistedContext>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw) as PersistedContext;
    } catch { /* fallthrough */ }
    return { framework: 'FAA' as Framework, operatorType: 'part91_owner' as OperatorType };
  });

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ctx)); } catch { /* best effort */ }
  }, [ctx]);

  const update = (partial: Partial<PersistedContext>) => {
    setCtx((prev) => ({ ...prev, ...partial }));
  };

  return [ctx, update];
}

export default function EntryReviewContextBar({
  framework,
  operatorType,
  onFrameworkChange,
  onOperatorTypeChange,
}: EntryReviewContextBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03]">
      {/* Framework radio */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-white/30 mr-1.5">Framework</span>
        {(['FAA', 'EASA'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFrameworkChange(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              framework === f
                ? 'bg-sky/20 text-sky-light border border-sky/40'
                : 'text-white/40 hover:text-white/60 border border-transparent'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <span className="text-white/10">|</span>

      {/* Operator type select */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/30">Operator</span>
        <select
          value={operatorType}
          onChange={(e) => onOperatorTypeChange(e.target.value as OperatorType)}
          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/70 focus:outline-none focus:border-sky/40 appearance-none cursor-pointer"
        >
          {(Object.keys(OPERATOR_LABELS) as OperatorType[]).map((t) => (
            <option key={t} value={t} className="bg-navy text-white">
              {OPERATOR_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
