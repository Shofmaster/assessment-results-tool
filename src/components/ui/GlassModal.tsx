import { useEffect, useId, useRef, type ReactNode } from 'react';

export type GlassModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Max width Tailwind fragment, default max-w-md */
  sizeClassName?: string;
  onClose: () => void;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible overlay dialog matching the app's glass styling.
 *
 * Focus management: on open, focus moves into the dialog (an element marked
 * `data-autofocus` wins, otherwise the dialog itself); Tab is trapped inside;
 * on close, focus returns to whatever had it before the dialog opened.
 */
export function GlassModal({ open, title, children, footer, sizeClassName = 'max-w-md', onClose }: GlassModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Ref indirection so the focus effect doesn't tear down and re-run (re-saving
  // "restore" targets) every render when callers pass an inline onClose.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const initial = dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog;
    initial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = dialogRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && container.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === container) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${sizeClassName} rounded-2xl border border-white/15 bg-[#0c1420]/95 shadow-2xl shadow-black/40 overflow-hidden focus:outline-none`}
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
