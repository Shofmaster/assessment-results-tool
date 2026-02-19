export type ClaudeMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ClaudeMessageParams {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user' | 'assistant'; content: string | ClaudeMessageContent[] }>;
  system?: string;
  temperature?: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
  tools?: Array<{ type: string; name: string }>;
}

export interface ClaudeMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function createClaudeMessage(params: ClaudeMessageParams): Promise<ClaudeMessageResponse> {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const detail = await safeReadText(response);
    throw new Error(detail || `Claude request failed (${response.status})`);
  }

  return response.json();
}

export interface ClaudeMessageStreamCallbacks {
  onText?: (text: string) => void;
}

/**
 * Call Claude with streaming (POST /api/claude?stream=true).
 * Invokes onText for each content_block_delta text chunk; resolves with the final message when done.
 */
export async function createClaudeMessageStream(
  params: ClaudeMessageParams,
  callbacks: ClaudeMessageStreamCallbacks = {}
): Promise<ClaudeMessageResponse> {
  const { onText } = callbacks;
  const response = await fetch('/api/claude?stream=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const detail = await safeReadText(response);
    throw new Error(detail || `Claude stream request failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response has no body');
  }
  const bodyReader = reader;

  const decoder = new TextDecoder();
  let buffer = '';

  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(err?: Error, result?: ClaudeMessageResponse) {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else if (result !== undefined) resolve(result);
    }

    function processLine(line: string) {
      if (!line.startsWith('data: ')) return;
      const payload = line.slice(6);
      if (payload === '[DONE]' || payload.trim() === '') return;
      try {
        const event = JSON.parse(payload) as {
          type: string;
          delta?: { type?: string; text?: string };
          message?: ClaudeMessageResponse;
          error?: string;
        };
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
          onText?.(event.delta.text);
        }
        if (event.type === 'done' && event.message) {
          finish(undefined, event.message as ClaudeMessageResponse);
        }
        if (event.type === 'error') {
          finish(new Error(event.error || 'Stream error'));
        }
      } catch {
        // ignore malformed lines
      }
    }

    function pump(): Promise<void> {
      return bodyReader.read().then(({ done, value }) => {
        if (done) {
          buffer.split('\n').forEach(processLine);
          if (!settled) finish(new Error('Stream ended without done event'));
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        parts.forEach((chunk) => {
          chunk.split('\n').forEach(processLine);
        });
        return pump();
      });
    }

    pump().catch((err) => finish(err));
  });
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
