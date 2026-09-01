import { describe, it, expect } from 'vitest';
import {
  AI_PROVIDERS,
  PROVIDER_ENV_VAR,
  isAiProvider,
  keyLast4,
  resolveCredentialCompany,
} from '../../../convex/lib/aiCredentialScope';

/**
 * This module decides which customer's Anthropic account gets billed.
 * The interesting cases are all about NOT guessing.
 */
describe('resolveCredentialCompany', () => {
  it('prefers the project the request is for', () => {
    expect(
      resolveCredentialCompany({
        projectCompanyId: 'companyA',
        activeCompanyId: 'companyB',
        memberCompanyIds: ['companyA', 'companyB'],
      }),
    ).toEqual({ companyId: 'companyA', reason: 'project' });
  });

  it('falls back to the active company when there is no project hint', () => {
    expect(
      resolveCredentialCompany({
        activeCompanyId: 'companyB',
        memberCompanyIds: ['companyA', 'companyB'],
      }),
    ).toEqual({ companyId: 'companyB', reason: 'active' });
  });

  it('uses the sole membership when there is exactly one', () => {
    expect(resolveCredentialCompany({ memberCompanyIds: ['companyA'] })).toEqual({
      companyId: 'companyA',
      reason: 'sole',
    });
  });

  it('does NOT guess when the user belongs to several companies', () => {
    // Guessing here bills an arbitrary tenant's Anthropic account.
    expect(
      resolveCredentialCompany({ memberCompanyIds: ['companyA', 'companyB'] }),
    ).toEqual({ companyId: null, reason: 'none' });
  });

  it('treats duplicate memberships as a single company', () => {
    expect(
      resolveCredentialCompany({ memberCompanyIds: ['companyA', 'companyA'] }),
    ).toEqual({ companyId: 'companyA', reason: 'sole' });
  });

  it('returns none for a user with no company at all (a fresh signup)', () => {
    expect(resolveCredentialCompany({ memberCompanyIds: [] })).toEqual({
      companyId: null,
      reason: 'none',
    });
  });

  it('is final, not a chain: a project company is never replaced by another company', () => {
    // The winner is used even though the caller cannot know yet whether that
    // company has a key on file. Missing key => install/env, never company B.
    const result = resolveCredentialCompany({
      projectCompanyId: 'companyA',
      activeCompanyId: 'companyB',
      memberCompanyIds: ['companyB'],
    });
    expect(result.companyId).toBe('companyA');
    expect(result.companyId).not.toBe('companyB');
  });

  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
  ])('ignores a %s project hint and moves on', (_label, hint) => {
    expect(
      resolveCredentialCompany({
        projectCompanyId: hint as string | null | undefined,
        memberCompanyIds: ['companyA'],
      }),
    ).toEqual({ companyId: 'companyA', reason: 'sole' });
  });

  it('trims surrounding whitespace on a chosen id', () => {
    expect(
      resolveCredentialCompany({ projectCompanyId: '  companyA  ', memberCompanyIds: [] }),
    ).toEqual({ companyId: 'companyA', reason: 'project' });
  });

  it('drops blank entries when counting memberships', () => {
    // A blank must not inflate the count and suppress the sole-company rule.
    expect(
      resolveCredentialCompany({ memberCompanyIds: ['companyA', '  ', ''] }),
    ).toEqual({ companyId: 'companyA', reason: 'sole' });
  });
});

describe('provider metadata', () => {
  it('maps every provider to an env var', () => {
    for (const provider of AI_PROVIDERS) {
      expect(PROVIDER_ENV_VAR[provider]).toMatch(/^[A-Z0-9_]+$/);
    }
    expect(Object.keys(PROVIDER_ENV_VAR).sort()).toEqual([...AI_PROVIDERS].sort());
  });

  it('names the env vars the existing call sites already read', () => {
    // Changing these silently detaches the fallback from api/claude.ts et al.
    expect(PROVIDER_ENV_VAR).toEqual({
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      voyage: 'VOYAGE_API_KEY',
    });
  });

  it.each([...AI_PROVIDERS])('recognises %s', (p) => {
    expect(isAiProvider(p)).toBe(true);
  });

  it.each([['gemini'], [''], [null], [undefined], [42]])('rejects %s', (v) => {
    expect(isAiProvider(v)).toBe(false);
  });
});

describe('keyLast4', () => {
  it('returns the last four characters', () => {
    expect(keyLast4('sk-ant-api03-abcdef1234')).toBe('1234');
  });

  it('ignores surrounding whitespace', () => {
    expect(keyLast4('  sk-ant-xyz9876  ')).toBe('9876');
  });

  it('never returns more than four characters, whatever the key length', () => {
    expect(keyLast4('a'.repeat(200)).length).toBe(4);
  });

  it('degrades rather than throwing on a short value', () => {
    expect(keyLast4('ab')).toBe('ab');
    expect(keyLast4('')).toBe('');
  });
});
