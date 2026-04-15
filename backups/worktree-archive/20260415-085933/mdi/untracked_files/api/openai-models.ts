import OpenAI from 'openai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).send('Server is missing OPENAI_API_KEY');
    return;
  }

  try {
    const client = new OpenAI({ apiKey });
    const list = await client.models.list();

    const models = list.data
      .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
      .map((m) => ({
        id: m.id,
        display_name: m.id,
        created_at: m.created ? new Date(m.created * 1000).toISOString() : '',
      }))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    res.status(200).json({ models });
  } catch (error: any) {
    const msg = error?.message || 'Failed to list OpenAI models';
    res.status(500).send(msg);
  }
}
