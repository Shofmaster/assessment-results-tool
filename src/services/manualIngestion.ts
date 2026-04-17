import { createClaudeMessage } from './claudeProxy';
import type { ParsedPublicationSection } from '../types/technicalPublication';

const TOC_PROMPT = `You are parsing an aircraft maintenance manual or IPC table of contents from raw extracted text (may include OCR noise).

## Task
Identify major ATA chapters / sections with approximate **printed PDF page numbers** (1-based). Focus on top-level chapters first (depth 1), e.g. ATA 05 "Time limits / maintenance checks", 12 "Servicing", etc.

## Rules
- Return ONLY a JSON array (no markdown fences required, but if you use fences use json).
- Each object: ataChapter (string, e.g. "05", "12"), ataSection (optional, e.g. "05-10"), title (short), startPage, endPage (integers), depth (1 for chapter, 2 for sub-section).
- If page ranges are unknown, estimate consecutive ranges from TOC order so startPage <= endPage and chapters do not overlap wildly.
- Limit to at most **80** rows. Prefer chapters 00–99 typical of ATA 100.
- If no usable TOC is found, return [].

## Input excerpt
`;

/** Exported for unit tests (Claude response → section rows). */
export function parsePublicationTocResponse(response: string): ParsedPublicationSection[] {
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : response.trim();
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const out: ParsedPublicationSection[] = [];
    for (const x of arr) {
      if (!x || typeof x.ataChapter !== 'string' || typeof x.title !== 'string') continue;
      const startPage = Number(x.startPage);
      const endPage = Number(x.endPage);
      const depth = Number(x.depth);
      if (!Number.isFinite(startPage) || !Number.isFinite(endPage)) continue;
      if (!Number.isFinite(depth) || depth < 1) continue;
      const ataChapter = String(x.ataChapter).trim().replace(/^chapter\s+/i, '');
      if (!ataChapter) continue;
      out.push({
        ataChapter: ataChapter.length <= 2 ? ataChapter.padStart(2, '0') : ataChapter,
        ataSection: x.ataSection != null ? String(x.ataSection).trim() : undefined,
        title: String(x.title).trim().slice(0, 200),
        startPage: Math.max(1, Math.floor(startPage)),
        endPage: Math.max(Math.floor(startPage), Math.floor(endPage)),
        depth: Math.min(3, Math.floor(depth)),
      });
    }
    return out.slice(0, 80);
  } catch {
    return [];
  }
}

/**
 * Detect ATA-style outline from the start of extracted manual text (TOC / front matter).
 */
export async function detectPublicationTocFromText(
  extractedTextHead: string,
  model: string,
  options?: { maxChars?: number }
): Promise<ParsedPublicationSection[]> {
  const maxChars = options?.maxChars ?? 45000;
  const head = (extractedTextHead || '').trim().slice(0, maxChars);
  if (head.length < 80) return [];

  const message = await createClaudeMessage({
    model,
    max_tokens: 8000,
    temperature: 0.1,
    messages: [{ role: 'user', content: `${TOC_PROMPT}\n\n${head}` }],
  });
  const responseText =
    message.content[0]?.type === 'text' ? (message.content[0].text || '') : '';
  return parsePublicationTocResponse(responseText);
}
