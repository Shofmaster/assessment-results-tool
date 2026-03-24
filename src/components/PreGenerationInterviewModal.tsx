import { FiX, FiLoader, FiZap } from 'react-icons/fi';
import { Button, GlassCard } from './ui';

export interface PreGenerationInterviewModalProps {
  open: boolean;
  loading: boolean;
  sectionTitle: string;
  questions: string[];
  answers: string[];
  onAnswerChange: (index: number, value: string) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export default function PreGenerationInterviewModal({
  open,
  loading,
  sectionTitle,
  questions,
  answers,
  onAnswerChange,
  onConfirm,
  onSkip,
  onClose,
}: PreGenerationInterviewModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <GlassCard padding="xl" className="w-full max-w-xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <FiZap className="w-5 h-5 text-sky-light" />
              Quick Context
            </h2>
            <p className="text-white/60 text-sm mt-0.5">
              {sectionTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <p className="text-white/70 text-sm mb-6">
          Answer these questions to generate a more precise, organization-specific section. All fields are optional.
        </p>

        {/* Loading state */}
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-10 text-white/60">
            <FiLoader className="w-7 h-7 animate-spin text-sky-light" />
            <span className="text-sm">Preparing questions for this section…</span>
          </div>
        ) : (
          <div className="space-y-5">
            {questions.map((question, i) => (
              <div key={i}>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  {i + 1}. {question}
                </label>
                <textarea
                  value={answers[i] ?? ''}
                  onChange={(e) => onAnswerChange(i, e.target.value)}
                  placeholder="Your answer… (optional)"
                  rows={2}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-sky-light resize-y"
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-white/50 hover:text-white/80"
            >
              Skip — generate with defaults
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onConfirm}
            >
              Generate Section
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
