import { forwardRef, type SelectHTMLAttributes } from 'react';

export type SelectSize = 'sm' | 'md';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  selectSize?: SelectSize;
}

const sizeStyles: Record<SelectSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-3 rounded-xl',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, selectSize = 'md', className = '', id, children, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium mb-2 text-white/80"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={[
            'w-full bg-white/10 border border-white/20 text-white focus:outline-none focus:border-sky-light transition-colors',
            sizeStyles[selectSize],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  },
);

Select.displayName = 'Select';
