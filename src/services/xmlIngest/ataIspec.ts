import type { XmlIngestResult, XmlIngestSection, XmlIngestNotice } from './types';
import { genericXmlFallback, stripXmlToText } from './generic';
import { inferOemFromModels, oemDisplayName } from './oem';

/**
 * Hard cap on TOC rows. The schema accepts more, but blowing past this for a
 * single XML data module almost always indicates a malformed input.
 */
const MAX_SECTIONS = 200;

/** Tags whose contents are revision metadata, not reading text. */
const NON_READING_TAGS = new Set([
  'chgdesc',
  'meta',
  'ataref',
  'idstatus',
  'revstatus',
]);

/** Returns true if the XML looks like ATA iSpec 2200 / 3000. */
export function looksAtaIspec(xml: string): boolean {
  if (/<printgroup\b/i.test(xml)) return true;
  if (/<inpgblk\b[^>]*chapnbr=/i.test(xml)) return true;
  if (/<\?ATANBR\b/i.test(xml)) return true;
  return false;
}

interface ProcessingInstructions {
  REVNBR?: string;
  REVDATE?: string;
  ATATITLE?: string;
  ATANBR?: string;
  ATATYPE?: string;
  PN1?: string;
  PN2?: string;
  PN3?: string;
  SUB_TITLE?: string;
  [key: string]: string | undefined;
}

function collectProcessingInstructions(doc: Document): ProcessingInstructions {
  const out: ProcessingInstructions = {};
  if (typeof doc.createTreeWalker !== 'function') return out;
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
  let node = walker.nextNode();
  while (node) {
    const pi = node as ProcessingInstruction;
    const target = pi.target;
    const data = (pi.data || '').trim();
    if (target) out[target] = data;
    node = walker.nextNode();
  }
  return out;
}

function pad2(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  if (/^\d{1,2}$/.test(trimmed)) return trimmed.padStart(2, '0');
  return trimmed;
}

function safeAttr(el: Element | null, name: string): string | undefined {
  if (!el) return undefined;
  const v = el.getAttribute(name);
  return v ? v.trim() || undefined : undefined;
}

function nodeReadingText(root: Element | null): string {
  if (!root) return '';
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue;
      if (t && t.trim()) parts.push(t.trim());
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (NON_READING_TAGS.has(el.tagName.toLowerCase())) return;
    for (let i = 0; i < el.childNodes.length; i++) visit(el.childNodes[i]!);
  };
  visit(root);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Collect TOC entries by walking <topic> and <timelimits> headings. */
function collectSections(
  doc: Document,
  ataChapter: string,
  ataSection: string | undefined
): XmlIngestSection[] {
  const sections: XmlIngestSection[] = [];
  let ordinal = 1;

  const pushTitle = (titleText: string | undefined, depth: number) => {
    if (!titleText) return;
    const clean = titleText.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    sections.push({
      ataChapter,
      ataSection,
      title: clean.slice(0, 200),
      depth: Math.max(1, Math.min(3, depth)),
      startPage: ordinal,
      endPage: ordinal,
    });
    ordinal++;
  };

  // Top-level <intro><title>
  const introTitle = doc.querySelector('intro > title');
  pushTitle(introTitle?.textContent ?? undefined, 1);

  // <topic> blocks with their own <title>
  const topics = Array.from(doc.querySelectorAll('topic'));
  for (const t of topics) {
    if (sections.length >= MAX_SECTIONS) break;
    const tt = t.querySelector(':scope > title');
    pushTitle(tt?.textContent ?? undefined, 2);
  }

  // <timelimits title="...">
  const timelimits = Array.from(doc.querySelectorAll('timelimits[title]'));
  for (const tl of timelimits) {
    if (sections.length >= MAX_SECTIONS) break;
    pushTitle(tl.getAttribute('title') ?? undefined, 2);
  }

  return sections;
}

/**
 * Parse an ATA iSpec 2200 / 3000 XML data module.
 *
 * Handles the Gulfstream printgroup/inpgblk dialect natively. Other OEM
 * dialects sharing the same family (legacy Boeing, Cessna TIPS, MD Helicopters)
 * are expected to parse here as well; if any quirk causes the structured pass
 * to come back empty, falls back to the generic strip-tags extractor so the
 * file is still searchable.
 */
