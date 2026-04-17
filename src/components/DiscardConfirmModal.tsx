import { Button, GlassCard } from './ui';

interface Props {
  target: string | 'draft';
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DiscardConfirmModal({ target, onCancel, onConfirm }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-modal-title"
    >
      <GlassCard padding="xl" className="w-full max-w-md">
        <h2 id="discard-modal-title" className="text-xl font-display font-bold text-white mb-2">
          Discard review?
        </h2>
        <p className="text-white/80 mb-6">
          {target === 'draft'
            ? 'This draft will be permanently removed.'
            : 'This review will be permanently removed.'}
        </p>
        <div className="flex flex-wrap gap-3 justify-end">
          <Button variant="secondary" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="md" onClick={onConfirm}>
            Discard
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
