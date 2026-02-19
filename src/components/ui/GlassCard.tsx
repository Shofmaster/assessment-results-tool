import { forwardRef, type HTMLAttributes } from 'react';

export type GlassCardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: GlassCardPadding;
  rounded?: 'lg' | 'xl' | '2xl';
  border?: boolean;
}

const paddingStyles: Record<GlassCardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  xl: 'p-12',
};

const roundedStyles: Record<string, string> = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      hover = false,
      padding = 'md',
      rounded = '2xl',
      border = false,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={[
          'glass',
          hover ? 'glass-hover' : '',
          paddingStyles[padding],
          roundedStyles[rounded],
          border ? 'border border-white/10' : '',
          hover ? 'transition-all duration-300' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {children}
      </div>
    );
  },
);

GlassCard.displayName = 'GlassCard';
