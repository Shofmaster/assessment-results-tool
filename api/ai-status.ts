/**
 * GET /api/ai-status
 * Returns which AI API keys are set on the server (no secrets exposed).
 * Open this in the browser to see why AI might be failing.
 */
export default async function handler(_req: any, res: any) {
  if (_req.method !== 'GET') {
    res.status(405).setHeader('Content-Type', 'application/json').send(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const anthropic = !!process.env.ANTHROPIC_API_KEY?.trim();
  const openai = !!process.env.OPENAI_API_KEY?.trim();

  res.status(200).setHeader('Content-Type', 'application/json').send(
    JSON.stringify(
      {
        ok: anthropic || openai,
        anthropic: anthropic ? 'set' : 'missing',
        openai: openai ? 'set' : 'missing',
        hint: !anthropic && !openai
          ? 'Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel → Project → Settings → Environment Variables (Production), then redeploy.'
          : !anthropic
            ? 'Using OpenAI only. To use Claude, add ANTHROPIC_API_KEY in Vercel env and redeploy.'
            : !openai
              ? 'Using Claude only. To use OpenAI models, add OPENAI_API_KEY in Vercel env and redeploy.'
              : 'Both providers configured.',
      },
      null,
      2
    )
  );
}
