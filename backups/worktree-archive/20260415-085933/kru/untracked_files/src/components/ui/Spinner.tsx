export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerColor = 'white' | 'sky' | 'amber';

export interface SpinnerProps {
  size?: SpinnerSize;
  color?: SpinnerColor;
  className?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-12 h-12 border-4',
};

const colorStyles: Record<SpinnerColor, string> = {
  white: 'border-white/30 border-t-white',
  sky: 'border-sky/30 border-t-sky',
  amber: 'border-amber-400/30 border-t-amber-400',
};

export function Spinner({
  size = 'md',
  color = 'white',
  className = '',
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={[
        'rounded-full animate-spin',
        sizeStyles[size],
        colorStyles[color],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
