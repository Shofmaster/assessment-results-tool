/**
 * One-shot Ask "Full Answer" work package: retrieve manuals once, one Claude
 * JSON call (no record-tool loop), coerce against provided [S#] tags.
 */

import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import { extractJsonFromMarkdown } from '../utils/jsonParsing';
import { expandAviationQuery } from '../utils/aviationQueryExpand';
import type { AskSource } from '../types/askSources';
import {
  emptyAskWorkPackage,
  emptyAskWorkPackageMel,
  type AskWorkPackage,
  type AskWorkPackageMel,
  type AskWorkPackagePart,
  type AskWorkPackageStep,
} from '../types/askWorkPackage';

const WORK_PACKAGE_MAX_TOKENS = 3072;

export type AskWorkPackageAircraftContext = {
  tailNumber?: string;
  make?: string;
  model?: string;
};

const WORK_PACKAGE_SYSTEM = `You are an aviation maintenance technician's research assistant for AeroGap Ask an Expert.
Given the user's question and tagged manual excerpts [S1], [S2], …, produce a structured FULL ANSWER package: what to do, MEL guidance (only when supported), troubleshooting steps with citations, corrective action, parts, and example logbook language.

Return ONLY a JSON object — no prose before or after — matching this shape exactly:

{
  "summary": string,
  "mel": {
    "item": string,
    "deferralCategory": string,
    "maintenanceProcedures": string,
    "operationalProcedures": string,
    "operationalLimits": string,
    "gapNote": string
  },
  "troubleshootingSteps": [{ "text": string, "refTags": string[] }],
  "correctiveAction": string,
  "partsNeeded": [{ "partNumber": string, "description": string }],
  "exampleLogEntries": {
    "discrepancyWriteUp": string,
    "workPerformed": string,
    "ataChapter": string,
    "returnToServiceStatement": string
  },
  "noManualReferencesFound": boolean
}

Rules:
- Do NOT invent MEL item numbers, deferral categories, or (M)/(O) procedures. Only fill mel fields from retrieved MEL/MMEL excerpts. If none apply, leave mel fields empty and set mel.gapNote to explain (e.g. "Not in retrieved MEL/MMEL passages").
- Each troubleshooting step MUST include refTags that appear in the provided sources (e.g. ["S1"]) when the step relies on an excerpt. Use [] only for explicit general-practice steps and say so in the text.
- Never invent a tag that is not in the provided sources.
- exampleLogEntries.workPerformed should be imperative past-tense, ready for a 14 CFR 43.9 draft — mark it as draft language in the summary if needed; the UI will remind the user to verify.
- noManualReferencesFound is true ONLY when zero relevant excerpts exist; then give best-practice guidance and acknowledge the gap in summary.
- Keep partsNeeded empty when none are genuinely needed.`;

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter(Boolean);
}

function coerceMel(raw: unknown): AskWorkPackageMel {
  if (!raw || typeof raw !== 'object') {
    return emptyAskWorkPackageMel('Not in retrieved MEL/MMEL passages.');
  }
  const o = raw as Record<string, unknown>;
  const mel: AskWorkPackageMel = {
    item: asString(o.item),
    deferralCategory: asString(o.deferralCategory),
    maintenanceProcedures: asString(o.maintenanceProcedures),
    operationalProcedures: asString(o.operationalProcedures),
    operationalLimits: asString(o.operationalLimits),
    gapNote: asString(o.gapNote),
  };
  const hasContent =
    mel.item ||
    mel.deferralCategory ||
    mel.maintenanceProcedures ||
    mel.operationalProcedures ||
    mel.operationalLimits;
  if (!hasContent && !mel.gapNote) {
    mel.gapNote = 'Not in retrieved MEL/MMEL passages.';
  }
  return mel;
}

