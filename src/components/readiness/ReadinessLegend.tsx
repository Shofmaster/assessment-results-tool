/**
 * ReadinessLegend — explains the colored readiness/attention dots used in the
 * sidebar nav. Rendered as a small "?" trigger with a popover. Copy and dot
 * visuals are sourced from readinessSeverity.ts / ReadinessDot.tsx so the
 * legend can't drift from what the dots actually mean.
 */
import { useEffect, useRef, useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import { navAttentionTitle } from '../../utils/readinessSeverity';
import { NavAttentionDot, NavSectionActivityDot } from '../ReadinessDot';

type Props = {
  isDarkMode: boolean;
  className?: string;
};

export default function ReadinessLegend({ isDarkMode, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const panelClass = isDarkMode
    ? 'bg-navy-900 border-white/15 text-white/85'
    : 'bg-white border-slate-200 text-slate-700 shadow-lg';

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label="What do the colored dots mean?"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-center rounded-full p-0.5 transition-colors ${
          isDarkMode ? 'text-white/40 hover:text-white/80' : 'text-slate-400 hover:text-slate-700'
        }`}
      >
        <FiHelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          role="tooltip"
          className={`absolute left-0 top-full z-30 mt-1.5 w-56 rounded-xl border p-3 text-xs ${panelClass}`}
        >
          <p className="font-semibold mb-2">Dot colors</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2">
              <NavAttentionDot level="overdue" isDarkMode={isDarkMode} title={navAttentionTitle('overdue')} />
              <span>{navAttentionTitle('overdue')}</span>
            </li>
            <li className="flex items-center gap-2">
              <NavAttentionDot level="due_soon" isDarkMode={isDarkMode} title={navAttentionTitle('due_soon')} />
              <span>{navAttentionTitle('due_soon')}</span>
            </li>
            <li className="flex items-center gap-2">
              <NavSectionActivityDot isDarkMode={isDarkMode} title="Has saved content" />
              <span>Has saved content in this project</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
