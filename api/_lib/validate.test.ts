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

describe('validateClaudeRequest per-model thinking and sampling', () => {
  it('forwards adaptive thinking and effort on models that support it', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
    });
    expect(result).toMatchObject({
      ok: true,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
    });
  });

  it('drops adaptive thinking and effort on models without it', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      model: 'claude-sonnet-4-5-20250929',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.thinking).toBeUndefined();
      expect(result.output_config).toBeUndefined();
    }
  });

  it('drops unknown effort values and xhigh on models before Opus 4.7', () => {
    const bogus = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'ludicrous' },
    });
    const xhigh = validateClaudeRequest({
      ...BASE_BODY,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'xhigh' },
    });
    expect(bogus.ok && bogus.output_config).toBeFalsy();
    expect(xhigh.ok && xhigh.output_config).toBeFalsy();
  });

  it('never forwards effort without adaptive thinking', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, output_config: { effort: 'low' } });
    expect(result.ok && result.output_config).toBeFalsy();
  });

  it('rewrites a thinking budget to adaptive on Opus 4.7, which rejects budgets', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      model: 'claude-opus-4-7',
      thinking: { type: 'enabled', budget_tokens: 8000 },
    });
    expect(result).toMatchObject({ ok: true, thinking: { type: 'adaptive' } });
  });

  it('accepts xhigh effort on Opus 4.7', () => {
    const result = validateClaudeRequest({
      ...BASE_BODY,
      model: 'claude-opus-4-7',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'xhigh' },
    });
    expect(result).toMatchObject({ ok: true, output_config: { effort: 'xhigh' } });
  });

  it('strips temperature on Opus 4.7 and passes it through elsewhere', () => {
    const opus47 = validateClaudeRequest({ ...BASE_BODY, model: 'claude-opus-4-7', temperature: 0.2 });
    const sonnet = validateClaudeRequest({ ...BASE_BODY, temperature: 0.2 });
    expect(opus47.ok && opus47.temperature).toBeUndefined();
    expect(sonnet).toMatchObject({ ok: true, temperature: 0.2 });
  });

  it('drops a non-numeric temperature', () => {
    const result = validateClaudeRequest({ ...BASE_BODY, temperature: 'hot' });
    expect(result.ok && result.temperature).toBeUndefined();
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
