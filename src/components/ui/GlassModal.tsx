import { useEffect, useId, type ReactNode } from 'react';

export type GlassModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Max width Tailwind fragment, default max-w-md */
  sizeClassName?: string;
  onClose: () => void;
};

/**
 * Accessible overlay dialog matching the app's glass styling.
 */
export function GlassModal({ open, title, children, footer, sizeClassName = 'max-w-md', onClose }: GlassModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${sizeClassName} rounded-2xl border border-white/15 bg-[#0c1420]/95 shadow-2xl shadow-black/40 overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-white">
            {title}
          </h2>
        </div>
        <div className="px-4 py-3 text-white/85 text-sm max-h-[min(70vh,520px)] overflow-y-auto scrollbar-thin">
          {children}
        </div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
