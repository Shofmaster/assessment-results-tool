/**
 * Default LLM provider and model for the chat API.
 * Optional env: VITE_LLM_PROVIDER, VITE_LLM_MODEL (build-time).
 */

export type LLMProvider = 'anthropic' | 'openai';

const DEFAULT_PROVIDER: LLMProvider = 'anthropic';
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

export function getProvider(): LLMProvider {
  const v = import.meta.env.VITE_LLM_PROVIDER;
  if (v === 'anthropic' || v === 'openai') return v;
  return DEFAULT_PROVIDER;
}

export function getModel(): string {
  const v = import.meta.env.VITE_LLM_MODEL;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return DEFAULT_MODEL;
}
