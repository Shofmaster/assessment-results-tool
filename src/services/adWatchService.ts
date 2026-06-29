/**
 * AD/SB watch discovery: Claude + web_search (same pattern as
 * revisionChecker / kbCurrencyChecker) looks for recent Airworthiness
 * Directives applicable to an aircraft's make/model, returning structured
 * findings for convex/adWatch.upsertFindings to store and cross-reference.
 *
 * Advisory by design: results say "may apply — review", never "applies".
 */

import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import { buildAdSearchPrompt, parseAdFindings } from '../../convex/_adWatchShared';
import type { AdWatchFindingDraft } from '../../convex/_adWatchShared';

// Prompt + parser are shared with the server-side scheduled path
// (convex/adWatchActions.ts) via convex/_adWatchShared.ts — single source of
// truth. Re-export the draft type so existing importers stay stable.
export type { AdWatchFindingDraft };
export { parseAdFindings };

export interface AdWatchAircraft {
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  year?: number;
}

export async function checkAircraftForAds(
  aircraft: AdWatchAircraft,
  options?: { model?: string; lookbackMonths?: number },
): Promise<AdWatchFindingDraft[]> {
  const prompt = buildAdSearchPrompt(aircraft, options?.lookbackMonths ?? 24);
  if (!prompt) return [];

  const message = await createClaudeMessage({
    model: options?.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content
    .filter((b): b is { type: string; text?: string } => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n');
  return parseAdFindings(responseText);
}
