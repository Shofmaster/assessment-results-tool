/**
 * Public iCal feed for the due-list forecast.
 *
 * GET /api/due-ical?token=<hex>  → text/calendar with one all-day VEVENT per
 * coming-due item (overdue included). Calendar clients cannot send Clerk
 * tokens, so this is a capability URL: the random 128-bit token (stored in
 * Convex `calendarFeedTokens`, revocable via regenerate) IS the authorization.
 * The feed exposes titles, tail numbers, and dates only.
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { forecastProject, type DueForecastInput } from '../src/utils/dueForecast.js';
import { buildDueListIcs } from '../src/utils/icalFeed.js';
import { applyRateLimit } from './lib/rateLimit.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  // Calendar clients poll every ~15 min; 10/min/IP leaves headroom while
  // making token brute-forcing (2^128 space) and feed scraping impractical.
  if (applyRateLimit(req, res, 10)) return;

  const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  if (!/^[0-9a-f]{32}$/.test(token)) {
    res.status(400).send('Missing or malformed token');
    return;
  }

  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    res.status(503).send('Convex is not configured on the server.');
    return;
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const sources: any = await client.query(api.calendarFeed.feedSourcesByToken, { token });
    if (!sources) {
      // Unknown and revoked tokens are indistinguishable on purpose.
      res.status(404).send('Unknown or revoked feed token');
      return;
    }

    const inputs: DueForecastInput[] = [
      ...(sources.scheduleItems as DueForecastInput[]),
      ...(sources.recurringEntries as DueForecastInput[]),
      ...(sources.components as DueForecastInput[]),
    ];
    const summary = forecastProject(sources.aircraft, inputs, new Date());
    const ics = buildDueListIcs(summary.items, { now: new Date() });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="aerogap-due-list.ics"');
    // Calendar clients poll; let intermediaries cache briefly.
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.status(200).send(ics);
  } catch (error: any) {
    console.error('[api/due-ical]', error?.message || error);
    res.status(500).send('Could not build the calendar feed.');
  }
}
