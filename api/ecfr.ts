/**
 * eCFR proxy — fetches live 14 CFR section or part text from ecfr.gov.
 * Server-side so CORS is never an issue.
 *
 * GET /api/ecfr?section=145.211   → text for that section
 * GET /api/ecfr?part=145          → full part text (truncated to 20 000 chars)
 */

/** Maps CFR part numbers to their Title 14 hierarchy path segments. */
const PART_PATHS: Record<string, string> = {
  '43':  'chapter-I/subchapter-C/part-43',
  '91':  'chapter-I/subchapter-F/part-91',
  '119': 'chapter-I/subchapter-G/part-119',
  '120': 'chapter-I/subchapter-G/part-120',
  '121': 'chapter-I/subchapter-G/part-121',
  '135': 'chapter-I/subchapter-G/part-135',
  '145': 'chapter-I/subchapter-H/part-145',
};

const ECFR_BASE = 'https://www.ecfr.gov/api/versioner/v1/full/current/title-14';
const MAX_CHARS = 20_000;

/** Strip XML/HTML tags and collapse whitespace to readable plain text. */
function xmlToText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')      // remove all tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')       // collapse spaces/tabs
    .replace(/\n{3,}/g, '\n\n')    // collapse blank lines
    .trim();
}

/** Parse a citation like "145.211" → { part: "145", section: "145.211" } */
function parseCitation(citation: string): { part: string; section?: string } | null {
  const clean = citation.trim().replace(/^§\s*/, '').replace(/^14\s*CFR\s*/i, '');
  // Match "145.211" or "43.9" or just "145"
  const m = clean.match(/^(\d+)(?:\.(\S+))?$/);
  if (!m) return null;
  const part = m[1];
  const sub = m[2];
  return { part, section: sub ? `${part}.${sub}` : undefined };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sectionParam: string | undefined = req.query?.section;
  const partParam: string | undefined = req.query?.part;

  // Determine what we're looking up
  let partNumber: string;
  let sectionNumber: string | undefined;

  if (sectionParam) {
    const parsed = parseCitation(sectionParam);
    if (!parsed) {
      res.status(400).json({ error: `Cannot parse citation: ${sectionParam}` });
      return;
    }
    partNumber = parsed.part;
    sectionNumber = parsed.section ?? sectionParam;
  } else if (partParam) {
    const parsed = parseCitation(partParam);
    if (!parsed) {
      res.status(400).json({ error: `Cannot parse part: ${partParam}` });
      return;
    }
    partNumber = parsed.part;
  } else {
    res.status(400).json({ error: 'Provide ?section=145.211 or ?part=145' });
    return;
  }

  const partPath = PART_PATHS[partNumber];
  if (!partPath) {
    res.status(400).json({ error: `Part ${partNumber} not supported. Supported: ${Object.keys(PART_PATHS).join(', ')}` });
    return;
  }

  // Build eCFR URL — section-level if we have one, otherwise full part
  let url: string;
  let citation: string;

  if (sectionNumber) {
    url = `${ECFR_BASE}/${partPath}/section-${sectionNumber}.xml`;
    citation = `14 CFR §${sectionNumber}`;
  } else {
    url = `${ECFR_BASE}/${partPath}.xml`;
    citation = `14 CFR Part ${partNumber}`;
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'AviationAuditApp/1.0 (ecfr lookup; contact: admin)',
        Accept: 'application/xml, text/xml, */*',
      },
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: `eCFR returned ${upstream.status} for ${citation}`,
        citation,
      });
      return;
    }

    const xml = await upstream.text();
    let text = xmlToText(xml);

    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + `\n\n[...truncated — full text at ecfr.gov]`;
    }

    res.status(200).json({
      text,
      citation,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(502).json({
      error: `Failed to reach eCFR: ${err?.message ?? 'network error'}`,
      citation,
    });
  }
}
