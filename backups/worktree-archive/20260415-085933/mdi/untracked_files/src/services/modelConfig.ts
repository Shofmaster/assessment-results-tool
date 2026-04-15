export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
export const DEFAULT_PROVIDER = 'anthropic';

export type LLMProvider = 'anthropic' | 'openai';

let currentProvider: LLMProvider = DEFAULT_PROVIDER;
let currentModel: string = DEFAULT_MODEL;

export function getProvider(): LLMProvider {
  return currentProvider;
}

export function setProvider(provider: LLMProvider): void {
  if (provider === 'anthropic' || provider === 'openai') {
    currentProvider = provider;
  }
}

export function getModel(): string {
  return currentModel;
}

export function setModel(model: string): void {
  if (model) {
    currentModel = model;
  }
}

/** @deprecated Use getModel() instead. Returns current model for the selected provider. */
export function getClaudeModel(): string {
  return getModel();
}

/** @deprecated Use setModel() instead. */
export function setClaudeModel(model: string): void {
  setModel(model);
}
