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

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
