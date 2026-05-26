import type { XmlIngestResult, XmlIngestSection } from './types';
import { genericXmlFallback, stripXmlToText } from './generic';
import { inferOemFromModels, oemDisplayName } from './oem';

/** S1000D markers: namespace URI, dmodule/pm root elements, DMC structure. */
export function looksS1000D(xml: string): boolean {
  if (/xmlns(:[a-zA-Z0-9_-]+)?\s*=\s*"urn:s1000d:/i.test(xml)) return true;
  if (/<dmodule\b/i.test(xml)) return true;
  if (/<pm\b/i.test(xml)) return true;
  if (/<dmAddress\b/i.test(xml)) return true;
  if (/<dmCode\b[^>]*systemCode=/i.test(xml)) return true;
  return false;
}

function readAttr(el: Element | null, name: string): string | undefined {
  if (!el) return undefined;
  const v = el.getAttribute(name);
  return v ? v.trim() || undefined : undefined;
}

function buildIssueDate(el: Element | null): string | undefined {
  if (!el) return undefined;
  const y = readAttr(el, 'year');
  const m = readAttr(el, 'month');
  const d = readAttr(el, 'day');
  if (!y) return undefined;
  if (m && d) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (m) return `${y}-${m.padStart(2, '0')}`;
  return y;
}

/**
 * Best-effort S1000D parser.
 *
 * Reads identification metadata (DMC, issue, dates, title) and produces a
 * single TOC entry for the data module. Deep S1000D structural parsing (PM
 * hierarchy, BREX rules, applicability filters) is intentionally out of scope
 * — adding it should not break this entrypoint, since callers consume the
 * normalized XmlIngestResult shape.
 */
export function parseS1000D(xml: string): XmlIngestResult {
  if (typeof DOMParser === 'undefined') {
    return genericXmlFallback(xml, 's1000d', undefined, {
      level: 'warning',
      message: 'DOMParser unavailable — S1000D fell back to strip-tags.',
    });
  }

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (err) {
    return genericXmlFallback(xml, 's1000d', undefined, {
      level: 'warning',
      message: `XML parse error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return genericXmlFallback(xml, 's1000d', undefined, {
      level: 'warning',
      message: `XML parse error: ${parserError.textContent?.slice(0, 200) ?? 'unknown'}`,
    });
  }

  // dmCode — the structured ID. Fields vary by issue but commonly:
  // modelIdentCode, systemDiffCode, systemCode, subSystemCode, subSubSystemCode,
  // assyCode, disassyCode, disassyCodeVariant, infoCode, infoCodeVariant, itemLocationCode
  const dmCode = doc.querySelector('dmCode');
  const modelIdentCode = readAttr(dmCode, 'modelIdentCode');
  const systemCode = readAttr(dmCode, 'systemCode');
  const subSystemCode = readAttr(dmCode, 'subSystemCode');
  const subSubSystemCode = readAttr(dmCode, 'subSubSystemCode');

  const ataChapter = systemCode ? systemCode.padStart(2, '0') : undefined;
  const ataSection =
    systemCode && subSystemCode ? `${systemCode.padStart(2, '0')}-${subSystemCode}` : undefined;
  const ataSubject = subSubSystemCode;

  const issueInfo = doc.querySelector('issueInfo');
  const issueNumber = readAttr(issueInfo, 'issueNumber');
  const inWork = readAttr(issueInfo, 'inWork');
  const revisionNumber = issueNumber
    ? inWork && inWork !== '00'
      ? `${issueNumber}-${inWork}`
      : issueNumber
    : undefined;

  const issueDateEl = doc.querySelector('issueDate');
  const revisionDate = buildIssueDate(issueDateEl);

  // dmTitle: techName + infoName
  const techName = doc.querySelector('dmTitle techName, dmTitle > techname')?.textContent?.trim();
  const infoName = doc.querySelector('dmTitle infoName, dmTitle > infoname')?.textContent?.trim();
  const title = [techName, infoName].filter(Boolean).join(' — ') || undefined;

  // Applicability — applicable models are listed in <applic>/<displayText> or
  // <productAttributeValue>. Best-effort sweep for product / model names.
  const applicableModels: string[] = [];
  const applicEls = Array.from(doc.querySelectorAll('applic displayText, productAttributeValue'));
  for (const el of applicEls) {
    const text = el.textContent?.replace(/\s+/g, ' ').trim();
    if (text && !applicableModels.includes(text) && text.length <= 80) {
      applicableModels.push(text);
    }
  }

  // Reading text: skip identAndStatusSection (metadata) and revstatus blocks.
  const root = doc.documentElement;
  const skipTags = new Set([
    'identandstatussection',
    'revstatus',
    'idstatus',
    'rpc',
  ]);
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.nodeValue;
      if (t && t.trim()) parts.push(t.trim());
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (skipTags.has(el.tagName.toLowerCase())) return;
    for (let i = 0; i < el.childNodes.length; i++) visit(el.childNodes[i]!);
  };
  visit(root);
  const readingText = parts.join(' ').replace(/\s+/g, ' ').trim();

  const sections: XmlIngestSection[] = [];
  if (title && ataChapter) {
    sections.push({
      ataChapter,
      ataSection,
      title: title.slice(0, 200),
      depth: 1,
      startPage: 1,
      endPage: 1,
    });
  }

  const oem = inferOemFromModels(applicableModels);
  const manufacturer = oemDisplayName(oem);

  if (!readingText && !title) {
    return genericXmlFallback(xml, 's1000d', oem, {
      level: 'warning',
      message: 'S1000D parse extracted no content — used strip-tags fallback.',
    });
  }

  return {
    readingText: readingText || stripXmlToText(xml),
    format: {
      family: 's1000d',
      oem,
      confidence: title ? 0.9 : 0.7,
    },
    metadata: {
      title,
      ataChapter,
      ataSection,
      ataSubject,
      ataNbr:
        ataChapter && subSystemCode && subSubSystemCode
          ? `${ataChapter}-${subSystemCode}-${subSubSystemCode}`
          : undefined,
      revisionNumber,
      revisionDate,
      applicableModels: applicableModels.length > 0 ? applicableModels : undefined,
      manufacturer,
      manualType: modelIdentCode,
    },
    sections,
    notices: [
      {
        level: 'info',
        message:
          'S1000D detected. Top-level metadata + reading text extracted; deeper PM-level TOC parsing pending.',
      },
    ],
  };
}
