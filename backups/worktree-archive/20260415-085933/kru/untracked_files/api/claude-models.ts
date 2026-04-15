import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).send('Server is missing ANTHROPIC_API_KEY');
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const allModels: Array<{ id: string; display_name: string; created_at: string }> = [];
    let afterId: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const page: any = await client.models.list({
        limit: 100,
        ...(afterId ? { after_id: afterId } : {}),
      });

      for (const model of page.data) {
        allModels.push({
          id: model.id,
          display_name: model.display_name,
          created_at: model.created_at,
        });
      }

      hasMore = page.has_more;
      afterId = page.last_id;
    }

    // Return newest first (API default, but ensure it)
    allModels.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    res.status(200).json({ models: allModels });
  } catch (error: any) {
    const msg = error?.message || 'Failed to list models';
    res.status(500).send(msg);
  }
}
