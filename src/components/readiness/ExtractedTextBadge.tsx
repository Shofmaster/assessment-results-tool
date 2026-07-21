/**
 * ExtractedTextBadge — makes the invisible "has extracted text" gate visible.
 *
 * Documents without extracted text silently don't count toward any AI feature
 * (Analysis, Audit Simulation, DCT, Ask an Expert). This chip renders nothing
 * when text exists and a small amber warning when it doesn't, so users can see
 * why a doc "doesn't count".
 */
import { FiAlertTriangle } from 'react-icons/fi';
import { hasExtractedTextContent } from '../../utils/documentExtractedText';

type Props = {
  doc: { extractedText?: string; extractedTextStorageId?: string; category?: string };
  className?: string;
};

export default function ExtractedTextBadge({ doc, className = '' }: Props) {
  if (hasExtractedTextContent(doc)) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300 ${className}`}
      title="This document has no extracted text, so AI features (analysis, audit simulation, search) can't read it. Re-upload a text-based PDF, or wait if extraction is still processing."
    >
      <FiAlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      No text extracted
    </span>
  );
}
