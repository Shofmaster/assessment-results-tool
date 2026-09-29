import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLAUDE_MODEL,
  OCR_CLAUDE_MODEL,
  MODELS_SUPPORTING_THINKING,
  modelSupportsThinking,
} from './claude';
import { FALLBACK_CLAUDE_MODELS as CLAUDE_MODELS } from '../../api/_lib/modelCatalog';

/**
 * Drift guard: the frontend's hand-maintained model constants must stay
 * consistent with the fallback list in api/_lib/modelCatalog.ts. The live
 * Models API list replaces it at runtime, but the fallback is always accepted
 * by the proxy, so hard-coded ids must be on it. A model the UI defaults to but
 * the proxy rejects is a silently broken feature, so fail the build here.
 */
describe('Claude model config consistency', () => {
  const byId = new Map(CLAUDE_MODELS.map((m) => [m.id, m]));

  it('DEFAULT_CLAUDE_MODEL is on the proxy allowlist', () => {
    expect(byId.has(DEFAULT_CLAUDE_MODEL)).toBe(true);
  });

  it('OCR_CLAUDE_MODEL is on the proxy allowlist', () => {
    expect(byId.has(OCR_CLAUDE_MODEL)).toBe(true);
  });

  it('modelSupportsThinking covers models newer than the static list', () => {
    expect(modelSupportsThinking('claude-opus-9')).toBe(true);
    expect(modelSupportsThinking('claude-sonnet-4-6')).toBe(true);
    expect(modelSupportsThinking('claude-3-haiku-20240307')).toBe(false);
  });

  it('every MODELS_SUPPORTING_THINKING id exists on the allowlist', () => {
    for (const id of MODELS_SUPPORTING_THINKING) {
      expect(byId.has(id), `${id} missing from CLAUDE_MODELS`).toBe(true);
    }
  });

  it('MODELS_SUPPORTING_THINKING agrees with the allowlist supportsThinking flag', () => {
    for (const id of MODELS_SUPPORTING_THINKING) {
      const entry = byId.get(id);
      expect(entry?.supportsThinking, `${id} not marked supportsThinking in CLAUDE_MODELS`).toBe(
        true
      );
    }
  });
});
