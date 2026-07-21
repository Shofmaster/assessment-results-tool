/**
 * Claude-powered extraction helpers for the splash "Ask an Expert" flow:
 * checklist-item extraction from answers and report extras (part numbers +
 * actions) for the PDF report. Extracted verbatim from SplashPage.tsx.
 */
import { createClaudeMessage } from '../../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../../constants/claude';

export function stripMarkdownSourcesSection(text: string): string {
  const idx = text.search(/^##\s+sources\s*$/im);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
}

export function truncateForChecklistName(s: string, max = 72): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type ChecklistItemDraft = { section: string; title: string; severity: 'major' };

export function extractChecklistItemsFromAnswer(answer: string): ChecklistItemDraft[] {
  const lines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLike = lines
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter((line) => line.length > 8 && line.length <= 180);
  const source =
    bulletLike.length > 0
      ? bulletLike
      : answer
          .split(/[.!?]\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 18 && s.length <= 180)
          .slice(0, 8);

  const dedup = new Set<string>();
  return source
    .filter((title) => {
      const key = title.toLowerCase();
      if (dedup.has(key)) return false;
      dedup.add(key);
      return true;
    })
    .slice(0, 12)
    .map((title) => ({
      section: 'AI Recommended Actions',
      title,
      severity: 'major' as const,
    }));
}

export async function extractChecklistItemsViaClaude(userQuestion: string, answerBody: string): Promise<ChecklistItemDraft[]> {
  const body = stripMarkdownSourcesSection(answerBody).slice(0, 14000);
  const response = await createClaudeMessage({
    model: DEFAULT_CLAUDE_MODEL,
    max_tokens: 2000,
    temperature: 0.15,
    system: [
      'You turn an aviation compliance Q&A into a concise checklist.',
      'Reply with ONLY a JSON array (no markdown fences, no commentary).',
      'Each element must be an object: {"title": string}.',
      'Between 4 and 12 items. Short imperative titles (under 180 characters).',
      'Reflect actionable points from the assistant answer, in context of the user question.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `User question:\n${userQuestion.slice(0, 2000)}\n\nAssistant answer:\n${body}`,
      },
    ],
  });
  const text = response.content
    .filter((block): block is { type: string; text?: string } => block.type === 'text')
    .map((block) => block.text || '')
    .join('\n')
    .trim();
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ChecklistItemDraft[] = [];
  const seen = new Set<string>();
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const title = typeof (row as { title?: unknown }).title === 'string' ? (row as { title: string }).title.trim() : '';
    if (title.length < 6 || title.length > 220) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section: 'AI Recommended Actions', title, severity: 'major' });
    if (out.length >= 12) break;
  }
  return out;
}

export function parseSourcesSection(answer: string): string[] {
  const idx = answer.search(/^##\s+sources\s*$/im);
  if (idx === -1) return [];
  const block = answer.slice(idx);
  const lines = block.split('\n').slice(1); // drop the "## Sources" heading line
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{1,6}\s+/.test(line)) break; // stop at the next markdown heading
    const cleaned = line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
    if (cleaned.length < 2) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export type ReportExtras = {
  partNumbers: { partNumber: string; description?: string }[];
  actions: { title: string }[];
};

export async function extractReportExtrasViaClaude(
  entries: Array<{ question: string; answer: string }>,
): Promise<ReportExtras[]> {
  const fallback = (): ReportExtras[] =>
    entries.map((entry) => ({
      partNumbers: [],
      actions: extractChecklistItemsFromAnswer(stripMarkdownSourcesSection(entry.answer)).map((i) => ({
        title: i.title,
      })),
    }));

  if (entries.length === 0) return [];

  const payload = entries.map((entry, index) => ({
    index,
    question: entry.question.slice(0, 1200),
    answer: stripMarkdownSourcesSection(entry.answer).slice(0, 12000),
  }));

  try {
    const response = await createClaudeMessage({
      model: DEFAULT_CLAUDE_MODEL,
      max_tokens: 3000,
      temperature: 0.1,
      system: [
        'You extract structured reference data from aviation maintenance Q&A for a printable work report.',
        'Reply with ONLY a JSON array (no markdown fences, no commentary).',
        'For each input entry return an object: {"index": number, "partNumbers": [{"partNumber": string, "description": string}], "actions": [{"title": string}]}.',
        'partNumbers: ONLY include real part numbers, NSNs, or AN/MS/NAS hardware callouts that literally appear in that entry\'s answer. Copy the identifier exactly. description is a short plain-language note (may be empty). If none appear, return an empty array.',
        'actions: 4 to 12 short imperative checklist titles (under 180 characters) reflecting actionable steps from the answer. If the answer has no actions, return an empty array.',
        'Always return one object per input index, in the same order.',
      ].join('\n'),
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
    const text = response.content
      .filter((block): block is { type: string; text?: string } => block.type === 'text')
      .map((block) => block.text || '')
      .join('\n')
      .trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return fallback();

    const result: ReportExtras[] = entries.map(() => ({ partNumbers: [], actions: [] }));
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const index = typeof (row as { index?: unknown }).index === 'number' ? (row as { index: number }).index : -1;
      if (index < 0 || index >= result.length) continue;

      const rawParts = Array.isArray((row as { partNumbers?: unknown }).partNumbers)
        ? ((row as { partNumbers: unknown[] }).partNumbers)
        : [];
      const partNumbers: { partNumber: string; description?: string }[] = [];
      const partSeen = new Set<string>();
      for (const p of rawParts) {
        if (!p || typeof p !== 'object') continue;
        const partNumber = typeof (p as { partNumber?: unknown }).partNumber === 'string'
          ? (p as { partNumber: string }).partNumber.trim()
          : '';
        if (!partNumber) continue;
        const key = partNumber.toLowerCase();
        if (partSeen.has(key)) continue;
        partSeen.add(key);
        const description = typeof (p as { description?: unknown }).description === 'string'
          ? (p as { description: string }).description.trim()
          : '';
        partNumbers.push(description ? { partNumber, description } : { partNumber });
      }

      const rawActions = Array.isArray((row as { actions?: unknown }).actions)
        ? ((row as { actions: unknown[] }).actions)
        : [];
      const actions: { title: string }[] = [];
      const actionSeen = new Set<string>();
      for (const a of rawActions) {
        if (!a || typeof a !== 'object') continue;
        const title = typeof (a as { title?: unknown }).title === 'string' ? (a as { title: string }).title.trim() : '';
        if (title.length < 4 || title.length > 220) continue;
        const key = title.toLowerCase();
        if (actionSeen.has(key)) continue;
        actionSeen.add(key);
        actions.push({ title });
        if (actions.length >= 12) break;
      }

      result[index] = { partNumbers, actions };
    }

    // Fallback per-entry actions if the model returned none.
    for (let i = 0; i < result.length; i++) {
      if (result[i].actions.length === 0) {
        result[i].actions = extractChecklistItemsFromAnswer(
          stripMarkdownSourcesSection(entries[i].answer),
        ).map((item) => ({ title: item.title }));
      }
    }
    return result;
  } catch {
    return fallback();
  }
}
