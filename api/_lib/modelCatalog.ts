/**
 * The Claude model catalog: which models the UI offers, which the proxy
 * accepts, and what request shape each one takes.
 *
 * Sourced live from Anthropic's Models API (GET /v1/models) so new models
 * appear and retired ones drop out without a code change. A hand-maintained
 * fallback list covers cold starts with no key and Models API outages.
 */
import Anthropic from '@anthropic-ai/sdk';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface ClaudeModelEntry {
  id: string;
  display_name: string;
  created_at: string;
  /** Any form of extended thinking is available. */
  supportsThinking: boolean;
  /** `thinking: { type: 'adaptive' }` (Claude 4.6+). */
  supportsAdaptiveThinking: boolean;
  /** `thinking: { type: 'enabled', budget_tokens }`. Removed on Opus 4.7+ and the 5 family. */
  supportsBudgetThinking: boolean;
  /** `temperature` / `top_p` / `top_k`. Removed alongside budget thinking. */
  supportsSampling: boolean;
  /** `output_config.effort` levels the model accepts; empty when effort is unsupported. */
  effortLevels: EffortLevel[];
}

const ADAPTIVE_ONLY = {
  supportsThinking: true,
  supportsAdaptiveThinking: true,
  supportsBudgetThinking: false,
  supportsSampling: false,
  effortLevels: EFFORT_LEVELS,
};
const ADAPTIVE_AND_BUDGET = {
  supportsThinking: true,
  supportsAdaptiveThinking: true,
  supportsBudgetThinking: true,
  supportsSampling: true,
  effortLevels: ['low', 'medium', 'high', 'max'] as EffortLevel[],
};
const BUDGET_ONLY = {
  supportsThinking: true,
  supportsAdaptiveThinking: false,
  supportsBudgetThinking: true,
  supportsSampling: true,
  effortLevels: [] as EffortLevel[],
};

/**
 * Used only when the live list is unavailable. Latest first. Does not need to
 * track every release - the live list does that - but every id the app
 * hard-codes (DEFAULT_CLAUDE_MODEL, OCR_CLAUDE_MODEL) must stay here.
 */
