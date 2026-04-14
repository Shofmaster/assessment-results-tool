/**
 * Parse FAA SAS DCT XML (SASStandardDCT, namespace http://fsims.faa.gov/sasdct).
 * Safe for browser DOMParser; no Node-only deps.
 */

const SAS_NS = 'http://fsims.faa.gov/sasdct';

export type ParsedDctReference = { srcId?: string; label: string };

export type ParsedDctQuestion = {
  questionId: string;
  questionDetailsId?: string;
  qVersionNumber?: string;
  qVersionDate?: string;
  displayOrder?: number;
  text: string;
  safetyAttribute?: string;
  questionType?: string;
  scopingAttribute?: string;
  noteToUser?: string;
  references: ParsedDctReference[];
  responses: string[];
};

export type ParsedDctToolDocument = {
  fileName: string;
  contentHash: string;
  standardDctId?: string;
  standardDctDetailId?: string;
  dctVersionNumber?: string;
  dctVersionDate?: string;
  dctStatus?: string;
  mlfId?: string;
  mlfLabel?: string;
  mlfName?: string;
  assessmentTypeLabel?: string;
  specialtyLabel?: string;
  peerGroupLabel?: string;
  purpose?: string;
  objective?: string;
  questions: ParsedDctQuestion[];
};

function textContent(el: Element | null): string {
  return el?.textContent?.trim() ?? '';
}

function attr(el: Element | null, name: string): string | undefined {
  const v = el?.getAttribute(name);
  return v && v.trim() ? v.trim() : undefined;
}

function getChildrenByLocal(parent: Element, local: string): Element[] {
  return Array.from(parent.children).filter((c) => c.localName === local || c.tagName.endsWith(`:${local}`));
}

function findFirstDescendantLocal(root: Element, local: string): Element | null {
  const queue: Element[] = [root];
  while (queue.length) {
    const el = queue.shift()!;
    if (el.localName === local || el.tagName.endsWith(`:${local}`)) return el;
    queue.push(...Array.from(el.children));
  }
  return null;
}

function findAllDescendantsLocal(root: Element, local: string): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    if (el.localName === local || el.tagName.endsWith(`:${local}`)) out.push(el);
    Array.from(el.children).forEach(walk);
  };
  walk(root);
  return out;
}

function parseQuestion(el: Element): ParsedDctQuestion | null {
  const questionId = attr(el, 'QuestionID');
  if (!questionId) return null;
  const refs: ParsedDctReference[] = [];
  const refContainer = findFirstDescendantLocal(el, 'QuestionReferences');
  if (refContainer) {
    for (const r of findAllDescendantsLocal(refContainer, 'Reference')) {
      refs.push({
        srcId: attr(r, 'SRCID'),
        label: attr(r, 'SRCLabel') ?? textContent(r),
      });
    }
  }
  const responses: string[] = [];
  const respRoot = findFirstDescendantLocal(el, 'QuestionResponses');
  if (respRoot) {
    for (const r of findAllDescendantsLocal(respRoot, 'Response')) {
      const t = textContent(r);
      if (t) responses.push(t);
    }
  }
  const header = findFirstDescendantLocal(el, 'SectionHeaderMLF');
  const displayOrderRaw = attr(el, 'DisplayOrder');
  return {
    questionId,
    questionDetailsId: attr(el, 'QuestionDetailsID'),
    qVersionNumber: attr(el, 'VersionNumber'),
    qVersionDate: attr(el, 'VersionDate'),
    displayOrder: displayOrderRaw ? Number(displayOrderRaw) : undefined,
    text: textContent(findFirstDescendantLocal(el, 'Text')),
    safetyAttribute: textContent(findFirstDescendantLocal(el, 'SafetyAttribute')),
    questionType: textContent(findFirstDescendantLocal(el, 'QuestionType')),
    scopingAttribute: textContent(findFirstDescendantLocal(el, 'ScopingAttribute')),
    noteToUser: textContent(findFirstDescendantLocal(el, 'NoteToUser')),
    references: refs,
    responses,
  };
}

/** Simple stable hash for change detection (FNV-1a 32-bit). */
export function hashDctContent(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function parseDctXmlString(fileName: string, xml: string): ParsedDctToolDocument {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    throw new Error(`Invalid XML: ${fileName}`);
  }
  const root = doc.documentElement;
  const dctData =
    doc.getElementsByTagNameNS(SAS_NS, 'DCTData')[0] ??
    findFirstDescendantLocal(root, 'DCTData');
  const versioning =
    dctData
      ? findFirstDescendantLocal(dctData, 'DCTVersioning') ??
        getChildrenByLocal(dctData, 'DCTVersioning')[0]
      : null;
  const mlf =
    dctData
      ? findFirstDescendantLocal(dctData, 'MLF') ?? getChildrenByLocal(dctData, 'MLF')[0]
      : null;
  const assessment =
    dctData
      ? findFirstDescendantLocal(dctData, 'AssessmentType') ??
        getChildrenByLocal(dctData, 'AssessmentType')[0]
      : null;
  const specialty =
    dctData
      ? findFirstDescendantLocal(dctData, 'Specialty') ?? getChildrenByLocal(dctData, 'Specialty')[0]
      : null;
  const peer =
    dctData
      ? findFirstDescendantLocal(dctData, 'PeerGroup') ?? getChildrenByLocal(dctData, 'PeerGroup')[0]
      : null;

  const summary = findFirstDescendantLocal(root, 'DCTSummaryInformation');
  const questionsRoot = findFirstDescendantLocal(root, 'DCTQuestions');
  const questionEls = questionsRoot ? findAllDescendantsLocal(questionsRoot, 'Question') : [];
  const questions = questionEls.map(parseQuestion).filter(Boolean) as ParsedDctQuestion[];

  const contentHash = hashDctContent(xml);

  return {
    fileName,
    contentHash,
    standardDctId: attr(versioning, 'StandardDCTID'),
    standardDctDetailId: attr(versioning, 'StandardDCTDetailID'),
    dctVersionNumber: attr(versioning, 'VersionNumber'),
    dctVersionDate: attr(versioning, 'VersionDate'),
    dctStatus: attr(versioning, 'Status'),
    mlfId: attr(mlf, 'MLFID'),
    mlfLabel: attr(mlf, 'MLFLabel'),
    mlfName: attr(mlf, 'MLFName'),
    assessmentTypeLabel: attr(assessment, 'AssessmentTypeLabel') ?? textContent(assessment),
    specialtyLabel: attr(specialty, 'SpecialtyLabel') ?? textContent(specialty),
    peerGroupLabel: attr(peer, 'PeerGroupLabel') ?? textContent(peer),
    purpose: textContent(summary ? findFirstDescendantLocal(summary, 'Purpose') : null),
    objective: textContent(summary ? findFirstDescendantLocal(summary, 'Objective') : null),
    questions,
  };
}
