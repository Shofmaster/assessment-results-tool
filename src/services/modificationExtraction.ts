/**
 * AI extraction of structured aircraft-modification records from uploaded
 * documents (STC certificates, Form 337s, field approvals, AFM supplements,
 * ICA documents). Feeds the review step of ModExtractionModal — nothing here
 * persists anything.
 */
import { createClaudeMessage } from './claudeProxy';
import {
  extractBalancedJsonContaining,
  extractJsonFromMarkdown,
  reportParseFailure,
} from '../utils/jsonParsing';
import {
  ALL_MOD_EDGE_KINDS,
  ALL_MOD_TYPES,
  type ExtractedModification,
  type ModEdgeKind,
  type ModExtractionResult,
  type ModType,
  type ProposedEdge,
  type ProposedEdgeRef,
} from '../types/aircraftModification';

export const MAX_CHARS_PER_DOC = 18000;
export const MAX_DOCS_PER_BATCH = 5;

export interface ExtractionAircraftContext {
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
}

export interface ExistingModSummary {
  id: string;
  modType: string;
  title: string;
  approvalRef?: string;
  ataChapters?: string[];
}

export function buildModExtractionSystemPrompt(): string {
  return `You are an aviation maintenance records expert specializing in aircraft alterations and modifications for US-registered aircraft.

You will receive one or more documents (STC certificates, FAA Form 337s, field approvals, DER 8110-3 forms, AFM supplements, ICA documents, W&B revisions) plus the aircraft's identity and a summary of modifications already recorded for it. Extract one structured record per DISTINCT modification evidenced in the documents.

APPROVAL BASIS SEMANTICS (use to classify modType):
- "stc": Supplemental Type Certificate — FAA-approved major design change. Approval reference is the STC number (e.g. SA01234NM, SR09876SE). STCs commonly carry ICAs (14 CFR 21.50) and an AFM Supplement (AFMS).
- "field_approval_337": Major repair/alteration on FAA Form 337 with FSDO field approval in Block 3 (data approved by an ASI's signature). Reference the 337 date and approving office.
- "der_8110_3": Alteration whose approved data is an FAA Form 8110-3 issued by a Designated Engineering Representative.
- "minor_alteration": Minor alteration documented by logbook entry only, using acceptable data (AC 43.13-1B/2B etc.).
- "amoc": Alternative Method of Compliance with an Airworthiness Directive.
- "other": Anything that does not fit the above.

EXTRACTION RULES:
- NEVER invent data. Fill a field only when the documents evidence it. Never fabricate STC numbers, intervals, or limitations.
- title: short descriptive name of the modification (e.g. "Garmin GTN 750Xi installation").
- ataChapters: 2-digit ATA chapter strings, most-affected first (e.g. ["34","23"]).
- icaRequirements: each continued-airworthiness task with its interval (free text) and document reference.
- afmSupplement: { required, reference, limitations[] } — limitations verbatim where practical.
- weightBalance: { weightChangeLbs (negative = removed weight), arm, momentChange, notes }.
- placards: required placard text VERBATIM.
- recurringInspections: repetitive inspections with numeric interval + intervalUnit ("hours" | "cycles" | "calendar_months" | "calendar_days").
- status: "installed" unless the documents show removal or supersedure.
- confidence: 0-1 — how certain you are this record is accurate and complete from the documents given.
- If a document describes a modification already in the EXISTING MODIFICATIONS list, still emit it (the app deduplicates), but note it in warnings.

RELATIONSHIP EDGES (kinds):
- "depends_on": the FROM mod requires the TO mod to be installed (e.g. an autopilot STC requiring a specific navigator STC).
- "conflicts_with": mods with incompatible requirements, overlapping structural areas, or mutually exclusive limitations.
- "interfaces_with": mods that electrically/functionally interconnect.
- "shared_system": mods touching the same system/ATA chapter (set ataChapter).
Propose edges among the newly extracted mods AND between new mods and EXISTING modifications (reference existing ones by their "id"). Only propose an edge when the documents (or unambiguous aviation knowledge about those exact products) support it — set "note" explaining why.

OUTPUT: exactly one fenced JSON block:
\`\`\`json
{
  "modifications": [
    {
      "modType": "stc",
      "title": "...",
      "approvalRef": "...",
      "holder": "...",
      "dateInstalled": "YYYY-MM-DD",
      "description": "...",
      "ataChapters": ["34"],
      "affectedSystems": ["..."],
      "status": "installed",
      "icaRequirements": [{ "description": "...", "interval": "...", "reference": "..." }],
      "afmSupplement": { "required": true, "reference": "...", "limitations": ["..."] },
      "weightBalance": { "weightChangeLbs": 12.4, "arm": 130.2, "momentChange": 1614.5, "notes": "..." },
      "placards": ["..."],
      "electricalLoadNotes": "...",
      "recurringInspections": [{ "description": "...", "interval": 12, "intervalUnit": "calendar_months", "reference": "..." }],
      "confidence": 0.9,
      "sourceDocumentNames": ["exact document name(s) this record came from"]
    }
  ],
  "edges": [
    { "from": { "newIndex": 0 }, "to": { "existingModId": "..." }, "kind": "depends_on", "note": "..." }
  ],
  "warnings": ["..."]
}
\`\`\`
Omit any field you cannot evidence rather than emitting null or empty strings.`;
}