export const FALLBACK_CLAUDE_MODELS: ClaudeModelEntry[] = [
  {
    id: 'claude-opus-5',
    display_name: 'Claude Opus 5',
    created_at: '2026-06-01',
    ...ADAPTIVE_ONLY,
  },
  {
    id: 'claude-sonnet-5',
    display_name: 'Claude Sonnet 5',
    created_at: '2026-06-01',
    ...ADAPTIVE_ONLY,
  },
  {
    id: 'claude-opus-4-8',
    display_name: 'Claude Opus 4.8',
    created_at: '2026-05-01',
    ...ADAPTIVE_ONLY,
  },
  {
    id: 'claude-opus-4-7',
    display_name: 'Claude Opus 4.7',
    created_at: '2026-04-01',
    ...ADAPTIVE_ONLY,
  },
  {
    id: 'claude-opus-4-6',
    display_name: 'Claude Opus 4.6',
    created_at: '2026-02-01',
    ...ADAPTIVE_AND_BUDGET,
  },
  {
    id: 'claude-sonnet-4-6',
    display_name: 'Claude Sonnet 4.6',
    created_at: '2026-02-01',
    ...ADAPTIVE_AND_BUDGET,
  },
  {
    id: 'claude-opus-4-5-20251101',
    display_name: 'Claude Opus 4.5',
    created_at: '2025-11-01',
    ...BUDGET_ONLY,
    effortLevels: ['low', 'medium', 'high'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    display_name: 'Claude Haiku 4.5',
    created_at: '2025-10-01',
    ...BUDGET_ONLY,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    display_name: 'Claude Sonnet 4.5',
    created_at: '2025-09-29',
    ...BUDGET_ONLY,
  },
];

/** Minimal shape of a Models API entry; `capabilities` is untyped in the SDK. */
interface ModelInfoLike {
  id: string;
  display_name?: string;
  created_at?: string;
  capabilities?: any;
}

function supported(node: any): boolean {
  return node?.supported === true;
}

/** Map a live Models API entry onto the catalog shape. */
export function entryFromModelInfo(info: ModelInfoLike): ClaudeModelEntry {
  const caps = info.capabilities;
  const known = FALLBACK_CLAUDE_MODELS.find((m) => m.id === info.id);
  // Older API responses carry no capability tree; trust the fallback row, else
  // assume the conservative pre-4.6 shape (budget thinking, sampling allowed).
  if (!caps || typeof caps !== 'object') {
    return known
      ? { ...known, display_name: info.display_name || known.display_name }
      : {
          id: info.id,
          display_name: info.display_name || info.id,
          created_at: info.created_at || '',
          ...BUDGET_ONLY,
        };
  }

  const thinking = caps.thinking;
  const supportsThinking = supported(thinking);
  const supportsAdaptiveThinking = supportsThinking && supported(thinking?.types?.adaptive);
  const supportsBudgetThinking = supportsThinking && supported(thinking?.types?.enabled);
  const effort = caps.effort;
  const effortLevels = supported(effort) ? EFFORT_LEVELS.filter((l) => supported(effort?.[l])) : [];

  return {
    id: info.id,
    display_name: info.display_name || info.id,
    created_at: info.created_at || '',
    supportsThinking,
    supportsAdaptiveThinking,
    supportsBudgetThinking,
    // The Models API has no sampling flag. Every model so far that dropped
    // budget_tokens (Opus 4.7+, Sonnet 5, Fable) dropped sampling params in the
    // same release, so use that as the signal.
    supportsSampling: !supportsThinking || supportsBudgetThinking,
    effortLevels,
  };
}

export interface ClaudeModelCatalog {
  models: ClaudeModelEntry[];
  source: 'live' | 'fallback';
}

/** A refresh is attempted this often while the list is healthy. */
const LIVE_TTL_MS = 60 * 60 * 1000;
/** After a failed fetch, wait this long before trying again. */
const FAILURE_RETRY_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

let cachedLive: { models: ClaudeModelEntry[]; fetchedAt: number } | null = null;
let lastFailureAt = 0;
let inFlight: Promise<ClaudeModelEntry[] | null> | null = null;

async function fetchLiveModels(apiKey: string): Promise<ClaudeModelEntry[] | null> {
  try {
    const client = new Anthropic({ apiKey, timeout: FETCH_TIMEOUT_MS, maxRetries: 1 });
    const models: ClaudeModelEntry[] = [];
    for await (const info of client.models.list({ limit: 100 })) {
      if (typeof info.id === 'string' && info.id.startsWith('claude-')) {
        models.push(entryFromModelInfo(info as ModelInfoLike));
      }
    }
    if (models.length === 0) return null;
    models.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return models;
  } catch (err: any) {
    console.error('[modelCatalog] live model list failed', err?.status ?? '', err?.message ?? err);
    return null;
  }
}

/**
 * The current catalog. Uses the live list when it is fresh; otherwise
 * refreshes with `apiKey` (or this runtime's ANTHROPIC_API_KEY). A stale live
 * list beats the fallback when a refresh fails.
 */
export async function getClaudeModelCatalog(apiKey?: string): Promise<ClaudeModelCatalog> {
  const now = Date.now();
  if (cachedLive && now - cachedLive.fetchedAt < LIVE_TTL_MS) {
    return { models: cachedLive.models, source: 'live' };
  }

  const key = (apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
  const mayRetry = now - lastFailureAt >= FAILURE_RETRY_MS;
  if (key && mayRetry) {
    inFlight ??= fetchLiveModels(key).finally(() => {
      inFlight = null;
    });
    const fresh = await inFlight;
    if (fresh) {
      cachedLive = { models: fresh, fetchedAt: Date.now() };
      return { models: fresh, source: 'live' };
    }
    lastFailureAt = Date.now();
  }

  if (cachedLive) return { models: cachedLive.models, source: 'live' };
  return { models: FALLBACK_CLAUDE_MODELS, source: 'fallback' };
}

/**
 * Look up a model the proxy may call. Live entries win; the fallback list is
 * also accepted so hard-coded ids keep working if the live list names them
 * differently (e.g. an undated alias vs a dated snapshot).
 */
export function findClaudeModel(
  models: readonly ClaudeModelEntry[],
  id: string
): ClaudeModelEntry | undefined {
  return models.find((m) => m.id === id) ?? FALLBACK_CLAUDE_MODELS.find((m) => m.id === id);
}

/** Test hook: forget the cached live list. */
export function resetClaudeModelCatalogForTests(): void {
  cachedLive = null;
  lastFailureAt = 0;
  inFlight = null;
}
