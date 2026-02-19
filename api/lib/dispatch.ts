/**
 * Shared LLM dispatcher: runs the appropriate provider (Anthropic / OpenAI) and
 * returns a normalized response shape { content: Array<{ type: string; text?: string }> }.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const MIN_DELAY_MS = 2000;
const MAX_RETRIES = 3;

let lastAnthropicRequestTime = 0;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('tokens per minute') ||
    msg.includes('overloaded')
  );
}

export type LLMProvider = 'anthropic' | 'openai';

export type NormalizedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string };

export interface NormalizedChatBody {
  provider: LLMProvider;
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | NormalizedContentBlock[];
  }>;
  system?: string;
  max_tokens: number;
  temperature?: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
  tools?: Array<{ type: string; name: string }>;
}

export interface NormalizedChatResponse {
  content: Array<{ type: string; text?: string }>;
}

function normalizeAnthropicResponse(result: { content: Array<{ type: string; text?: string }> }): NormalizedChatResponse {
  return { content: result.content };
}

const ANTHROPIC_IMAGE_TYPES = new Set<string>(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function toAnthropicContent(
  content: string | NormalizedContentBlock[]
): string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: AnthropicImageMediaType; data: string } }> {
  if (typeof content === 'string') return content;
  return content.map((block) => {
    if (block.type === 'text') return { type: 'text' as const, text: block.text };
    const mediaType: AnthropicImageMediaType = ANTHROPIC_IMAGE_TYPES.has(block.media_type) ? (block.media_type as AnthropicImageMediaType) : 'image/png';
    return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: block.data } };
  });
}

async function runAnthropic(body: NormalizedChatBody): Promise<NormalizedChatResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Server is missing ANTHROPIC_API_KEY');
  }
  const client = new Anthropic({ apiKey });
  const { model, messages, system, max_tokens, temperature, thinking, tools } = body;
  if (!model || !max_tokens || !messages) {
    throw new Error('Missing required fields: model, max_tokens, messages');
  }

  const anthropicMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: toAnthropicContent(m.content),
  }));

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const now = Date.now();
      const elapsed = now - lastAnthropicRequestTime;
      if (elapsed < MIN_DELAY_MS) {
        await sleep(MIN_DELAY_MS - elapsed);
      }
      lastAnthropicRequestTime = Date.now();

      const result = await client.messages.create({
        model,
        max_tokens,
        messages: anthropicMessages as Anthropic.MessageParam[],
        system,
        temperature,
        thinking: body.provider === 'anthropic' ? thinking : undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: body.provider === 'anthropic' && tools?.length ? (tools as any) : undefined,
      });

      return normalizeAnthropicResponse(result);
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRateLimitError(error)) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function runOpenai(body: NormalizedChatBody): Promise<NormalizedChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Server is missing OPENAI_API_KEY');
  }
  const client = new OpenAI({ apiKey });
  const { model, messages, system, max_tokens, temperature } = body;
  if (!model || !max_tokens || !messages) {
    throw new Error('Missing required fields: model, max_tokens, messages');
  }

  function toOpenaiContent(
    content: string | NormalizedContentBlock[]
  ): string | OpenAI.Chat.ChatCompletionContentPart[] {
    if (typeof content === 'string') return content;
    return content.map((block) => {
      if (block.type === 'text') return { type: 'text' as const, text: block.text };
      return {
        type: 'image_url' as const,
        image_url: { url: `data:${block.media_type};base64,${block.data}` },
      };
    });
  }

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = system
    ? ([
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: toOpenaiContent(m.content) } as const)),
      ] as OpenAI.Chat.ChatCompletionMessageParam[])
    : (messages.map((m) => ({ role: m.role, content: toOpenaiContent(m.content) })) as OpenAI.Chat.ChatCompletionMessageParam[]);

  const completion = await client.chat.completions.create({
    model,
    max_tokens,
    messages: openaiMessages,
    temperature: temperature ?? 0.7,
  });

  const text = completion.choices[0]?.message?.content ?? '';
  return { content: [{ type: 'text', text }] };
}

export async function handleChat(provider: LLMProvider, body: Omit<NormalizedChatBody, 'provider'>): Promise<NormalizedChatResponse> {
  const fullBody: NormalizedChatBody = { ...body, provider };
  if (provider === 'anthropic') {
    return runAnthropic(fullBody);
  }
  if (provider === 'openai') {
    return runOpenai(fullBody);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}
