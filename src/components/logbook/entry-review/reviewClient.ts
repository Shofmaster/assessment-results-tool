import { createClaudeMessage } from '../../../services/claudeProxy';
import {
  LOGBOOK_REVIEW_STANDARDS,
  type LogbookReviewRegion,
} from '../../../services/logbookReviewPrompt';
import type { SmartReviewFinding, SmartReviewResult } from './types';

export function standardsByRegion(): Record<LogbookReviewRegion, typeof LOGBOOK_REVIEW_STANDARDS> {
  const grouped: Partial<Record<LogbookReviewRegion, typeof LOGBOOK_REVIEW_STANDARDS>> = {};
  for (const meta of LOGBOOK_REVIEW_STANDARDS) {
    const bucket = grouped[meta.region] ?? [];
    bucket.push(meta);
    grouped[meta.region] = bucket;
  }
  return grouped as Record<LogbookReviewRegion, typeof LOGBOOK_REVIEW_STANDARDS>;
}

export function splitEntriesByDateBoundaries(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const dateBoundary = /(?=^((\d{1,2}\/\d{1,2}\/\d{2,4})|(\d{4}-\d{2}-\d{2}))\b)/gm;
  const parts = normalized.split(dateBoundary).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return [normalized];
  return parts;
}

export function userFacingReviewCallError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err ?? '');
  if (/401|403|api|key|Unauthorized|quota|rate/i.test(m)) {
    return 'Review failed — check your AI/API settings and try again.';
  }
  if (/Response truncated/i.test(m)) {
    return 'The review response was cut off (likely too many standards selected). Reduce the number of standards or run a shorter selection.';
  }
  if (/No JSON in response/i.test(m)) {
    return 'The review service returned an unreadable response. Try a shorter selection or run the review again.';
  }
  if (/Expected.*JSON|Unexpected token|after array element|after property/i.test(m)) {
    return 'The review service returned malformed JSON. Try fewer standards, a shorter entry, or run the review again.';
  }
  if (/network|fetch|Failed to fetch/i.test(m)) {
    return 'Network error during review. Check your connection and try again.';
  }
  return m.length > 200 ? `${m.slice(0, 197)}…` : m || 'Review failed. Try again.';
}

export function scoreBadgeClass(score: number): string {
  if (score >= 85) return 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40';
  if (score >= 70) return 'text-amber-300 bg-amber-500/20 border-amber-500/40';
  if (score >= 50) return 'text-orange-300 bg-orange-500/20 border-orange-500/40';
  return 'text-red-300 bg-red-500/20 border-red-500/40';
}

export function overallLabel(status: SmartReviewResult['overallCompliance']): { label: string; cls: string } {
  switch (status) {
    case 'compliant':
      return { label: 'Compliant', cls: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40' };
    case 'minor_issues':
      return { label: 'Minor Issues', cls: 'text-amber-300 bg-amber-500/20 border-amber-500/40' };
    case 'major_issues':
      return { label: 'Major Issues', cls: 'text-orange-300 bg-orange-500/20 border-orange-500/40' };
    case 'non_compliant':
      return { label: 'Non-Compliant', cls: 'text-red-300 bg-red-500/20 border-red-500/40' };
  }
}

export function severityBadgeCls(s: SmartReviewFinding['severity']): string {
  if (s === 'critical') return 'text-red-300 bg-red-500/15 border-red-500/30';
  if (s === 'major') return 'text-orange-300 bg-orange-500/15 border-orange-500/30';
  return 'text-sky-300 bg-sky/15 border-sky/30';
}

export function extractJsonObject(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const haystack = fence && fence[1].includes('{') ? fence[1] : raw;
  const start = haystack.indexOf('{');
  if (start < 0) throw new Error('No JSON in response');

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < haystack.length; i++) {
    const c = haystack[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return haystack.slice(start, i + 1);
    }
  }
  throw new Error('Response truncated before JSON closed');
}

export function repairJson(input: string): string {
  let out = input;
  out = out.replace(/,(\s*[}\]])/g, '$1');
  out = out.replace(/}(\s*){/g, '},$1{');
  out = out.replace(/](\s*)\[/g, '],$1[');

  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (escape) {
      result += c;
      escape = false;
      continue;
    }
    if (c === '\\') {
      result += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      if (inString) {
        const rest = out.slice(i + 1);
        const closer = rest.search(/[,}\]\n]/);
        const between = closer < 0 ? rest : rest.slice(0, closer);
        if (/^\s*"/.test(between) || /^\s*[A-Za-z0-9_]/.test(between)) {
          result += '\\"';
          continue;
        }
      }
      inString = !inString;
      result += c;
      continue;
    }
    if (inString) {
      if (c === '\n') {
        result += '\\n';
        continue;
      }
      if (c === '\r') {
        result += '\\r';
        continue;
      }
      if (c === '\t') {
        result += '\\t';
        continue;
      }
    }
    result += c;
  }
  return result;
}

export function parseReviewJson<T>(raw: string): T {
  const candidate = extractJsonObject(raw);
  try {
    return JSON.parse(candidate) as T;
  } catch (firstErr) {
    try {
      return JSON.parse(repairJson(candidate)) as T;
    } catch {
      throw firstErr;
    }
  }
}

export async function callReview(
  mode: 'text' | 'image',
  payload: { text?: string; base64?: string; mediaType?: string; userText: string },
  model: string,
  systemPrompt: string,
): Promise<SmartReviewResult> {
  const userContent =
    mode === 'text'
      ? payload.userText
      : [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: payload.mediaType as string, data: payload.base64! },
          },
          { type: 'text' as const, text: payload.userText },
        ];

  const response = await createClaudeMessage({
    model,
    max_tokens: 6000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent as never }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? b.text : '') || '')
    .join('');
  return parseReviewJson<SmartReviewResult>(raw);
}

export function normalizeImageMime(mime: string | undefined): string {
  if (mime && mime.startsWith('image/')) return mime;
  return 'image/png';
}

export async function captureDisplayMediaFrame(): Promise<{ blob: Blob; mime: string }> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('SCREEN_CAPTURE_UNSUPPORTED');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('VIDEO_LOAD_ERROR'));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('VIDEO_METADATA_TIMEOUT'));
      }, 5000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });
    await video.play();
    await new Promise<void>((resolve) => {
      if ('requestVideoFrameCallback' in video && typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => resolve());
        return;
      }
      window.setTimeout(() => resolve(), 120);
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('ZERO_DIMENSIONS');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('NO_2D_CONTEXT');
    ctx.drawImage(video, 0, 0);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
    if (!blob) throw new Error('BLOB_FAILED');
    return { blob, mime: 'image/png' };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