export function parseAtaIspec(xml: string): XmlIngestResult {
  if (typeof DOMParser === 'undefined') {
    return genericXmlFallback(xml, 'ata_ispec', undefined, {
      level: 'warning',
      message: 'DOMParser unavailable in this environment — used strip-tags fallback.',
    });
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (err) {
    return genericXmlFallback(xml, 'ata_ispec', undefined, {
      level: 'warning',
      message: `XML parse error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return genericXmlFallback(xml, 'ata_ispec', undefined, {
      level: 'warning',
      message: `XML parse error: ${parserError.textContent?.slice(0, 200) ?? 'unknown'}`,
    });
  }

  const pi = collectProcessingInstructions(doc);

  const inpgblk = doc.querySelector('inpgblk');
  const chapnbr = pad2(safeAttr(inpgblk, 'chapnbr') ?? pi.PN1);
  const sectnbr = pad2(safeAttr(inpgblk, 'sectnbr') ?? pi.PN2);
  const subjnbr = pad2(safeAttr(inpgblk, 'subjnbr') ?? pi.PN3);

  const ataChapter = chapnbr ?? '00';
  const ataSection = chapnbr && sectnbr ? `${chapnbr}-${sectnbr}` : undefined;
  const ataNbr =
    pi.ATANBR ||
    (chapnbr && sectnbr && subjnbr ? `${chapnbr}-${sectnbr}-${subjnbr}` : undefined);

  // Applicable models + manual type from <ataref> elements
  const applicableModels: string[] = [];
  let manualType: string | undefined = pi.ATATYPE || undefined;
  const atarefs = Array.from(doc.querySelectorAll('ataref'));
  for (const ar of atarefs) {
    const model = safeAttr(ar, 'model');
    if (model && !applicableModels.includes(model)) applicableModels.push(model);
    const m = safeAttr(ar, 'manual');
    if (m && !manualType) manualType = m;
  }

  // Title preference: intro/title > ATATITLE PI > SUB_TITLE PI
  const introTitleEl = doc.querySelector('intro > title');
  const introTitle = introTitleEl?.textContent?.replace(/\s+/g, ' ').trim();
  const piTitle = pi.ATATITLE?.replace(/\s+/g, ' ').trim();
  const piSubTitle = pi.SUB_TITLE?.replace(/\s+/g, ' ').trim();
  const title = introTitle || piTitle || piSubTitle || undefined;

  const sections = collectSections(doc, ataChapter, ataSection);

  // Reading text: walk the document, skipping revision-noise tags.
  const root = doc.documentElement;
  const readingText = nodeReadingText(root);

  const oem = inferOemFromModels(applicableModels);
  const manufacturer = oemDisplayName(oem);

  // If structured extraction returned nothing useful, fall back so the file
  // is still searchable.
  if (!readingText && sections.length === 0 && !title) {
    return genericXmlFallback(xml, 'ata_ispec', oem, {
      level: 'warning',
      message: 'ATA iSpec parse extracted no content — used strip-tags fallback.',
    });
  }

  const notices: XmlIngestNotice[] = [];
  if (sections.length === 0) {
    notices.push({
      level: 'info',
      message: 'No <topic> headings found; sections list is empty.',
    });
  }

  return {
    readingText: readingText || stripXmlToText(xml),
    format: {
      family: 'ata_ispec',
      oem,
      confidence: title || sections.length > 0 ? 0.95 : 0.7,
    },
    metadata: {
      title,
      ataNbr,
      ataChapter,
      ataSection,
      ataSubject: subjnbr,
      revisionNumber: pi.REVNBR?.trim() || undefined,
      revisionDate: pi.REVDATE?.trim() || undefined,
      applicableModels: applicableModels.length > 0 ? applicableModels : undefined,
      manufacturer,
      manualType,
    },
    sections,
    notices: notices.length > 0 ? notices : undefined,
  };
}
