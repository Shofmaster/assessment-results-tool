import type { ParsedDctQuestion, ParsedDctReference, ParsedDctToolDocument } from './dctXmlParser';
import { hashDctContent } from './dctXmlParser';

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  return t === '' ? undefined : t;
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeReference(x: unknown): ParsedDctReference | null {
  if (!isRecord(x)) return null;
  const label = str(x.label);
  if (!label) return null;
  return { srcId: str(x.srcId), label };
}

function normalizeQuestion(x: unknown): ParsedDctQuestion | null {
  if (!isRecord(x)) return null;
  const questionId = str(x.questionId);
  if (!questionId) return null;
  const text = str(x.text) ?? '';
  const refsRaw = x.references;
  const references: ParsedDctReference[] = Array.isArray(refsRaw)
    ? refsRaw.map(normalizeReference).filter(Boolean) as ParsedDctReference[]
    : [];
  const respRaw = x.responses;
  const responses: string[] = Array.isArray(respRaw)
    ? respRaw.map((r) => str(r)).filter(Boolean) as string[]
    : [];
  return {
    questionId,
    questionDetailsId: str(x.questionDetailsId),
    qVersionNumber: str(x.qVersionNumber),
    qVersionDate: str(x.qVersionDate),
    displayOrder: num(x.displayOrder),
    text,
    safetyAttribute: str(x.safetyAttribute),
    questionType: str(x.questionType),
    scopingAttribute: str(x.scopingAttribute),
    noteToUser: str(x.noteToUser),
    references,
    responses,
  };
}

function canonicalHashPayload(doc: ParsedDctToolDocument): string {
  return JSON.stringify({
    fileName: doc.fileName,
    standardDctId: doc.standardDctId,
    standardDctDetailId: doc.standardDctDetailId,
    dctVersionNumber: doc.dctVersionNumber,
    dctVersionDate: doc.dctVersionDate,
    dctStatus: doc.dctStatus,
    mlfId: doc.mlfId,
    mlfLabel: doc.mlfLabel,
    mlfName: doc.mlfName,
    assessmentTypeLabel: doc.assessmentTypeLabel,
    specialtyLabel: doc.specialtyLabel,
    peerGroupLabel: doc.peerGroupLabel,
    purpose: doc.purpose,
    objective: doc.objective,
    questions: doc.questions.map((q) => ({
      ...q,
      references: [...q.references].sort((a, b) => a.label.localeCompare(b.label)),
      responses: [...q.responses].sort(),
    })),
  });
}

export function normalizeParsedDctDocument(raw: unknown, index: number): { doc: ParsedDctToolDocument } | { error: string } {
  if (!isRecord(raw)) {
    return { error: `Document ${index + 1}: expected object` };
  }
  const fileName = str(raw.fileName);
  if (!fileName) {
    return { error: `Document ${index + 1}: missing fileName` };
  }
  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw)) {
    return { error: `Document ${index + 1} (${fileName}): questions must be an array` };
  }
  const questions = questionsRaw.map(normalizeQuestion).filter(Boolean) as ParsedDctQuestion[];
  if (questions.length !== questionsRaw.length) {
    return { error: `Document ${index + 1} (${fileName}): each question needs questionId` };
  }
  const doc: ParsedDctToolDocument = {
    fileName,
    contentHash: str(raw.contentHash) ?? '',
    standardDctId: str(raw.standardDctId),
    standardDctDetailId: str(raw.standardDctDetailId),
    dctVersionNumber: str(raw.dctVersionNumber),
    dctVersionDate: str(raw.dctVersionDate),
    dctStatus: str(raw.dctStatus),
    mlfId: str(raw.mlfId),
    mlfLabel: str(raw.mlfLabel),
    mlfName: str(raw.mlfName),
    assessmentTypeLabel: str(raw.assessmentTypeLabel),
    specialtyLabel: str(raw.specialtyLabel),
    peerGroupLabel: str(raw.peerGroupLabel),
    purpose: str(raw.purpose),
    objective: str(raw.objective),
    questions,
  };
  if (!doc.contentHash) {
    doc.contentHash = hashDctContent(canonicalHashPayload(doc));
  }
  return { doc };
}

/**
 * Parse JSON from Access export script or manual bundle: `{ documents: [...] }` or `[...]`.
 */
export function parseDctBundleJson(text: string): { documents: ParsedDctToolDocument[]; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { documents: [], errors: ['Invalid JSON'] };
  }
  let arr: unknown[];
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (isRecord(parsed) && Array.isArray(parsed.documents)) {
    arr = parsed.documents;
  } else {
    return {
      documents: [],
      errors: ['Expected a JSON array of documents or { "documents": [...] }'],
    };
  }
  if (arr.length === 0) {
    return { documents: [], errors: ['No documents in bundle'] };
  }
  const documents: ParsedDctToolDocument[] = [];
  for (let i = 0; i < arr.length; i++) {
    const r = normalizeParsedDctDocument(arr[i], i);
    if ('error' in r) errors.push(r.error);
    else documents.push(r.doc);
  }
  return { documents, errors };
}