function coerceSteps(raw: unknown, allowedTags: Set<string>): AskWorkPackageStep[] {
  if (!Array.isArray(raw)) return [];
  const out: AskWorkPackageStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const text = asString(o.text);
    if (!text) continue;
    const refTags = asStringArray(o.refTags)
      .map((t) => (t.startsWith('S') ? t : `S${t.replace(/^\[?S?/i, '').replace(/\]$/, '')}`))
      .map((t) => t.replace(/^\[|\]$/g, ''))
      .filter((t) => /^S[1-9]\d{0,2}$/.test(t) && allowedTags.has(t));
    // Also accept tags embedded in text like [S1]
    const fromText = [...text.matchAll(/\[S([1-9]\d{0,2})\]/g)]
      .map((m) => `S${m[1]}`)
      .filter((t) => allowedTags.has(t));
    const merged = [...new Set([...refTags, ...fromText])];
    out.push({ text: text.replace(/\s*\[S[1-9]\d{0,2}\]\s*/g, ' ').replace(/\s+/g, ' ').trim(), refTags: merged });
  }
  return out;
}

function coerceParts(raw: unknown): AskWorkPackagePart[] {
  if (!Array.isArray(raw)) return [];
  const out: AskWorkPackagePart[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const partNumber = asString(o.partNumber);
    const description = asString(o.description);
    if (!partNumber && !description) continue;
    out.push({ partNumber, description });
  }
  return out;
}

/**
 * Coerce model JSON into a safe AskWorkPackage; drops unknown citation tags.
 */
export function coerceAskWorkPackage(
  raw: unknown,
  sources: AskSource[],
  opts?: { noManualReferencesFound?: boolean },
): AskWorkPackage {
  const allowed = new Set(sources.map((s) => s.tag));
  const base = emptyAskWorkPackage();
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      noManualReferencesFound: opts?.noManualReferencesFound ?? sources.length === 0,
      mel: emptyAskWorkPackageMel(
        sources.length === 0
          ? 'No manual excerpts were retrieved for this question.'
          : 'Not in retrieved MEL/MMEL passages.',
      ),
      summary: 'Could not parse a structured full answer. Try again or use Ask for a free-form reply.',
    };
  }
  const o = raw as Record<string, unknown>;
  const logRaw =
    o.exampleLogEntries && typeof o.exampleLogEntries === 'object'
      ? (o.exampleLogEntries as Record<string, unknown>)
      : {};
  return {
    summary: asString(o.summary),
    mel: coerceMel(o.mel),
    troubleshootingSteps: coerceSteps(o.troubleshootingSteps, allowed),
    correctiveAction: asString(o.correctiveAction),
    partsNeeded: coerceParts(o.partsNeeded),
    exampleLogEntries: {
      discrepancyWriteUp: asString(logRaw.discrepancyWriteUp),
      workPerformed: asString(logRaw.workPerformed),
      ataChapter: asString(logRaw.ataChapter),
      returnToServiceStatement: asString(logRaw.returnToServiceStatement),
    },
    noManualReferencesFound:
      opts?.noManualReferencesFound === true ||
      o.noManualReferencesFound === true ||
      sources.length === 0,
  };
}

function tryParseLooseJson(text: string): unknown {
  const fenced = extractJsonFromMarkdown<unknown>(text, 'askWorkPackage');
  if (fenced !== null) return fenced;
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  return null;
}

/** Boost Full Answer retrieval toward MEL / troubleshooting manuals. */
export function expandFullAnswerQuery(query: string): string {
  const base = expandAviationQuery(query);
  const extras = ['MEL', 'MMEL', 'AMM', 'troubleshooting', 'minimum equipment list'];
  const lower = base.toLowerCase();
  const add = extras.filter((e) => !lower.includes(e.toLowerCase()));
  return add.length ? `${base} ${add.join(' ')}` : base;
}

function formatSourcesBlock(sources: AskSource[]): string {
  if (sources.length === 0) {
    return '(No matching excerpts found in the project manuals.)';
  }
  return sources
    .map((s) => {
      if (s.kind === 'chunk') {
        return `[${s.tag}] docName="${s.docName}" category=${s.category} chunkIndex=${s.chunkIndex}\n${s.excerpt || ''}`;
      }
      if (s.kind === 'document') {
        return `[${s.tag}] document "${s.docName}" (full document, category=${s.category})`;
      }
      return `[${s.tag}] record ${s.label}`;
    })
    .join('\n\n---\n\n');
}