interface RawExtractionPayload {
  modifications?: unknown;
  edges?: unknown;
  warnings?: unknown;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  return items.length ? items.map((s) => s.trim()) : undefined;
}

function normalizeModType(raw: unknown): ModType {
  const value = typeof raw === 'string' ? (raw.toLowerCase() as ModType) : 'other';
  return (ALL_MOD_TYPES as string[]).includes(value) ? value : 'other';
}

function normalizeModification(
  raw: unknown,
  docNameToId: Map<string, string>,
): ExtractedModification | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const title = asOptionalString(record.title);
  if (!title) return null;

  const icaRequirements = Array.isArray(record.icaRequirements)
    ? record.icaRequirements
        .map((i) => {
          if (!i || typeof i !== 'object') return null;
          const row = i as Record<string, unknown>;
          const description = asOptionalString(row.description);
          if (!description) return null;
          return {
            description,
            interval: asOptionalString(row.interval),
            reference: asOptionalString(row.reference),
          };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null)
    : undefined;

  const recurringInspections = Array.isArray(record.recurringInspections)
    ? record.recurringInspections
        .map((i) => {
          if (!i || typeof i !== 'object') return null;
          const row = i as Record<string, unknown>;
          const description = asOptionalString(row.description);
          if (!description) return null;
          return {
            description,
            interval: asOptionalNumber(row.interval),
            intervalUnit: asOptionalString(row.intervalUnit),
            reference: asOptionalString(row.reference),
          };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null)
    : undefined;

  let afmSupplement: ExtractedModification['afmSupplement'];
  if (record.afmSupplement && typeof record.afmSupplement === 'object') {
    const afms = record.afmSupplement as Record<string, unknown>;
    afmSupplement = {
      required: Boolean(afms.required),
      reference: asOptionalString(afms.reference),
      limitations: asStringArray(afms.limitations),
    };
  }

  let weightBalance: ExtractedModification['weightBalance'];
  if (record.weightBalance && typeof record.weightBalance === 'object') {
    const wb = record.weightBalance as Record<string, unknown>;
    const parsed = {
      weightChangeLbs: asOptionalNumber(wb.weightChangeLbs),
      arm: asOptionalNumber(wb.arm),
      momentChange: asOptionalNumber(wb.momentChange),
      notes: asOptionalString(wb.notes),
    };
    if (Object.values(parsed).some((v) => v !== undefined)) weightBalance = parsed;
  }

  const sourceNames = asStringArray(record.sourceDocumentNames) ?? [];
  const sourceDocumentIds = sourceNames
    .map((name) => docNameToId.get(name))
    .filter((id): id is string => Boolean(id));

  const statusRaw = asOptionalString(record.status)?.toLowerCase();
  const status =
    statusRaw === 'removed' || statusRaw === 'superseded' ? statusRaw : 'installed';

  return {
    modType: normalizeModType(record.modType),
    title,
    approvalRef: asOptionalString(record.approvalRef),
    holder: asOptionalString(record.holder),
    dateInstalled: asOptionalString(record.dateInstalled),
    description: asOptionalString(record.description),
    ataChapters: asStringArray(record.ataChapters),
    affectedSystems: asStringArray(record.affectedSystems),
    status,
    icaRequirements: icaRequirements?.length ? icaRequirements : undefined,
    afmSupplement,
    weightBalance,
    placards: asStringArray(record.placards),
    electricalLoadNotes: asOptionalString(record.electricalLoadNotes),
    recurringInspections: recurringInspections?.length ? recurringInspections : undefined,
    confidence: asOptionalNumber(record.confidence),
    sourceDocumentIds: sourceDocumentIds.length ? sourceDocumentIds : undefined,
  };
}

function normalizeEdgeRef(raw: unknown, modCount: number, existingIds: Set<string>): ProposedEdgeRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const ref = raw as Record<string, unknown>;
  if (typeof ref.newIndex === 'number' && ref.newIndex >= 0 && ref.newIndex < modCount) {
    return { newIndex: ref.newIndex };
  }
  if (typeof ref.existingModId === 'string' && existingIds.has(ref.existingModId)) {
    return { existingModId: ref.existingModId };
  }
  return null;
}

