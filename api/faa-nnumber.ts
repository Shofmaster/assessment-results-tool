/**
 * GET /api/faa-nnumber?n=N12345
 * Proxies FAA Civil Aircraft Registry N-number inquiry (server-side; avoids browser CORS).
 */

import { lookupFaaRegistryByNNumber, parseTailForFaaQuery } from '../src/services/faaRegistryLookup';

export default async function handler(req: { method?: string; query?: { n?: string } }, res: {
  status: (c: number) => { json: (b: unknown) => void };
}) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const raw = typeof req.query?.n === 'string' ? req.query.n : '';
  if (!parseTailForFaaQuery(raw)) {
    res.status(400).json({ error: 'Provide a valid N-number (e.g. N12345 or 12345).' });
    return;
  }

  try {
    const data = await lookupFaaRegistryByNNumber(raw);
    if (!data) {
      res.status(404).json({ error: 'No aircraft found for that N-number in the FAA registry.' });
      return;
    }
    res.status(200).json({ aircraft: data, fetchedAt: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Lookup failed';
    res.status(502).json({ error: message });
  }
}
