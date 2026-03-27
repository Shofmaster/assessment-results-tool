/**
 * Chronic Issue Detector
 *
 * Uses Claude to cluster logbook entries by recurring defect theme and
 * surface patterns that deterministic rules cannot catch — e.g., "fuel
 * injector clogged" appearing 5 times in 18 months even though no single
 * entry violates an FAA rule.
 */

import { createClaudeMessage } from './claudeProxy';
import type { LogbookEntry } from '../types/logbook';

// ── Public types ────────────────────────────────────────────────────────────

export interface ChronicIssueCluster {
  /** Short human-readable name, e.g. "Fuel injector clogging" */
  theme: string;
  /** System category, e.g. "Fuel System" */
  category: string;
  /** ATA chapter if Claude identified one */
  ataChapter?: string;
  /** How many times this issue appears */
  occurrences: number;
  /** ISO date of the earliest matching entry */
  firstSeen: string;
  /** ISO date of the most recent matching entry */
  lastSeen: string;
  /** Calendar days between first and last occurrence */
  spanDays: number;
  /** Risk level based on system criticality + frequency */
  riskLevel: 'high' | 'medium' | 'low';
  /** One-sentence recommended action */
  recommendation: string;
  /** The actual LogbookEntry objects that matched */
  entries: LogbookEntry[];
}

export interface ChronicIssueResult {
  clusters: ChronicIssueCluster[];
  /** Total entries analysed */
  entriesAnalysed: number;
  /** Entries outside the sample window (capped at MAX_ENTRIES) */
  entriesSkipped: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_ENTRIES = 400;

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Analyse `entries` with Claude and return clusters of recurring defects.
 * Entries are sampled to MAX_ENTRIES; analysis runs via the /api/claude proxy.
 */
export async function detectChronicIssues(
  entries: LogbookEntry[],
): Promise<ChronicIssueResult> {
  const usable = entries.filter(
    (e) => (e.workPerformed?.trim() || e.rawText?.trim()),
  );

  if (usable.length < 2) {
    return { clusters: [], entriesAnalysed: 0, entriesSkipped: entries.length };
  }

  // Sort chronologically
  const sorted = [...usable].sort((a, b) =>
    (a.entryDate ?? '').localeCompare(b.entryDate ?? ''),
  );

  const sample = sorted.slice(0, MAX_ENTRIES);
  const entriesSkipped = entries.length - sample.length;

  // Build compact numbered list
  const lines = sample.map((e, idx) => {
    const date = e.entryDate ?? 'unknown';
    const ata = e.ataChapter ?? '—';
    const text = (e.workPerformed || e.rawText).slice(0, 180).replace(/\n+/g, ' ');
    return `[${idx}] ${date} | ATA ${ata} | ${text}`;
  });

  const response = await createClaudeMessage({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You are an experienced aviation maintenance analyst reviewing an aircraft's logbook history.

Your task: identify RECURRING DEFECTS or CHRONIC ISSUES — the same underlying problem appearing in multiple separate maintenance events.

Return ONLY a valid JSON array (no markdown fences, no prose).  If there are no chronic issues, return [].

Rules:
- Only include issues appearing in 2 or more separate entries.
- Do NOT flag routine inspections, oil changes, or standard airworthiness directive compliance unless the same AD was found non-compliant repeatedly.
- Keep themes concise (3–6 words).  Do not create duplicate clusters.
- riskLevel:
    "high"   → safety-critical systems (engine, propeller, flight controls, fuel, landing gear, electrical power) with 3+ occurrences, or any in-flight failure
    "medium" → airworthiness-affecting items with 2+ occurrences
    "low"    → non-safety items, cosmetic issues, consumables

JSON schema (array of these objects):
{
  "theme": string,
  "category": string,
  "ataChapter": string | null,
  "entryIndices": number[],
  "riskLevel": "high" | "medium" | "low",
  "recommendation": string
}

Logbook entries (format: [idx] date | ATA | description):
${lines.join('\n')}`,
      },
    ],
  });

  // Extract text from response
  const raw = (response.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => (b as any).text as string)
    .join('');

  // Strip accidental markdown fences
  const jsonText = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  let rawClusters: any[] = [];
  try {
    rawClusters = JSON.parse(jsonText);
    if (!Array.isArray(rawClusters)) rawClusters = [];
  } catch {
    return { clusters: [], entriesAnalysed: sample.length, entriesSkipped };
  }

  const clusters: ChronicIssueCluster[] = [];

  for (const rc of rawClusters) {
    const indices: number[] = Array.isArray(rc.entryIndices) ? rc.entryIndices : [];
    const matched = indices
      .filter((i) => typeof i === 'number' && i >= 0 && i < sample.length)
      .map((i) => sample[i]);

    if (matched.length < 2) continue;

    const dates = matched
      .map((e) => e.entryDate)
      .filter(Boolean)
      .sort() as string[];

    const firstSeen = dates[0] ?? '';
    const lastSeen = dates[dates.length - 1] ?? '';
    const spanDays = firstSeen && lastSeen
      ? Math.round(
          (new Date(lastSeen).getTime() - new Date(firstSeen).getTime()) / 86_400_000,
        )
      : 0;

    clusters.push({
      theme: String(rc.theme ?? 'Unknown issue'),
      category: String(rc.category ?? 'General'),
      ataChapter: rc.ataChapter ? String(rc.ataChapter) : undefined,
      occurrences: matched.length,
      firstSeen,
      lastSeen,
      spanDays,
      riskLevel: (['high', 'medium', 'low'] as const).includes(rc.riskLevel)
        ? rc.riskLevel as 'high' | 'medium' | 'low'
        : 'low',
      recommendation: String(rc.recommendation ?? ''),
      entries: matched,
    });
  }

  // Sort: high → medium → low, ties by occurrence count desc
  clusters.sort((a, b) => {
    const rl: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const diff = rl[a.riskLevel] - rl[b.riskLevel];
    return diff !== 0 ? diff : b.occurrences - a.occurrences;
  });

  return { clusters, entriesAnalysed: sample.length, entriesSkipped };
}
