/**
 * Record tools for Ask an Expert (Phase 2): Anthropic tool definitions plus a
 * client-side executor that answers them from Convex queries.
 *
 * Every row in a tool result carries a `cite` tag (continuing the turn's
 * source numbering), and the executor returns matching AskRecordSource entries
 * so cited rows render as chips that deep-link to the owning view. The pure
 * row→source mappers are exported for unit tests.
 */

import type { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { ClaudeTool } from './claudeProxy';
import type { AskRecordSource } from '../types/askSources';
import {
  forecastProject,
  dueInText,
  type DueForecastInput,
  type DueForecastItem,
} from '../utils/dueForecast';

export const MAX_RECORD_TOOL_CALLS = 6;

export const RECORD_TOOLS: ClaudeTool[] = [
  {
    name: 'get_aircraft_status',
    description:
      "Current aircraft status for the company's fleet: total time, cycles, landings, and as-of date. Optionally filter to one tail number.",
    input_schema: {
      type: 'object',
      properties: {
        tailNumber: { type: 'string', description: 'Registration, e.g. "N123AB". Omit for the whole fleet.' },
      },
    },
  },
  {
    name: 'list_logbook_entries',
    description:
      'Search maintenance logbook entries (newest first). Use textContains for part names or work descriptions (e.g. "ELT battery"), ataChapter for a system, dateFrom/dateTo (YYYY-MM-DD) for ranges.',
    input_schema: {
      type: 'object',
      properties: {
        tailNumber: { type: 'string', description: 'Limit to one aircraft registration.' },
        textContains: { type: 'string', description: 'Case-insensitive text to find in the work description.' },
        ataChapter: { type: 'string', description: 'ATA chapter, e.g. "25".' },
        dateFrom: { type: 'string', description: 'Earliest entry date, YYYY-MM-DD.' },
        dateTo: { type: 'string', description: 'Latest entry date, YYYY-MM-DD.' },
        limit: { type: 'string', description: 'Max rows (default 20, max 50).' },
      },
    },
  },
  {
    name: 'get_component_status',
    description:
      'Installed components per aircraft, including life-limited parts with limits and install data.',
    input_schema: {
      type: 'object',
      properties: {
        tailNumber: { type: 'string', description: 'Limit to one aircraft registration.' },
      },
    },
  },
  {
    name: 'list_discrepancies',
    description: 'Aircraft discrepancies (squawks/MEL items) with status open, deferred, resolved, or closed.',
    input_schema: {
      type: 'object',
      properties: {
        tailNumber: { type: 'string', description: 'Limit to one aircraft registration.' },
        status: { type: 'string', description: 'Filter: "open" | "deferred" | "resolved" | "closed".' },
      },
    },
  },
  {
    name: 'list_upcoming_due',
    description:
      'Maintenance/inspection items coming due (or overdue), forecast from utilization rates across schedule items, recurring logbook requirements, and life-limited components.',
    input_schema: {
      type: 'object',
      properties: {
        horizonDays: { type: 'string', description: 'Look-ahead window in days (default 90).' },
      },
    },
  },
];

// ── Pure row → source mappers (unit-tested) ────────────────────────────────

type Tagger = () => string;

export function tagRows<T extends { recordId: string }>(
  rows: T[],
  nextTag: Tagger,
  toSource: (row: T, tag: string) => AskRecordSource,
): { rows: Array<T & { cite: string }>; sources: AskRecordSource[] } {
  const sources: AskRecordSource[] = [];
  const tagged = rows.map((row) => {
    const tag = nextTag();
    sources.push(toSource(row, tag));
    return { ...row, cite: tag };
  });
  return { rows: tagged, sources };
}

export function aircraftSource(row: { recordId: string; tailNumber?: string; make?: string; model?: string }, tag: string): AskRecordSource {
  return {
    tag,
    kind: 'record',
    table: 'aircraftAssets',
    recordId: row.recordId,
    label: `Aircraft ${row.tailNumber ?? ''} — ${[row.make, row.model].filter(Boolean).join(' ') || 'status'}`.trim(),
    route: '/fleet',
  };
}

export function logbookSource(row: { recordId: string; entryDate?: string; workPerformed?: string }, tag: string): AskRecordSource {
  const summary = (row.workPerformed ?? '').slice(0, 60) || 'entry';
  return {
    tag,
    kind: 'record',
    table: 'logbookEntries',
    recordId: row.recordId,
    label: `Logbook entry — ${row.entryDate ?? 'undated'} — ${summary}`,
    route: '/logbook',
  };
}

export function componentSource(row: { recordId: string; description?: string; tailNumber?: string }, tag: string): AskRecordSource {
  return {
    tag,
    kind: 'record',
    table: 'aircraftComponents',
    recordId: row.recordId,
    label: `Component — ${row.description ?? 'part'}${row.tailNumber ? ` (${row.tailNumber})` : ''}`,
    route: '/fleet',
  };
}

export function discrepancySource(row: { recordId: string; status?: string; description?: string }, tag: string): AskRecordSource {
  return {
    tag,
    kind: 'record',
    table: 'aircraftDiscrepancies',
    recordId: row.recordId,
    label: `Discrepancy — ${row.status ?? ''} — ${(row.description ?? '').slice(0, 60)}`,
    route: '/fleet',
  };
}

const DUE_ROUTE: Record<DueForecastItem['source'], string> = {
  schedule: '/schedule',
  logbook: '/logbook',
  component: '/fleet',
};

export function dueItemSource(item: DueForecastItem, tag: string): AskRecordSource {
  return {
    tag,
    kind: 'record',
    table: 'dueForecast',
    recordId: `${item.source}-${item.sourceId}`,
    label: `Due item — ${item.title}${item.tailNumber ? ` (${item.tailNumber})` : ''} — ${dueInText(item)}`,
    route: DUE_ROUTE[item.source],
  };
}

// ── Executor ────────────────────────────────────────────────────────────────

export interface RecordToolResult {
  /** JSON string handed back to the model as the tool_result content. */
  resultForModel: string;
  sources: AskRecordSource[];
}

function parseLimit(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export async function executeRecordTool(
  convex: ConvexReactClient,
  projectId: string,
  toolName: string,
  input: Record<string, string>,
  nextTag: Tagger,
): Promise<RecordToolResult> {
  const pid = projectId as never;
  try {
    switch (toolName) {
      case 'get_aircraft_status': {
        const rows = (await convex.query(api.askTools.aircraftStatus, {
          projectId: pid,
          tailNumber: input.tailNumber || undefined,
        })) as Array<{ recordId: string; tailNumber?: string; make?: string; model?: string }>;
        const { rows: tagged, sources } = tagRows(rows, nextTag, aircraftSource);
        return { resultForModel: JSON.stringify({ aircraft: tagged }), sources };
      }
      case 'list_logbook_entries': {
        const rows = (await convex.query(api.askTools.logbookEntriesForAsk, {
          projectId: pid,
          tailNumber: input.tailNumber || undefined,
          textContains: input.textContains || undefined,
          ataChapter: input.ataChapter || undefined,
          dateFrom: input.dateFrom || undefined,
          dateTo: input.dateTo || undefined,
          limit: parseLimit(input.limit),
        })) as Array<{ recordId: string; entryDate?: string; workPerformed?: string }>;
        const { rows: tagged, sources } = tagRows(rows, nextTag, logbookSource);
        return { resultForModel: JSON.stringify({ entries: tagged, note: rows.length === 0 ? 'No matching logbook entries.' : undefined }), sources };
      }
      case 'get_component_status': {
        const rows = (await convex.query(api.askTools.componentsForAsk, {
          projectId: pid,
          tailNumber: input.tailNumber || undefined,
        })) as Array<{ recordId: string; description?: string; tailNumber?: string }>;
        const { rows: tagged, sources } = tagRows(rows, nextTag, componentSource);
        return { resultForModel: JSON.stringify({ components: tagged }), sources };
      }
      case 'list_discrepancies': {
        const rows = (await convex.query(api.askTools.discrepanciesForAsk, {
          projectId: pid,
          tailNumber: input.tailNumber || undefined,
          status: input.status || undefined,
        })) as Array<{ recordId: string; status?: string; description?: string }>;
        const { rows: tagged, sources } = tagRows(rows, nextTag, discrepancySource);
        return { resultForModel: JSON.stringify({ discrepancies: tagged }), sources };
      }
      case 'list_upcoming_due': {
        const sourcesPayload = (await convex.query(api.dueForecast.sourcesForProject, { projectId: pid })) as {
          aircraft: never[];
          scheduleItems: never[];
          recurringEntries: never[];
          components: never[];
        };
        const horizon = parseLimit(input.horizonDays) ?? 90;
        const inputs: DueForecastInput[] = [
          ...(sourcesPayload.scheduleItems as DueForecastInput[]),
          ...(sourcesPayload.recurringEntries as DueForecastInput[]),
          ...(sourcesPayload.components as DueForecastInput[]),
        ];
        const summary = forecastProject(sourcesPayload.aircraft, inputs, new Date());
        const due = summary.items.filter(
          (i) => i.bucket !== 'unforecastable' && typeof i.days === 'number' && i.days <= horizon,
        );
        const sources: AskRecordSource[] = [];
        const rows = due.map((item) => {
          const tag = nextTag();
          sources.push(dueItemSource(item, tag));
          return {
            cite: tag,
            title: item.title,
            tailNumber: item.tailNumber,
            dueDate: item.dueDate,
            dueIn: dueInText(item),
            source: item.source,
            remainingValue: item.remainingValue,
            remainingUnit: item.remainingUnit,
          };
        });
        return {
          resultForModel: JSON.stringify({
            horizonDays: horizon,
            items: rows,
            unforecastableCount: summary.counts.unforecastable,
          }),
          sources,
        };
      }
      default:
        return { resultForModel: JSON.stringify({ error: `Unknown tool: ${toolName}` }), sources: [] };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { resultForModel: JSON.stringify({ error: message }), sources: [] };
  }
}
