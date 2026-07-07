/**
 * Server-side guardrails for the Claude/chat proxy endpoints. The client UI
 * already limits model choice, max_tokens, and thinking budget, but anyone with
 * a valid Clerk token can POST to /api/claude directly — so the proxy must
 * enforce the same ceilings or it is an open spigot on the Anthropic balance.
 */
import { CLAUDE_MODELS } from '../claude-models.js';

/** Highest output budget any app feature legitimately requests (adaptive thinking in audit sim). */
export const MAX_TOKENS_CEILING = 32_000;
/** Highest thinking budget offered by the Settings UI. */
export const THINKING_BUDGET_CEILING = 20_000;
/** Web searches are billed per use; every web_search tool entry gets a cap. */
export const WEB_SEARCH_MAX_USES_CEILING = 5;
/** Reject absurd payloads before they reach the SDK (Vercel hard limit is ~4.5MB on Hobby). */
export const MAX_BODY_BYTES = 9 * 1024 * 1024;

const ALLOWED_CLAUDE_MODELS = new Set(CLAUDE_MODELS.map((m) => m.id));
const OPENAI_MODEL_PATTERN = /^(gpt-|o\d)/;

export interface ValidationFailure {
  ok: false;
  status: number;
  message: string;
}

export interface ValidatedRequest {
  ok: true;
  model: string;
  max_tokens: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
  tools?: Array<Record<string, unknown>>;
}

export type ValidationResult = ValidatedRequest | ValidationFailure;

function fail(status: number, message: string): ValidationFailure {
  return { ok: false, status, message };
}

/**
 * Validate and clamp the spend-relevant fields of a proxy request body.
 * Returns clamped values to pass to the SDK in place of the raw body fields.
 */
export function validateClaudeRequest(
  body: Record<string, unknown>,
  provider: 'anthropic' | 'openai' = 'anthropic'
): ValidationResult {
  const model = body?.model;
  if (typeof model !== 'string' || model.length === 0) {
    return fail(400, 'Missing required field: model');
  }
  if (provider === 'anthropic' && !ALLOWED_CLAUDE_MODELS.has(model)) {
    return fail(400, `Model not allowed: ${model}`);
  }
  if (provider === 'openai' && !OPENAI_MODEL_PATTERN.test(model)) {
    return fail(400, `Model not allowed: ${model}`);
  }

  const rawMaxTokens = body?.max_tokens;
  if (typeof rawMaxTokens !== 'number' || !Number.isFinite(rawMaxTokens) || rawMaxTokens <= 0) {
    return fail(400, 'Missing or invalid field: max_tokens');
  }
  const max_tokens = Math.min(Math.floor(rawMaxTokens), MAX_TOKENS_CEILING);

  let thinking: ValidatedRequest['thinking'];
  const rawThinking = body?.thinking as { type?: string; budget_tokens?: unknown } | undefined;
  if (rawThinking && typeof rawThinking === 'object') {
    if (rawThinking.type === 'enabled') {
      const budget =
        typeof rawThinking.budget_tokens === 'number' && Number.isFinite(rawThinking.budget_tokens)
          ? rawThinking.budget_tokens
          : 0;
      if (budget <= 0) {
        return fail(400, 'Invalid thinking.budget_tokens');
      }
      thinking = {
        type: 'enabled',
        budget_tokens: Math.min(Math.floor(budget), THINKING_BUDGET_CEILING),
      };
    }
    // Any other thinking.type is dropped rather than forwarded.
  }

  let tools: ValidatedRequest['tools'];
  const rawTools = body?.tools;
  if (rawTools !== undefined) {
    if (!Array.isArray(rawTools)) {
      return fail(400, 'Invalid field: tools must be an array');
    }
    tools = [];
    for (const tool of rawTools) {
      if (!tool || typeof tool !== 'object') {
        return fail(400, 'Invalid tool entry');
      }
      const t = tool as Record<string, unknown>;
      if (t.type === 'web_search_20250305') {
        const requested = typeof t.max_uses === 'number' && t.max_uses > 0 ? t.max_uses : Infinity;
        tools.push({ ...t, max_uses: Math.min(requested, WEB_SEARCH_MAX_USES_CEILING) });
        continue;
      }
      // Plain client-defined tools (name + input_schema) carry no server-side
      // cost beyond tokens; other server tools (code execution, computer use,
      // unknown future billed tools) are rejected.
      if (t.type === undefined || t.type === 'custom') {
        tools.push(t);
        continue;
      }
      return fail(400, `Tool type not allowed: ${String(t.type)}`);
    }
  }

  return { ok: true, model, max_tokens, thinking, tools };
}

/** Cheap payload-size guard; returns a failure when the body is unreasonably large. */
export function checkBodySize(req: { headers?: Record<string, unknown> }): ValidationFailure | null {
  const lenHeader = req?.headers?.['content-length'];
  const len = typeof lenHeader === 'string' ? parseInt(lenHeader, 10) : NaN;
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return fail(413, 'Request body too large.');
  }
  return null;
}