export async function runAskWorkPackage(args: {
  query: string;
  sources: AskSource[];
  passageContext?: string;
  aircraft?: AskWorkPackageAircraftContext;
  signal?: AbortSignal;
}): Promise<AskWorkPackage> {
  const aircraftLine = [
    args.aircraft?.tailNumber ? `Tail: ${args.aircraft.tailNumber}` : null,
    args.aircraft?.make ? `Make: ${args.aircraft.make}` : null,
    args.aircraft?.model ? `Model: ${args.aircraft.model}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const userPrompt = [
    aircraftLine ? `AIRCRAFT CONTEXT\n${aircraftLine}\n` : '',
    `QUESTION\n${args.query.trim()}\n`,
    'MANUAL EXCERPTS (cite only these tags)',
    args.passageContext?.trim() || formatSourcesBlock(args.sources),
  ]
    .filter(Boolean)
    .join('\n');

  const response = await createClaudeMessage(
    {
      model: DEFAULT_CLAUDE_MODEL,
      max_tokens: WORK_PACKAGE_MAX_TOKENS,
      temperature: 0.2,
      system: [
        {
          type: 'text',
          text: WORK_PACKAGE_SYSTEM,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    },
    { signal: args.signal },
  );

  const text = response.content
    .map((b) => ('text' in b && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
    .trim();
  const parsed = tryParseLooseJson(text);
  return coerceAskWorkPackage(parsed, args.sources, {
    noManualReferencesFound: args.sources.length === 0,
  });
}

/** Build a plain markdown summary for transcript/PDF when only the package is stored. */
export function workPackageToMarkdown(pkg: AskWorkPackage): string {
  const lines: string[] = [];
  if (pkg.summary) {
    lines.push(pkg.summary, '');
  }
  lines.push('## MEL');
  if (pkg.mel.gapNote && !pkg.mel.item) {
    lines.push(pkg.mel.gapNote);
  } else {
    if (pkg.mel.item) lines.push(`- Item: ${pkg.mel.item}`);
    if (pkg.mel.deferralCategory) lines.push(`- Deferral: ${pkg.mel.deferralCategory}`);
    if (pkg.mel.maintenanceProcedures) lines.push(`- (M): ${pkg.mel.maintenanceProcedures}`);
    if (pkg.mel.operationalProcedures) lines.push(`- (O): ${pkg.mel.operationalProcedures}`);
    if (pkg.mel.operationalLimits) lines.push(`- Limits: ${pkg.mel.operationalLimits}`);
    if (pkg.mel.gapNote) lines.push(`- Note: ${pkg.mel.gapNote}`);
  }
  if (pkg.troubleshootingSteps.length) {
    lines.push('', '## Troubleshooting');
    pkg.troubleshootingSteps.forEach((s, i) => {
      const tags = s.refTags.map((t) => `[${t}]`).join('');
      lines.push(`${i + 1}. ${s.text}${tags ? ` ${tags}` : ''}`);
    });
  }
  if (pkg.correctiveAction) {
    lines.push('', '## Corrective action', pkg.correctiveAction);
  }
  if (pkg.partsNeeded.length) {
    lines.push('', '## Parts');
    for (const p of pkg.partsNeeded) {
      lines.push(`- ${p.partNumber}${p.description ? ` — ${p.description}` : ''}`);
    }
  }
  const log = pkg.exampleLogEntries;
  if (log.discrepancyWriteUp || log.workPerformed) {
    lines.push('', '## Example log entries (draft — verify against aircraft data)');
    if (log.discrepancyWriteUp) lines.push(`Discrepancy: ${log.discrepancyWriteUp}`);
    if (log.workPerformed) lines.push(`Work performed: ${log.workPerformed}`);
    if (log.ataChapter) lines.push(`ATA: ${log.ataChapter}`);
    if (log.returnToServiceStatement) lines.push(`RTS: ${log.returnToServiceStatement}`);
  }
  return lines.join('\n').trim();
}
