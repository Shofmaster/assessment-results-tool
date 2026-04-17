/**
 * Shared UI for FAA DCT XML metadata (tool documents + questions).
 * Keeps display logic in one place for Matrix, Findings, and Library.
 */

export type DctToolDocLike = {
  fileName?: string;
  standardDctId?: string;
  standardDctDetailId?: string;
  dctVersionNumber?: string;
  dctVersionDate?: string;
  mlfLabel?: string;
  mlfName?: string;
  peerGroupLabel?: string;
  assessmentTypeLabel?: string;
  specialtyLabel?: string;
  purpose?: string;
  objective?: string;
};

export type DctQuestionLike = {
  text?: string;
  safetyAttribute?: string;
  questionType?: string;
  scopingAttribute?: string;
  noteToUser?: string;
  references?: Array<{ srcId?: string; label: string }>;
};

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'undefined') return '';
  return s;
}

/** Basename without extension for fallback labeling. */
export function dctDisplayFileStem(fileName?: string): string {
  const raw = safeStr(fileName);
  if (!raw) return '';
  const base = raw.includes('/') ? raw.split('/').pop() ?? raw : raw;
  return base.replace(/\.xml$/i, '').replace(/_/g, ' ');
}

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}

/** One-line context: Standard DCT id, version, MLF, peer group (graceful fallbacks). */
export function DctContextPill({ doc }: { doc: DctToolDocLike }) {
  const standard = safeStr(doc.standardDctId);
  const ver = safeStr(doc.dctVersionNumber);
  const mlf = safeStr(doc.mlfLabel) || safeStr(doc.mlfName);
  const peer = safeStr(doc.peerGroupLabel);
  const assessment = safeStr(doc.assessmentTypeLabel);
  const specialty = safeStr(doc.specialtyLabel);

  const head =
    standard !== ''
      ? ver !== ''
        ? `Standard DCT ${standard} v${ver}`
        : `Standard DCT ${standard}`
      : '';

  const tail = joinParts([mlf, peer, assessment, specialty]);
  const line = joinParts([head, tail]);
  const fallback = dctDisplayFileStem(doc.fileName);

  const primary = line || fallback || 'DCT';

  return (
    <div className="text-xs text-white/90 leading-snug min-w-0">
      <span className="font-medium">{primary}</span>
    </div>
  );
}

export function DctReferencePills({ question }: { question: DctQuestionLike }) {
  const refs = (question.references ?? []).map((r) => safeStr(r?.label)).filter(Boolean);
  if (!refs.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {refs.map((label) => (
        <span
          key={label}
          className="inline-block max-w-full truncate px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-200/95 border border-sky-400/25 text-[10px]"
          title={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function purposePreview(purpose: string | undefined, maxLen = 160): string {
  const p = safeStr(purpose);
  if (!p) return '';
  if (p.length <= maxLen) return p;
  return `${p.slice(0, maxLen - 1)}…`;
}

/** Expandable / tooltip body: doc purpose/objective + question scoping + references list. */
export function DctDocumentSummary({ doc, question }: { doc: DctToolDocLike; question: DctQuestionLike }) {
  const purpose = safeStr(doc.purpose);
  const objective = safeStr(doc.objective);
  const assessment = safeStr(doc.assessmentTypeLabel);
  const specialty = safeStr(doc.specialtyLabel);
  const refs = (question.references ?? []).filter((r) => safeStr(r?.label));

  const qBits: { k: string; v: string }[] = [
    { k: 'Safety attribute', v: safeStr(question.safetyAttribute) },
    { k: 'Question type', v: safeStr(question.questionType) },
    { k: 'Scoping', v: safeStr(question.scopingAttribute) },
    { k: 'Note to user', v: safeStr(question.noteToUser) },
  ].filter((x) => x.v);

  return (
    <div className="text-xs text-white/75 space-y-2 mt-1">
      {purpose ? (
        <p>
          <span className="text-white/50 uppercase tracking-wide text-[10px]">Purpose</span>
          <br />
          {purpose}
        </p>
      ) : null}
      {objective ? (
        <p>
          <span className="text-white/50 uppercase tracking-wide text-[10px]">Objective</span>
          <br />
          {objective}
        </p>
      ) : null}
      {assessment || specialty ? (
        <p>
          <span className="text-white/50 uppercase tracking-wide text-[10px]">Assessment</span>
          <br />
          {joinParts([assessment, specialty])}
        </p>
      ) : null}
      {qBits.length > 0 ? (
        <ul className="list-disc pl-4 space-y-0.5">
          {qBits.map(({ k, v }) => (
            <li key={k}>
              <span className="text-white/45">{k}: </span>
              {v}
            </li>
          ))}
        </ul>
      ) : null}
      {refs.length > 0 ? (
        <div>
          <span className="text-white/50 uppercase tracking-wide text-[10px]">Regulatory references</span>
          <ul className="list-disc pl-4 mt-0.5">
            {refs.map((r, i) => (
              <li key={`${r.label}-${i}`}>{safeStr(r.label)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {safeStr(doc.fileName) ? (
        <p className="text-white/40 text-[10px] pt-1 border-t border-white/10">Source file: {safeStr(doc.fileName)}</p>
      ) : null}
    </div>
  );
}

/** Lowercase blob for matrix text search (metadata + refs). */
export function dctRowSearchBlob(doc: DctToolDocLike, question: DctQuestionLike): string {
  const refLabels = (question.references ?? []).map((r) => safeStr(r?.label)).join(' ');
  return [
    safeStr(question.text),
    safeStr(doc.fileName),
    safeStr(doc.standardDctId),
    safeStr(doc.mlfLabel),
    safeStr(doc.mlfName),
    safeStr(doc.peerGroupLabel),
    safeStr(doc.purpose),
    safeStr(doc.objective),
    safeStr(question.noteToUser),
    refLabels,
  ]
    .join(' ')
    .toLowerCase();
}
