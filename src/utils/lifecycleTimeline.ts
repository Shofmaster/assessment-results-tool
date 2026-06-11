/**
 * Pure builder for the per-aircraft lifecycle timeline: merges logbook
 * entries, component install/removal events, discrepancies, and Form 337s
 * into one reverse-chronological stream grouped by year (Bluetail-style).
 * Undated events are never dropped — they collect in an "undated" group at
 * the end, same philosophy as the due-forecast `unforecastable` bucket.
 */

export type LifecycleEventKind =
  | 'inspection'
  | 'ad_compliance'
  | 'sb_compliance'
  | 'maintenance'
  | 'alteration'
  | 'component_installed'
  | 'component_removed'
  | 'discrepancy'
  | 'form_337';

export interface LifecycleEvent {
  /** ISO date (YYYY-MM-DD) or undefined when the source row has no date. */
  date?: string;
  kind: LifecycleEventKind;
  title: string;
  detail?: string;
  /** e.g. "1,160.0 TT" or "ATA 25" or signer. */
  badges: string[];
  table: 'logbookEntries' | 'aircraftComponents' | 'aircraftDiscrepancies' | 'form337Records';
  recordId: string;
  route: string;
}

export interface LifecycleYearGroup {
  /** Four-digit year, or 'undated'. */
  year: string;
  events: LifecycleEvent[];
}

// ── Input shapes (mirror convex/lifecycle.ts projections) ──────────────────

export interface TimelineEntryRow {
  recordId: string;
  entryDate?: string;
  entryType?: string;
  inspectionType?: string;
  ataChapter?: string;
  workPerformed?: string;
  totalTimeAtEntry?: number;
  signerName?: string;
  adReferences?: string[];
  sbReferences?: string[];
}

export interface TimelineComponentRow {
  recordId: string;
  description?: string;
  partNumber?: string;
  serialNumber?: string;
  position?: string;
  installDate?: string;
  removeDate?: string;
  status?: string;
  isLifeLimited?: boolean;
}

export interface TimelineDiscrepancyRow {
  recordId: string;
  description?: string;
  status?: string;
  category?: string;
  ataChapter?: string;
  discoveredAt?: string;
}

export interface TimelineForm337Row {
  recordId: string;
  title?: string;
  status?: string;
  createdAt?: string;
}

function dateOnly(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : undefined;
}

function entryKind(entryType: string | undefined): LifecycleEventKind {
  switch (entryType) {
    case 'inspection':
    case 'regulatory_check':
      return 'inspection';
    case 'ad_compliance':
      return 'ad_compliance';
    case 'sb_compliance':
      return 'sb_compliance';
    case 'alteration':
    case 'rebuilding':
      return 'alteration';
    default:
      return 'maintenance';
  }
}

function formatTT(n: number | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} TT`;
}

export function buildLifecycleTimeline(input: {
  entries: TimelineEntryRow[];
  components: TimelineComponentRow[];
  discrepancies: TimelineDiscrepancyRow[];
  form337s: TimelineForm337Row[];
}): LifecycleYearGroup[] {
  const events: LifecycleEvent[] = [];

  for (const e of input.entries) {
    const badges: string[] = [];
    const tt = formatTT(e.totalTimeAtEntry);
    if (tt) badges.push(tt);
    if (e.ataChapter) badges.push(`ATA ${e.ataChapter}`);
    if (e.signerName) badges.push(e.signerName);
    const refs = [...(e.adReferences ?? []), ...(e.sbReferences ?? [])];
    const kind = entryKind(e.entryType);
    events.push({
      date: dateOnly(e.entryDate),
      kind,
      title:
        (e.inspectionType ? `${e.inspectionType.replace(/_/g, ' ')} inspection` : '') ||
        (e.workPerformed || '').slice(0, 90) ||
        'Logbook entry',
      detail: refs.length > 0 ? refs.join(', ') : undefined,
      badges,
      table: 'logbookEntries',
      recordId: e.recordId,
      route: '/logbook',
    });
  }

  for (const c of input.components) {
    const name = c.description || c.partNumber || 'Component';
    const idBits = [c.partNumber, c.serialNumber ? `S/N ${c.serialNumber}` : null]
      .filter(Boolean)
      .join(' · ');
    if (c.installDate) {
      events.push({
        date: dateOnly(c.installDate),
        kind: 'component_installed',
        title: `Installed: ${name}${c.position ? ` (${c.position})` : ''}`,
        detail: idBits || undefined,
        badges: c.isLifeLimited ? ['life-limited'] : [],
        table: 'aircraftComponents',
        recordId: c.recordId,
        route: '/fleet',
      });
    }
    if (c.removeDate) {
      events.push({
        date: dateOnly(c.removeDate),
        kind: 'component_removed',
        title: `Removed: ${name}${c.position ? ` (${c.position})` : ''}`,
        detail: idBits || undefined,
        badges: c.status === 'scrapped' ? ['scrapped'] : [],
        table: 'aircraftComponents',
        recordId: c.recordId,
        route: '/fleet',
      });
    }
  }

  for (const d of input.discrepancies) {
    const badges: string[] = [];
    if (d.status) badges.push(d.status);
    if (d.category) badges.push(d.category);
    if (d.ataChapter) badges.push(`ATA ${d.ataChapter}`);
    events.push({
      date: dateOnly(d.discoveredAt),
      kind: 'discrepancy',
      title: (d.description || 'Discrepancy').slice(0, 90),
      badges,
      table: 'aircraftDiscrepancies',
      recordId: d.recordId,
      route: '/fleet',
    });
  }

  for (const f of input.form337s) {
    events.push({
      date: dateOnly(f.createdAt),
      kind: 'form_337',
      title: f.title || 'FAA Form 337',
      badges: f.status ? [f.status.replace(/_/g, ' ')] : [],
      table: 'form337Records',
      recordId: f.recordId,
      route: '/form-337',
    });
  }

  // Reverse-chronological; undated events sink to the end in stable order.
  const dated = events.filter((e) => e.date).sort((a, b) => (b.date! < a.date! ? -1 : b.date! > a.date! ? 1 : 0));
  const undated = events.filter((e) => !e.date);

  const groups: LifecycleYearGroup[] = [];
  for (const event of dated) {
    const year = event.date!.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.events.push(event);
    else groups.push({ year, events: [event] });
  }
  if (undated.length > 0) groups.push({ year: 'undated', events: undated });
  return groups;
}
