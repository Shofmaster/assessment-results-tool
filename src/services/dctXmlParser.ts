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

function matchesLocal(el: Element, local: string): boolean {
  return el.localName === local || el.tagName.endsWith(`:${local}`);
}

function getChildrenByLocal(parent: Element, local: string): Element[] {
  return Array.from(parent.children).filter((c) => matchesLocal(c as Element, local));
}

/** First matching descendant (breadth-first), for rare deep nesting. */
function findFirstDescendantLocal(root: Element, local: string): Element | null {
  const queue: Element[] = [root];
  while (queue.length) {
    const el = queue.shift()!;
    if (matchesLocal(el, local)) return el;
    queue.push(...Array.from(el.children));
  }
  return null;
}

/** Prefer direct child, else first descendant. */
function childOrDescendant(parent: Element | null, local: string): Element | null {
  if (!parent) return null;
  for (const c of parent.children) {
    const el = c as Element;
    if (matchesLocal(el, local)) return el;
  }
  return findFirstDescendantLocal(parent, local);
}

function collectQuestionsUnder(root: Element | null): Element[] {
  if (!root) return [];
  const out: Element[] = [];
  const walk = (el: Element) => {
    if (matchesLocal(el, 'Question')) out.push(el);
    for (const c of el.children) walk(c as Element);
  };
  walk(root);
  return out;
}

function parseQuestion(el: Element): ParsedDctQuestion | null {
  const questionId = attr(el, 'QuestionID');
  if (!questionId) return null;

  let text = '';
  let safetyAttribute = '';
  let questionType = '';
  let scopingAttribute = '';
  let noteToUser = '';
  const refs: ParsedDctReference[] = [];
  const responses: string[] = [];

  const visit = (node: Element, inRefs: boolean, inResp: boolean) => {
    const isRefsRoot = matchesLocal(node, 'QuestionReferences');
    const isRespRoot = matchesLocal(node, 'QuestionResponses');
    const nextRefs = inRefs || isRefsRoot;
    const nextResp = inResp || isRespRoot;

    if (nextRefs && !isRefsRoot && matchesLocal(node, 'Reference')) {
      refs.push({
        srcId: attr(node, 'SRCID'),
        label: attr(node, 'SRCLabel') ?? textContent(node),
      });
    }
    if (nextResp && !isRespRoot && matchesLocal(node, 'Response')) {
      const t = textContent(node);
      if (t) responses.push(t);
    }

    if (!nextRefs && !nextResp) {
      if (matchesLocal(node, 'Text') && !text) text = textContent(node);
      else if (matchesLocal(node, 'SafetyAttribute') && !safetyAttribute) safetyAttribute = textContent(node);
      else if (matchesLocal(node, 'QuestionType') && !questionType) questionType = textContent(node);
      else if (matchesLocal(node, 'ScopingAttribute') && !scopingAttribute) scopingAttribute = textContent(node);
      else if (matchesLocal(node, 'NoteToUser') && !noteToUser) noteToUser = textContent(node);
    }

    for (const c of node.children) {
      visit(c as Element, nextRefs, nextResp);
    }
  };

  visit(el, false, false);

  const displayOrderRaw = attr(el, 'DisplayOrder');
  return {
    questionId,
    questionDetailsId: attr(el, 'QuestionDetailsID'),
    qVersionNumber: attr(el, 'VersionNumber'),
    qVersionDate: attr(el, 'VersionDate'),
    displayOrder: displayOrderRaw ? Number(displayOrderRaw) : undefined,
    text,
    safetyAttribute,
    questionType,
    scopingAttribute,
    noteToUser,
    references: refs,
    responses,
  };
}

/** One DFS from root: locate DCTData, DCTSummaryInformation, DCTQuestions (first occurrence each). */
function findDctRegions(root: Element): {
  dctData: Element | null;
  summary: Element | null;
  questionsRoot: Element | null;
} {
  let dctData: Element | null = null;
  let summary: Element | null = null;
  let questionsRoot: Element | null = null;
  const walk = (node: Element) => {
    if (!dctData && matchesLocal(node, 'DCTData')) dctData = node;
    if (!summary && matchesLocal(node, 'DCTSummaryInformation')) summary = node;
    if (!questionsRoot && matchesLocal(node, 'DCTQuestions')) questionsRoot = node;
    if (dctData && summary && questionsRoot) return;
    for (const c of node.children) walk(c as Element);
  };
  walk(root);
  return { dctData, summary, questionsRoot };
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
  const regions = findDctRegions(root);
  const dctData =
    doc.getElementsByTagNameNS(SAS_NS, 'DCTData')[0] ??
    findFirstDescendantLocal(root, 'DCTData') ??
    regions.dctData;

  const versioning = dctData ? childOrDescendant(dctData, 'DCTVersioning') : null;
  const mlf = dctData ? childOrDescendant(dctData, 'MLF') : null;
  const assessment = dctData ? childOrDescendant(dctData, 'AssessmentType') : null;
  const specialty = dctData ? childOrDescendant(dctData, 'Specialty') : null;
  const peer = dctData ? childOrDescendant(dctData, 'PeerGroup') : null;

  const { summary, questionsRoot } = regions;
  const purposeEl = summary ? childOrDescendant(summary, 'Purpose') : null;
  const objectiveEl = summary ? childOrDescendant(summary, 'Objective') : null;

  const questionEls = collectQuestionsUnder(questionsRoot);
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
    purpose: textContent(purposeEl),
    objective: textContent(objectiveEl),
    questions,
  };
}
