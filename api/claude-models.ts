/**
 * Returns a static list of available Claude models for UI selectors.
 * No API key or Anthropic API call required.
 */

export interface ClaudeModelEntry {
  id: string;
  display_name: string;
  created_at: string;
}

const CLAUDE_MODELS: ClaudeModelEntry[] = [
  { id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5', created_at: '2025-09-29' },
  { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', created_at: '2024-10-22' },
  { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku', created_at: '2024-10-22' },
  { id: 'claude-3-opus-20240229', display_name: 'Claude 3 Opus', created_at: '2024-02-29' },
  { id: 'claude-3-sonnet-20240229', display_name: 'Claude 3 Sonnet', created_at: '2024-02-29' },
  { id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', created_at: '2024-03-07' },
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ models: CLAUDE_MODELS });
}
