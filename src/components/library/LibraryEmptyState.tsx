import type { ReactNode } from 'react';

type Props = {
  icon: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
};

/**
 * Compact, purposeful empty state — a modest framed icon, a single clear line,
 * and (optionally) the action that resolves it. Deliberately not a giant faded
 * glyph floating in whitespace.
 */
export default function LibraryEmptyState({ icon, title, hint, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-2xl text-white/45">
        {icon}
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-white/85">{title}</p>
        {hint ? <p className="mt-1 text-xs text-white/60">{hint}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
