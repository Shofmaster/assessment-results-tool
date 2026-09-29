/**
 * Returns the Claude models the UI may offer, live from Anthropic's Models API
 * (cached server-side) with a static fallback. See _lib/modelCatalog.ts.
 */
import { getClaudeModelCatalog, FALLBACK_CLAUDE_MODELS } from './_lib/modelCatalog.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { projectHintFromRequest, resolveAiKey } from './_lib/aiCredentials.js';

export type { ClaudeModelEntry } from './_lib/modelCatalog.js';

/** The static fallback list; also what the frontend drift test checks against. */
export const CLAUDE_MODELS = FALLBACK_CLAUDE_MODELS;

/**
 * Key used to list models. Listing is free, so this runtime's own key is used
 * when present; a BYOK-only deployment falls back to the signed-in caller's key.
 */
async function listingKey(req: any): Promise<string | undefined> {
  if ((process.env.ANTHROPIC_API_KEY || '').trim()) return undefined;
  if (!req?.headers?.authorization) return undefined;
  try {
    const auth = await verifyRequestAuth(req);
    if (!auth.ok) return undefined;
    const resolved = await resolveAiKey('anthropic', {
      clerkToken: auth.token as string,
      userId: auth.userId as string,
      projectId: projectHintFromRequest(req),
    });
    return resolved.apiKey;
  } catch {
    return undefined;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const catalog = await getClaudeModelCatalog(await listingKey(req));
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ models: catalog.models, source: catalog.source });
}