function normalizeEdges(
  raw: unknown,
  modCount: number,
  existingIds: Set<string>,
): ProposedEdge[] {
  if (!Array.isArray(raw)) return [];
  const edges: ProposedEdge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const kind = typeof record.kind === 'string' ? (record.kind as ModEdgeKind) : null;
    if (!kind || !(ALL_MOD_EDGE_KINDS as string[]).includes(kind)) continue;
    const from = normalizeEdgeRef(record.from, modCount, existingIds);
    const to = normalizeEdgeRef(record.to, modCount, existingIds);
    if (!from || !to) continue;
    // Drop self-edges among new mods
    if ('newIndex' in from && 'newIndex' in to && from.newIndex === to.newIndex) continue;
    if (
      'existingModId' in from &&
      'existingModId' in to &&
      from.existingModId === to.existingModId
    )
      continue;
    edges.push({
      from,
      to,
      kind,
      ataChapter: asOptionalString(record.ataChapter),
      note: asOptionalString(record.note),
    });
  }
  return edges;
}

function normalizeApprovalRef(ref: string | undefined): string {
  return (ref ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Flag extracted mods that likely duplicate an existing record: normalized
 * approvalRef equality first, then case-insensitive title equality. Pure —
 * unit-testable. The review modal defaults flagged rows to "skip".
 */
export function markDuplicates(
  extracted: ExtractedModification[],
  existingMods: ExistingModSummary[],
): ExtractedModification[] {
  return extracted.map((mod) => {
    const refKey = normalizeApprovalRef(mod.approvalRef);
    if (refKey) {
      const refMatch = existingMods.find((e) => normalizeApprovalRef(e.approvalRef) === refKey);
      if (refMatch) {
        return {
          ...mod,
          dedupeMatch: {
            existingModId: refMatch.id,
            reason: `Same approval reference as "${refMatch.title}"`,
          },
        };
      }
    }
    const titleKey = mod.title.trim().toLowerCase();
    const titleMatch = existingMods.find((e) => e.title.trim().toLowerCase() === titleKey);
    if (titleMatch) {
      return {
        ...mod,
        dedupeMatch: {
          existingModId: titleMatch.id,
          reason: `Same title as an existing modification`,
        },
      };
    }
    return mod;
  });
}

export async function extractModificationsFromDocuments(params: {
  docs: Array<{ id?: string; name: string; text: string }>;
  aircraft: ExtractionAircraftContext;
  existingMods: ExistingModSummary[];
  model: string;
  signal?: AbortSignal;
}): Promise<ModExtractionResult> {
  const { aircraft, existingMods, model, signal } = params;
  const warnings: string[] = [];

  let docs = params.docs;
  if (docs.length > MAX_DOCS_PER_BATCH) {
    warnings.push(
      `Only the first ${MAX_DOCS_PER_BATCH} documents were analyzed (${docs.length} selected). Run extraction again for the rest.`,
    );
    docs = docs.slice(0, MAX_DOCS_PER_BATCH);
  }
  const clamped = docs.map((doc) => {
    if (doc.text.length > MAX_CHARS_PER_DOC) {
      warnings.push(`"${doc.name}" was truncated to ${MAX_CHARS_PER_DOC.toLocaleString()} characters.`);
      return { ...doc, text: doc.text.slice(0, MAX_CHARS_PER_DOC) };
    }
    return doc;
  });

  const docSections = clamped
    .map((doc) => `=== DOCUMENT: ${doc.name} ===\n${doc.text}`)
    .join('\n\n');
  const aircraftLine = [
    `Tail number: ${aircraft.tailNumber}`,
    aircraft.make && `Make: ${aircraft.make}`,
    aircraft.model && `Model: ${aircraft.model}`,
    aircraft.serial && `Serial: ${aircraft.serial}`,
  ]
    .filter(Boolean)
    .join(' | ');
  const existingSummary = existingMods.length
    ? JSON.stringify(
        existingMods.map((m) => ({
          id: m.id,
          modType: m.modType,
          title: m.title,
          approvalRef: m.approvalRef,
          ataChapters: m.ataChapters,
        })),
        null,
        1,
      )
    : '(none recorded yet)';

  const response = await createClaudeMessage(
    {
      model,
      max_tokens: 8000,
      temperature: 0.1,
      system: buildModExtractionSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `AIRCRAFT: ${aircraftLine}\n\nEXISTING MODIFICATIONS:\n${existingSummary}\n\nDOCUMENTS:\n${docSections}`,
        },
      ],
    },
    { signal },
  );

  const text = response.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  let payload = extractJsonFromMarkdown<RawExtractionPayload>(text, 'modificationExtraction');
  if (!payload) {
    const slice = extractBalancedJsonContaining(text, 'modifications');
    if (slice) {
      try {
        payload = JSON.parse(slice) as RawExtractionPayload;
      } catch {
        reportParseFailure('modificationExtraction', 'balanced-object fallback failed to parse', slice);
      }
    }
  }
  if (!payload) {
    reportParseFailure('modificationExtraction', 'no parseable extraction JSON found', text);
    throw new Error(
      'The AI response could not be parsed. Try again, or with fewer/shorter documents.',
    );
  }

  const docNameToId = new Map(
    clamped.filter((d) => d.id).map((d) => [d.name, d.id as string]),
  );
  const rawMods = Array.isArray(payload.modifications) ? payload.modifications : [];
  const modifications = rawMods
    .map((m) => normalizeModification(m, docNameToId))
    .filter((m): m is ExtractedModification => m !== null);
  // Default source docs: if the model didn't name sources, attribute all selected docs.
  const allDocIds = clamped.map((d) => d.id).filter((id): id is string => Boolean(id));
  for (const mod of modifications) {
    if (!mod.sourceDocumentIds?.length && allDocIds.length) {
      mod.sourceDocumentIds = allDocIds;
    }
  }

  const existingIds = new Set(existingMods.map((m) => m.id));
  const edges = normalizeEdges(payload.edges, modifications.length, existingIds);
  for (const warning of asStringArray(payload.warnings) ?? []) warnings.push(warning);

  return {
    modifications: markDuplicates(modifications, existingMods),
    edges,
    warnings,
  };
}
