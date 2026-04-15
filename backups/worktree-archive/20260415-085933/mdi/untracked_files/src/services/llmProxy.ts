/**
 * Provider-agnostic LLM client: POSTs to /api/chat with provider + model from config,
 * returns normalized { content } so consumers can keep using response.content.
 */

import { getProvider, getModel } from './modelConfig';

export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string };

export interface CreateMessageParams {
  model?: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | LLMContentBlock[];
  }>;
  system?: string;
  temperature?: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
  tools?: Array<{ type: string; name: string }>;
}

export interface CreateMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

const MAX_CLIENT_RETRIES = 2;
const CLIENT_RETRY_DELAY_MS = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** Infer provider from model ID so we don't send a Claude model to OpenAI (or vice versa). */
function inferProviderFromModel(model: string): 'anthropic' | 'openai' {
  const id = model.toLowerCase();
  if (id.startsWith('claude')) return 'anthropic';
  if (id.startsWith('gpt-') || id.startsWith('o1-') || id.startsWith('o3-')) return 'openai';
  return getProvider();
}

export async function createMessage(params: CreateMessageParams): Promise<CreateMessageResponse> {
  const model = params.model ?? getModel();
  const provider = inferProviderFromModel(model);

  const body = {
    provider,
    model,
    messages: params.messages,
    system: params.system,
    max_tokens: params.max_tokens,
    temperature: params.temperature,
    thinking: provider === 'anthropic' ? params.thinking : undefined,
    tools: provider === 'anthropic' ? params.tools : undefined,
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_CLIENT_RETRIES; attempt++) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return response.json();
    }

    const detail = await safeReadText(response);
    lastError = new Error(detail || `Chat request failed (${response.status})`);

    if (response.status === 429 && attempt < MAX_CLIENT_RETRIES) {
      await sleep(CLIENT_RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    throw lastError;
  }
  throw lastError ?? new Error('Chat request failed');
}
