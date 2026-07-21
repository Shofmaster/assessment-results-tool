/**
 * ReadinessChecklist — shared "before you run" prerequisite/gap list.
 *
 * Renders a compact list of readiness items with a status icon, optional
 * detail line, and an optional inline action (router link or button) that
 * resolves the gap. Consumers build items via the adapters in ./adapters.ts.
 *
 * Status semantics:
 *  - 'missing'  → hard prerequisite; the consumer should disable its Run action
 *                 (use hasBlockingGaps to derive this).
 *  - 'warning'  → soft gap; the action is allowed but results are degraded.
 *  - 'ready'    → satisfied.
 */
import { Link } from 'react-router-dom';
import { FiCheck, FiAlertCircle, FiAlertTriangle } from 'react-icons/fi';

export type ReadinessItemStatus = 'ready' | 'missing' | 'warning';

export interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessItemStatus;
  detail?: string;
  action?:
    | { kind: 'link'; label: string; to: string }
    | { kind: 'button'; label: string; onClick: () => void };
}

/** True when any item is a hard (blocking) prerequisite that is unmet. */
export function hasBlockingGaps(items: ReadinessItem[]): boolean {
  return items.some((i) => i.status === 'missing');
}

interface ReadinessChecklistProps {
  title?: string;
  items: ReadinessItem[];
  compact?: boolean;
  /** When every item is ready, collapse to a single confirmation line. Default true. */
  collapseWhenReady?: boolean;
  className?: string;
}

const STATUS_ICON: Record<ReadinessItemStatus, React.ReactNode> = {
  ready: <FiCheck className="w-4 h-4 text-emerald-400" aria-hidden />,
  warning: <FiAlertTriangle className="w-4 h-4 text-amber-400" aria-hidden />,
  missing: <FiAlertCircle className="w-4 h-4 text-red-400" aria-hidden />,
};

const STATUS_TEXT: Record<ReadinessItemStatus, string> = {
  ready: 'text-white/75',
  warning: 'text-white/85',
  missing: 'text-white/90',
};

function ItemAction({ action }: { action: NonNullable<ReadinessItem['action']> }) {
  const cls =
    'text-xs font-medium text-sky-light hover:text-sky-lighter underline underline-offset-2 shrink-0';
  if (action.kind === 'link') {
    return (
      <Link to={action.to} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}

export default function ReadinessChecklist({
  title,
  items,
  compact = false,
  collapseWhenReady = true,
  className = '',
}: ReadinessChecklistProps) {
  if (items.length === 0) return null;

  const allReady = items.every((i) => i.status === 'ready');
  if (allReady && collapseWhenReady) {
    return (
      <div className={`flex items-center gap-2 text-sm text-emerald-300/90 ${className}`}>
        <FiCheck className="w-4 h-4" aria-hidden />
        <span>All prerequisites met</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {title ? (
        <p className="text-xs font-semibold text-sky-light mb-1.5">{title}</p>
      ) : null}
      <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 ${
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
            }`}
          >
            <span className="mt-0.5 shrink-0">{STATUS_ICON[item.status]}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${STATUS_TEXT[item.status]}`}>{item.label}</span>
              {item.detail ? (
                <span className="block text-xs text-white/55 mt-0.5">{item.detail}</span>
              ) : null}
            </span>
            {item.action ? <ItemAction action={item.action} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
