import { forwardRef, useId, type ReactNode } from 'react';

export type ToggleSize = 'sm' | 'md';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: ToggleSize;
  /** Accessible name when the switch is not paired with a visible label. */
  'aria-label'?: string;
  /** Id of the element labelling this switch (used by ToggleRow). */
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  id?: string;
  className?: string;
}

const trackStyles: Record<ToggleSize, string> = {
  sm: 'h-5 w-9',
  md: 'h-6 w-11',
};

const thumbStyles: Record<ToggleSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

// track width - thumb width - 4px inset = travel distance
const thumbTranslate: Record<ToggleSize, string> = {
  sm: 'translate-x-5',
  md: 'translate-x-6',
};

/**
 * Accessible switch. Renders a real `role="switch"` button so screen readers
 * announce on/off state, and native button semantics give Space/Enter for free.
 */
export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, disabled = false, size = 'md', className = '', ...aria }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex flex-shrink-0 items-center rounded-full border transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-light focus-visible:ring-offset-2 focus-visible:ring-offset-navy',
          trackStyles[size],
          checked ? 'bg-sky/70 border-sky-light/50' : 'bg-white/10 border-white/20',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...aria}
      >
        <span
          aria-hidden
          className={[
            'inline-block transform rounded-full bg-white shadow transition-transform',
            thumbStyles[size],
            checked ? thumbTranslate[size] : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    );
  },
);

Toggle.displayName = 'Toggle';

export interface ToggleRowProps extends Omit<ToggleProps, 'aria-labelledby'> {
  label: ReactNode;
  description?: ReactNode;
  /** Rendered under the description — e.g. a warning when the option is unavailable. */
  footer?: ReactNode;
}

/**
 * The dominant settings layout: label + description on the left, switch on the
 * right. The switch is labelled by the visible text.
 */
export function ToggleRow({
  label,
  description,
  footer,
  className = '',
  ...toggleProps
}: ToggleRowProps) {
  // React's useId emits colons (":r0:"), which are valid HTML but trip up CSS
  // selectors and some accessibility tooling — strip them.
  const base = `toggle${useId().replace(/:/g, '')}`;
  const labelId = `${base}-label`;
  const descId = description ? `${base}-desc` : undefined;

  return (
    <div className={['flex items-start justify-between gap-4', className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-white/90">
          {label}
        </p>
        {description && (
          <p id={descId} className="text-sm text-white/60 mt-1">
            {description}
          </p>
        )}
        {footer}
      </div>
      {/*
        A plain-text label becomes aria-label directly — the most reliably
        announced form. Richer ReactNode labels fall back to referencing the
        rendered text by id.
      */}
      <Toggle
        {...(typeof label === 'string' ? { 'aria-label': label } : { 'aria-labelledby': labelId })}
        aria-describedby={descId}
        {...toggleProps}
      />
    </div>
  );
}
