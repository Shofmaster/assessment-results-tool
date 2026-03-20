/**
 * FAA Civil Aircraft Registry — N-number inquiry (HTML results page).
 * https://registry.faa.gov/AircraftInquiry/Search/NNumberResult
 */

export type FaaRegistryAircraft = {
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  operator?: string;
  year?: number;
};

const FAA_NNUMBER_URL = 'https://registry.faa.gov/AircraftInquiry/Search/NNumberResult';

/** Normalize user input to "NXXXX" display form and FAA query text (no leading N, as used by the inquiry form). */
export function parseTailForFaaQuery(raw: string): { displayTail: string; query: string } | null {
  const compact = raw.trim().replace(/\s+/g, '').toUpperCase();
  if (!compact) return null;
  const body = compact.startsWith('N') ? compact.slice(1) : compact;
  if (!/^[A-Z0-9]{1,6}$/i.test(body)) return null;
  return { displayTail: `N${body}`, query: body };
}

function extractDataLabel(html: string, label: string): string | undefined {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<td[^>]*data-label="${esc}"[^>]*>([^<]*)</td>`, 'i');
  const m = html.match(re);
  if (!m) return undefined;
  return m[1].replace(/\s+/g, ' ').trim() || undefined;
}

function extractRegisteredOwnerName(html: string): string | undefined {
  const parts = html.split(/<caption[^>]*>\s*Registered Owner\s*<\/caption>/i);
  if (parts.length < 2) return undefined;
  const section = parts[1];
  const m = section.match(/<td[^>]*data-label="Name"[^>]*>([^<]*)<\/td>/i);
  if (!m) return undefined;
  return m[1].replace(/\s+/g, ' ').trim() || undefined;
}

/** Parse FAA N-number result HTML into structured fields. Returns null if not found or not parseable. */
export function parseFaaNNumberHtml(html: string, displayTail: string): FaaRegistryAircraft | null {
  if (!html.includes('Manufacturer Name')) {
    return null;
  }

  const make = extractDataLabel(html, 'Manufacturer Name');
  const model = extractDataLabel(html, 'Model');
  const serial = extractDataLabel(html, 'Serial Number');
  const yearRaw = extractDataLabel(html, 'Mfr Year');
  const operator = extractRegisteredOwnerName(html) ?? extractDataLabel(html, 'Name');

  let year: number | undefined;
  if (yearRaw) {
    const n = parseInt(yearRaw, 10);
    if (!Number.isNaN(n) && n >= 1900 && n <= 2100) year = n;
  }

  return {
    tailNumber: displayTail,
    make,
    model,
    serial,
    operator,
    year,
  };
}

export async function lookupFaaRegistryByNNumber(tailInput: string): Promise<FaaRegistryAircraft | null> {
  const parsed = parseTailForFaaQuery(tailInput);
  if (!parsed) return null;

  const url = `${FAA_NNUMBER_URL}?nNumberTxt=${encodeURIComponent(parsed.query)}`;
  const resp = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'AviationAssessmentApp/1.0 (FAA registry lookup)',
    },
  });

  if (!resp.ok) return null;
  const html = await resp.text();
  return parseFaaNNumberHtml(html, parsed.displayTail);
}

/** Browser: calls same-origin `/api/faa-nnumber` (Vercel or Vite dev middleware). */
export async function fetchFaaRegistryViaApi(tailInput: string, signal?: AbortSignal): Promise<FaaRegistryAircraft | null> {
  const parsed = parseTailForFaaQuery(tailInput);
  if (!parsed) return null;
  const res = await fetch(`/api/faa-nnumber?${new URLSearchParams({ n: tailInput.trim() })}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) {
    let msg = `Registry lookup failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { aircraft: FaaRegistryAircraft };
  return data.aircraft ?? null;
}
