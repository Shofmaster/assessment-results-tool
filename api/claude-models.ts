/**
 * Returns a static list of available Claude models for UI selectors.
 * No API key or Anthropic API call required.
 */

export interface ClaudeModelEntry {
  id: string;
  display_name: string;
  created_at: string;
  /** Extended thinking (budget_tokens) is Claude-only and supported on select models. */
  supportsThinking: boolean;
}

// Latest first; IDs from https://docs.anthropic.com/en/docs/models-overview
// supportsThinking from https://docs.anthropic.com/en/docs/about-claude/models/extended-thinking-models
const CLAUDE_MODELS: ClaudeModelEntry[] = [
  { id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6', created_at: '2026-02-01', supportsThinking: true },
  { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', created_at: '2026-02-01', supportsThinking: true },
  { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5', created_at: '2025-10-01', supportsThinking: true },
  { id: 'claude-sonnet-4-5-20250929', display_name: 'Claude Sonnet 4.5', created_at: '2025-09-29', supportsThinking: true },
  { id: 'claude-opus-4-5-20251101', display_name: 'Claude Opus 4.5', created_at: '2025-11-01', supportsThinking: true },
  { id: 'claude-opus-4-1-20250805', display_name: 'Claude Opus 4.1', created_at: '2025-08-05', supportsThinking: true },
  { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4', created_at: '2025-05-14', supportsThinking: true },
  { id: 'claude-3-7-sonnet-20250219', display_name: 'Claude 3.7 Sonnet', created_at: '2025-02-19', supportsThinking: true },
  { id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4', created_at: '2025-05-14', supportsThinking: true },
  { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', created_at: '2024-10-22', supportsThinking: false },
  { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku', created_at: '2024-10-22', supportsThinking: false },
  { id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', created_at: '2024-03-07', supportsThinking: false },
];

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ models: CLAUDE_MODELS });
}
