import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputSize = 'sm' | 'md';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  inputSize?: InputSize;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-3 rounded-xl',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, inputSize = 'md', className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium mb-2 text-white/80"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            'w-full bg-white/10 border border-white/20 focus:outline-none focus:border-sky-light transition-colors',
            sizeStyles[inputSize],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />
      </div>
    );
  },
);

Input.displayName = 'Input';
