import { describe, it, expect, vi, beforeEach } from 'vitest';

const listMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    models = { list: listMock };
  },
}));

import {
  entryFromModelInfo,
  getClaudeModelCatalog,
  resetClaudeModelCatalogForTests,
  FALLBACK_CLAUDE_MODELS,
} from './modelCatalog.js';

function page(items: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

const ADAPTIVE_ONLY_CAPS = {
  thinking: {
    supported: true,
    types: { enabled: { supported: false }, adaptive: { supported: true } },
  },
  effort: {
    supported: true,
    low: { supported: true },
    medium: { supported: true },
    high: { supported: true },
    xhigh: { supported: true },
    max: { supported: true },
  },
};

describe('entryFromModelInfo', () => {
  it('derives thinking, sampling and effort support from capabilities', () => {
    const entry = entryFromModelInfo({
      id: 'claude-opus-9',
      display_name: 'Claude Opus 9',
      created_at: '2027-01-01T00:00:00Z',
      capabilities: ADAPTIVE_ONLY_CAPS,
    });
    expect(entry).toMatchObject({
      supportsThinking: true,
      supportsAdaptiveThinking: true,
      supportsBudgetThinking: false,
      supportsSampling: false,
      effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    });
  });

  it('treats a model with budget thinking as accepting sampling params', () => {
    const entry = entryFromModelInfo({
      id: 'claude-x',
      capabilities: {
        thinking: {
          supported: true,
          types: { enabled: { supported: true }, adaptive: { supported: false } },
        },
        effort: { supported: false },
      },
    });
    expect(entry).toMatchObject({
      supportsBudgetThinking: true,
      supportsSampling: true,
      effortLevels: [],
    });
  });

  it('falls back to the static row when capabilities are missing', () => {
    const entry = entryFromModelInfo({ id: 'claude-opus-4-7', display_name: 'Claude Opus 4.7' });
    expect(entry.supportsSampling).toBe(false);
  });
});

describe('getClaudeModelCatalog', () => {
  beforeEach(() => {
    resetClaudeModelCatalogForTests();
    listMock.mockReset();
  });

  it('returns the live list, newest first, and caches it', async () => {
    listMock.mockReturnValue(
      page([
        {
          id: 'claude-sonnet-4-6',
          display_name: 'Claude Sonnet 4.6',
          created_at: '2026-02-01T00:00:00Z',
        },
        {
          id: 'claude-mythos-5-1',
          display_name: 'Claude Mythos 5.1',
          created_at: '2026-08-01T00:00:00Z',
        },
        {
          id: 'claude-fable-5-1',
          display_name: 'Claude Fable 5.1',
          created_at: '2026-08-01T00:00:00Z',
        },
        {
          id: 'claude-opus-9',
          display_name: 'Claude Opus 9',
          created_at: '2027-01-01T00:00:00Z',
          capabilities: ADAPTIVE_ONLY_CAPS,
        },
      ])
    );
    const first = await getClaudeModelCatalog('sk-test');
    expect(first.source).toBe('live');
    expect(first.models.map((m) => m.id)).toEqual(['claude-opus-9', 'claude-sonnet-4-6']);

    await getClaudeModelCatalog('sk-test');
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('uses the fallback list when the Models API fails', async () => {
    listMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const catalog = await getClaudeModelCatalog('sk-test');
    expect(catalog).toEqual({ models: FALLBACK_CLAUDE_MODELS, source: 'fallback' });
  });

  it('uses the fallback list when there is no key', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const catalog = await getClaudeModelCatalog();
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    expect(catalog.source).toBe('fallback');
    expect(listMock).not.toHaveBeenCalled();
  });
});
