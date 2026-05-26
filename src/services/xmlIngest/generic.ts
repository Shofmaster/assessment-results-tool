import type { XmlIngestResult, XmlFamily, XmlOem, XmlIngestNotice } from './types';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Strip XML markup to recover plain reading text. Used for unrecognized OEM XML
 * and as the fallback when a family parser fails. Decodes common named entities
 * plus numeric character references.
 */
export function stripXmlToText(xml: string): string {
  return xml
    .replace(/<\?[\s\S]*?\?>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => safeFromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_m, n) => safeFromCodePoint(parseInt(n, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (_m, name) => NAMED_ENTITIES[name as string] ?? `&${name};`)
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Build a result for unrecognized XML: strip tags so the content is still
 * searchable, but emit no structured metadata or sections.
 */
export function genericXmlFallback(
  xml: string,
  family: XmlFamily = 'unrecognized',
  oem?: XmlOem,
  extraNotice?: XmlIngestNotice
): XmlIngestResult {
  const readingText = stripXmlToText(xml);
  const notices: XmlIngestNotice[] = [];
  if (family === 'unrecognized') {
    notices.push({
      level: 'info',
      message:
        'Unrecognized OEM XML — content extracted as plain text. Send a sample so an adapter can be added.',
    });
  }
  if (extraNotice) notices.push(extraNotice);
  return {
    readingText,
    format: { family, oem, confidence: 0.5 },
    metadata: {},
    sections: [],
    notices: notices.length > 0 ? notices : undefined,
  };
}
