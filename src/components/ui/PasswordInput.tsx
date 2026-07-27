import { useState, type InputHTMLAttributes } from 'react';

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible name for the show/hide button; defaults to "value". */
  secretName?: string;
}

/**
 * Masked input with a Show/Hide affordance, extracted from the duplicated
 * Client ID / API Key blocks in Settings.
 */
export function PasswordInput({
  secretName = 'value',
  className = '',
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={[
          'w-full px-4 py-3 pr-24 bg-white/10 border border-white/20 rounded-xl text-white',
          'focus:outline-none focus:border-sky-light transition-colors',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? `Hide ${secretName}` : `Show ${secretName}`}
        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-white/60 hover:text-white transition-colors"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
