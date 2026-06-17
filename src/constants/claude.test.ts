import { describe, it, expect } from 'vitest';
import { DEFAULT_CLAUDE_MODEL, MODELS_SUPPORTING_THINKING } from './claude';
import { CLAUDE_MODELS } from '../../api/claude-models';

/**
 * Drift guard: the frontend's hand-maintained model constants must stay
 * consistent with api/claude-models.ts, which is BOTH the list the UI fetches
 * at runtime AND the server-side allowlist (api/lib/validate.ts). A model the
 * UI offers or defaults to but the proxy rejects is a silently broken feature,
 * so fail the build here instead of in production.
 */
describe('Claude model config consistency', () => {
  const byId = new Map(CLAUDE_MODELS.map((m) => [m.id, m]));

  it('DEFAULT_CLAUDE_MODEL is on the proxy allowlist', () => {
    expect(byId.has(DEFAULT_CLAUDE_MODEL)).toBe(true);
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
