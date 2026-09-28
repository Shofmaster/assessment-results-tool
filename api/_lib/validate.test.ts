import { describe, it, expect } from 'vitest';
import {
  validateClaudeRequest,
  checkBodySize,
  MAX_TOKENS_CEILING,
  THINKING_BUDGET_CEILING,
  WEB_SEARCH_MAX_USES_CEILING,
  MAX_BODY_BYTES,
} from './validate.js';

const BASE_BODY = {
  model: 'claude-sonnet-4-6',
  max_tokens: 4000,
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('validateClaudeRequest', () => {
  it('accepts a known Claude model and passes values through', () => {
    const result = validateClaudeRequest({ ...BASE_BODY });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe('claude-sonnet-4-6');
      expect(result.max_tokens).toBe(4000);
      expect(result.thinking).toBeUndefined();
      expect(result.tools).toBeUndefined();
    }
  });

  it('rejects models not on the allowlist', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, model: 'claude-fancy-future-9' });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a missing model', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, model: undefined });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('clamps max_tokens to the ceiling', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, max_tokens: 999_999 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.max_tokens).toBe(MAX_TOKENS_CEILING);
  });

  it('rejects non-numeric or non-positive max_tokens', () => {
    expect(validateClaudeRequest({ ...BASE_BODY, max_tokens: '4000' }).ok).toBe(false);
    expect(validateClaudeRequest({ ...BASE_BODY, max_tokens: 0 }).ok).toBe(false);
    expect(validateClaudeRequest({ ...BASE_BODY, max_tokens: -5 }).ok).toBe(false);
  });

  it('clamps thinking budget to the ceiling', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'enabled', budget_tokens: 100_000 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thinking).toEqual({ type: 'enabled', budget_tokens: THINKING_BUDGET_CEILING });
    }
  });

  it('keeps thinking budgets under the ceiling unchanged', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'enabled', budget_tokens: 2000 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
    }
  });

  it('rejects enabled thinking without a budget', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'enabled' },
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('turns budget thinking into adaptive on models that removed budget_tokens', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      model: 'claude-opus-5-5',
      thinking: { type: 'enabled', budget_tokens: 8000 },
      temperature: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thinking).toEqual({ type: 'adaptive' });
      expect(result.temperature).toBeUndefined();
    }
  });

  it('drops temperature on models that reject sampling params', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, model: 'claude-opus-4-7', temperature: 0.2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.temperature).toBeUndefined();
  });

  it('keeps temperature on models that accept it', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, temperature: 0.2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.temperature).toBe(0.2);
  });

  it('forwards adaptive thinking and a supported effort level', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      temperature: 0.7,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thinking).toEqual({ type: 'adaptive' });
      expect(result.output_config).toEqual({ effort: 'high' });
      expect(result.temperature).toBeUndefined();
    }
  });

  it('drops adaptive thinking and effort on models without them', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      model: 'claude-haiku-4-5-20251001',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thinking).toBeUndefined();
      expect(result.output_config).toBeUndefined();
    }
  });

  it('accepts a model from the live catalog that is not on the fallback list', () => {
    const live = [
      {
        id: 'claude-opus-9',
        display_name: 'Claude Opus 9',
        created_at: '2027-01-01',
        supportsThinking: true,
        supportsAdaptiveThinking: true,
        supportsBudgetThinking: false,
        supportsSampling: false,
        effortLevels: ['low' as const, 'high' as const],
      },
    ];
    const result = validateClaudeRequest({ ...BASE_BODY, model: 'claude-opus-9' }, 'anthropic', live);
    expect(result.ok).toBe(true);
    // The fallback list stays accepted alongside the live one.
    expect(validateClaudeRequest({ ...BASE_BODY }, 'anthropic', live).ok).toBe(true);
  });

  it('forces max_uses onto web_search tools that lack one', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tools).toEqual([
        { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES_CEILING },
      ]);
    }
  });

  it('clamps an oversized web_search max_uses', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 50 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.tools?.[0] as any).max_uses).toBe(WEB_SEARCH_MAX_USES_CEILING);
    }
  });

  it('keeps a smaller requested web_search max_uses', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.tools?.[0] as any).max_uses).toBe(2);
    }
  });

  it('allows plain client-defined tools (no type field)', () => {
    const tool = {
      name: 'lookup',
      description: 'Look something up',
      input_schema: { type: 'object', properties: {} },
    };
    const result = validateClaudeRequest({ ...BASE_BODY, tools: [tool] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tools).toEqual([tool]);
  });

  it('rejects other server tool types', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      tools: [{ type: 'code_execution_20250522', name: 'code_execution' }],
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a non-array tools field', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, tools: { name: 'x' } });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('validates openai models by prefix instead of the Claude allowlist', () => {
    expect(validateClaudeRequest({ ...BASE_BODY, model: 'gpt-4o' }, 'openai').ok).toBe(true);
    expect(validateClaudeRequest({ ...BASE_BODY, model: 'o3-mini' }, 'openai').ok).toBe(true);
    expect(validateClaudeRequest({ ...BASE_BODY, model: 'claude-sonnet-4-6' }, 'openai').ok).toBe(false);
  });
});

describe('checkBodySize', () => {
  it('passes bodies under the limit', () => {
    expect(checkBodySize({ headers: { 'content-length': '1024' } })).toBeNull();
  });

  it('rejects bodies over the limit with 413', () => {
    const result = checkBodySize({ headers: { 'content-length': String(MAX_BODY_BYTES + 1) } });
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('passes when the header is absent', () => {
    expect(checkBodySize({ headers: {} })).toBeNull();
    expect(checkBodySize({})).toBeNull();
  });
});
