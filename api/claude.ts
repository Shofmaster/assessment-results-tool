import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
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
    const {
      model,
      max_tokens,
      messages,
      system,
      temperature,
      thinking,
      tools,
    } = req.body || {};

    if (!model || !max_tokens || !messages) {
      res.status(400).send('Missing required fields: model, max_tokens, messages');
      return;
    }

    const result = await client.messages.create({
      model,
      max_tokens,
      messages,
      system,
      temperature,
      thinking,
      tools,
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).send(error?.message || 'Claude request failed');
  }
}
