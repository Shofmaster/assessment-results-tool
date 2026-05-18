import { useRef } from 'react';
import { FiUpload, FiX, FiLoader, FiMonitor, FiCheckCircle } from 'react-icons/fi';
import ImageSelector from './ImageSelector';

export default function ComplianceInputPanel({
  text,
  onTextChange,
  selectedText,
  onSelectedTextChange,
  autoSplitEntries,
  onAutoSplitChange,
  entrySegments,
  imageMode,
  onEnterImageMode,
  onExitImageMode,
  onImageReview,
  onReviewEntry,
  onReviewSegment,
  onReviewSelection,
  onReviewBatch,
  onClearText,
  onDocUpload,
  extractingDoc,
  reviewing,
}: {
  text: string;
  onTextChange: (v: string) => void;
  selectedText: string;
  onSelectedTextChange: (selection: string) => void;
  autoSplitEntries: boolean;
  onAutoSplitChange: (v: boolean) => void;
  entrySegments: string[];
  imageMode: boolean;
  onEnterImageMode: () => void;
  onExitImageMode: () => void;
  onImageReview: (b64: string, mt: string) => void;
  onReviewEntry: () => void;
  onReviewSegment: (segment: string) => void;
  onReviewSelection: () => void;
  onReviewBatch: () => void;
  onClearText: () => void;
  onDocUpload: (file: File) => void;
  extractingDoc: boolean;
  reviewing: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    onSelectedTextChange(ta.value.slice(ta.selectionStart, ta.selectionEnd).trim());
  };

  const canReview = !reviewing && !extractingDoc && (text.trim().length > 0 || imageMode);
  const showBatchChip = autoSplitEntries && entrySegments.length > 1;

  if (imageMode) {
    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onExitImageMode}
            className="text-xs text-white/50 hover:text-white/80 underline"
          >
            ← Back to text entry
          </button>
        </div>
        <ImageSelector onSelect={onImageReview} onClear={onExitImageMode} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex flex-wrap items-center gap-2 flex-shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <button
          type="button"
          disabled={extractingDoc || reviewing}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          {extractingDoc ? <FiLoader className="animate-spin" /> : <FiUpload />}
          {extractingDoc ? 'Extracting…' : 'Upload'}
        </button>
        <button
          type="button"
          disabled={reviewing}
          onClick={onEnterImageMode}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          <FiMonitor />
          Image / capture
        </button>
        <label className="inline-flex items-center gap-2 text-xs text-white/60 ml-auto">
          <input
            type="checkbox"
            checked={autoSplitEntries}
            onChange={(e) => onAutoSplitChange(e.target.checked)}
            className="rounded border-white/20 bg-white/10"
          />
          Auto-split by date
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onDocUpload(f);
            e.currentTarget.value = '';
          }}
        />
      </div>

      <div className="flex flex-1 min-h-[200px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
        <div className="flex flex-shrink-0 items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.03] text-xs text-white/40">
          <span>
            Paste logbook text — <strong className="text-white/60">highlight a portion</strong> to review only that
            selection
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onSelect={handleSelect}
          onMouseUp={handleSelect}
          onKeyUp={handleSelect}
          placeholder={`Paste logbook entry text here…\n\nExample:\n09/15/2024 – Performed 100-hour inspection per 14 CFR 91.409(b). Aircraft total time: 1,450.3 hrs.`}
          className="w-full flex-1 min-h-[160px] resize-y p-4 text-sm text-white/85 placeholder:text-white/20 bg-transparent focus:outline-none font-mono leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        <button
          type="button"
          disabled={!canReview || !text.trim()}
          onClick={onReviewEntry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-sky/20 text-sky-light border border-sky/40 hover:bg-sky/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {reviewing ? <FiLoader className="animate-spin" /> : <FiCheckCircle />}
          {reviewing ? 'Reviewing…' : 'Review entry'}
        </button>
        {selectedText && (
          <button
            type="button"
            disabled={!canReview}
            onClick={onReviewSelection}
            className="text-xs text-sky-light/90 hover:text-sky-light underline disabled:opacity-40"
          >
            Review selection only ({selectedText.length} chars)
          </button>
        )}
        {showBatchChip && (
          <button
            type="button"
            disabled={!canReview}
            onClick={onReviewBatch}
            className="text-xs px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
          >
            Review {entrySegments.length} detected entries →
          </button>
        )}
        {text && (
          <button
            type="button"
            onClick={onClearText}
            className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 ml-auto"
            title="Clear"
          >
            <FiX />
          </button>
        )}
      </div>

      {autoSplitEntries && entrySegments.length > 1 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <p className="text-xs font-semibold text-white/65">Detected entries ({entrySegments.length})</p>
          <div className="max-h-32 overflow-y-auto space-y-1.5">
            {entrySegments.map((segment, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-white/35 w-8">#{i + 1}</span>
                <span className="text-white/60 truncate flex-1">{segment.slice(0, 90)}</span>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => onReviewSegment(segment)}
                  className="px-2 py-0.5 rounded-md border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 disabled:opacity-40"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-white/35 flex-shrink-0">
        PDF, Word (.docx), .txt, and images supported. Company roster and OpSpecs are included automatically.
      </p>
    </div>
  );
}
