import { useId, type ReactNode } from 'react';

export interface FieldProps {
  label: ReactNode;
  /** Help text rendered below the control. */
  help?: ReactNode;
  /** Warning/error text rendered below the help text. */
  hint?: ReactNode;
  hintTone?: 'amber' | 'rose' | 'sky';
  /** Receives the generated id so the control can wire up htmlFor/aria. */
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
  className?: string;
}

const hintTones = {
  amber: 'text-amber-400/90',
  rose: 'text-rose-300',
  sky: 'text-sky-100/80',
} as const;

/**
 * Label + control + help/hint wrapper so settings sections read declaratively
 * and every control gets a properly associated label and description.
 */
export function Field({
  label,
  help,
  hint,
  hintTone = 'amber',
  children,
  className = '',
}: FieldProps) {
  // Strip the colons React's useId emits so the id is CSS-selector safe.
  const id = `field${useId().replace(/:/g, '')}`;
  const helpId = help ? `${id}-help` : undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium mb-2 text-white/80">
        {label}
      </label>
      {children({ id, describedBy: helpId })}
      {help && (
        <p id={helpId} className="text-sm text-white/50 mt-1">
          {help}
        </p>
      )}
      {hint && <p className={`text-sm mt-1 ${hintTones[hintTone]}`}>{hint}</p>}
    </div>
  );
}
