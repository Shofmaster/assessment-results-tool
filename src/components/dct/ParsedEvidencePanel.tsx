import { parseEvidenceSegments } from '../../utils/dctCompliancePresenter';

/**
 * Renders a traceability rationale string. If the text uses the pipe-delimited
 * `Requirement | Evidence | Gap | Corrective action` format, it's split into
 * labelled rows; otherwise the raw text is shown as-is.
 */
export function ParsedEvidencePanel({ text, fallbackEvidence }: { text: string; fallbackEvidence?: string }) {
  const parts = parseEvidenceSegments(text);
  if (!parts.requirement && !parts.evidence && !parts.gap && !parts.correctiveAction) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <p className="text-xs text-white/60 whitespace-pre-wrap">{text}</p>
        {fallbackEvidence ? <p className="text-[11px] text-white/50 mt-1 italic">{fallbackEvidence}</p> : null}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
      {parts.requirement ? <p className="text-xs text-white/70"><strong>Requirement:</strong> {parts.requirement}</p> : null}
      {parts.evidence ? <p className="text-xs text-white/70"><strong>Evidence:</strong> {parts.evidence}</p> : null}
      {parts.gap ? <p className="text-xs text-white/70"><strong>Gap:</strong> {parts.gap}</p> : null}
      {parts.correctiveAction ? <p className="text-xs text-white/70"><strong>Corrective action:</strong> {parts.correctiveAction}</p> : null}
      {!parts.evidence && fallbackEvidence ? <p className="text-xs text-white/50 italic">{fallbackEvidence}</p> : null}
    </div>
  );
}
