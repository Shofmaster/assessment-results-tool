import { describe, it, expect } from 'vitest';
import { resolveModel } from '../../services/llmConfig';
import { DEFAULT_CLAUDE_MODEL } from '../../constants/claude';

describe('resolveModel', () => {
  it('returns DEFAULT_CLAUDE_MODEL when no user settings', () => {
    expect(resolveModel('default', null)).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveModel('default', undefined)).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('returns user claudeModel for default feature', () => {
    const settings = { claudeModel: 'claude-opus-4-6' };
    expect(resolveModel('default', settings)).toBe('claude-opus-4-6');
  });

  it('returns user claudeModel for analysis feature', () => {
    const settings = { claudeModel: 'claude-opus-4-6' };
    expect(resolveModel('analysis', settings)).toBe('claude-opus-4-6');
  });

  it('returns auditSimModel when set for auditSim feature', () => {
    const settings = { claudeModel: 'claude-opus-4-6', auditSimModel: 'claude-sonnet-4-6' };
    expect(resolveModel('auditSim', settings)).toBe('claude-sonnet-4-6');
  });

  it('falls back to claudeModel when auditSimModel is not set', () => {
    const settings = { claudeModel: 'claude-opus-4-6' };
    expect(resolveModel('auditSim', settings)).toBe('claude-opus-4-6');
  });

  it('falls back to DEFAULT_CLAUDE_MODEL when both auditSimModel and claudeModel are unset', () => {
    expect(resolveModel('auditSim', {})).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('returns paperworkReviewModel when set', () => {
    const settings = { claudeModel: 'claude-opus-4-6', paperworkReviewModel: 'claude-haiku-4-5-20251001' };
    expect(resolveModel('paperworkReview', settings)).toBe('claude-haiku-4-5-20251001');
  });

  it('falls back to claudeModel when paperworkReviewModel is not set', () => {
    const settings = { claudeModel: 'claude-opus-4-6' };
    expect(resolveModel('paperworkReview', settings)).toBe('claude-opus-4-6');
  });

  it('falls back to DEFAULT_CLAUDE_MODEL for paperworkReview when nothing set', () => {
    expect(resolveModel('paperworkReview', {})).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('returns defaultModel for any unknown feature value', () => {
    const settings = { claudeModel: 'custom-model' };
    expect(resolveModel('default', settings)).toBe('custom-model');
  });
});
