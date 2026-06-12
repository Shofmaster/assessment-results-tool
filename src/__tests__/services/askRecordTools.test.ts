import { describe, it, expect } from 'vitest';
import type { ConvexReactClient } from 'convex/react';
import {
  tagRows,
  aircraftSource,
  logbookSource,
  componentSource,
  discrepancySource,
  dueItemSource,
  executeRecordTool,
  RECORD_TOOLS,
  MAX_RECORD_TOOL_CALLS,
} from '../../services/askRecordTools';
import { createTagAllocator } from '../../types/askSources';
import type { DueForecastItem } from '../../utils/dueForecast';

function fakeConvex(query: (fn: unknown, args: unknown) => Promise<unknown>): ConvexReactClient {
  return { query } as unknown as ConvexReactClient;
}

describe('createTagAllocator', () => {
  it('continues numbering after existing sources', () => {
    const next = createTagAllocator(3);
    expect(next()).toBe('S4');
    expect(next()).toBe('S5');
  });
});

describe('tagRows', () => {
  it('assigns sequential cite tags and aligned sources', () => {
    const next = createTagAllocator(0);
    const { rows, sources } = tagRows(
      [
        { recordId: 'a', entryDate: '2025-11-02', workPerformed: 'Replaced ELT battery' },
        { recordId: 'b', entryDate: '2024-11-01', workPerformed: 'Replaced ELT battery (prior)' },
      ],
      next,
      logbookSource,
    );
    expect(rows.map((r) => r.cite)).toEqual(['S1', 'S2']);
    expect(sources.map((s) => s.tag)).toEqual(['S1', 'S2']);
    expect(sources[0].recordId).toBe('a');
    expect(sources[0].label).toBe('Logbook entry — 2025-11-02 — Replaced ELT battery');
    expect(sources[0].route).toBe('/logbook');
  });
});

describe('source mappers', () => {
  it('labels aircraft sources and routes to fleet', () => {
    const s = aircraftSource({ recordId: 'x', tailNumber: 'N123AB', make: 'Cessna', model: '560XL' }, 'S1');
    expect(s.label).toBe('Aircraft N123AB — Cessna 560XL');
    expect(s.route).toBe('/fleet');
    expect(s.table).toBe('aircraftAssets');
  });

  it('labels component and discrepancy sources', () => {
    expect(componentSource({ recordId: 'c', description: 'Main battery', tailNumber: 'N1' }, 'S2').label).toBe(
      'Component — Main battery (N1)',
    );
    expect(discrepancySource({ recordId: 'd', status: 'open', description: 'Hydraulic leak' }, 'S3').label).toBe(
      'Discrepancy — open — Hydraulic leak',
    );
  });

  it('routes due items by their underlying source', () => {
    const base: DueForecastItem = {
      source: 'schedule',
      sourceId: 's1',
      title: 'Torque wrench calibration',
      dueDate: '2026-07-01',
      days: 21,
      bucket: 'due30',
      reasons: [],
      stale: false,
    };
    expect(dueItemSource(base, 'S1').route).toBe('/schedule');
    expect(dueItemSource({ ...base, source: 'logbook' }, 'S2').route).toBe('/logbook');
    expect(dueItemSource({ ...base, source: 'component' }, 'S3').route).toBe('/fleet');
    expect(dueItemSource(base, 'S1').label).toBe('Due item — Torque wrench calibration — due in 21 days');
  });
});

describe('executeRecordTool', () => {
  it('returns an error payload for unknown tools without throwing', async () => {
    const result = await executeRecordTool(
      fakeConvex(() => Promise.reject(new Error('should not be called'))),
      'p1',
      'launch_missiles',
      {},
      createTagAllocator(0),
    );
    expect(JSON.parse(result.resultForModel).error).toContain('Unknown tool');
    expect(result.sources).toEqual([]);
  });

  it('converts query failures into an error payload the model can read', async () => {
    const result = await executeRecordTool(
      fakeConvex(() => Promise.reject(new Error('Project not found'))),
      'p1',
      'get_aircraft_status',
      {},
      createTagAllocator(0),
    );
    expect(JSON.parse(result.resultForModel).error).toBe('Project not found');
    expect(result.sources).toEqual([]);
  });

  it('tags aircraft rows and returns matching sources', async () => {
    const result = await executeRecordTool(
      fakeConvex(() =>
        Promise.resolve([
          { recordId: 'a1', tailNumber: 'N123AB', make: 'Cessna', model: '560XL', totalTime: 1160 },
        ]),
      ),
      'p1',
      'get_aircraft_status',
      {},
      createTagAllocator(2),
    );
    const payload = JSON.parse(result.resultForModel);
    expect(payload.aircraft[0].cite).toBe('S3');
    expect(payload.aircraft[0].totalTime).toBe(1160);
    expect(result.sources[0]).toMatchObject({ tag: 'S3', kind: 'record', recordId: 'a1', route: '/fleet' });
  });

  it('runs the due forecast engine for list_upcoming_due', async () => {
    const sourcesPayload = {
      aircraft: [
        {
          aircraftId: 'ac1',
          tailNumber: 'N123AB',
          baselineTotalTime: 1000,
          baselineAsOfDate: '2026-01-01',
          currentTotalTime: 1160,
          currentAsOfDate: new Date().toISOString().slice(0, 10),
        },
      ],
      scheduleItems: [],
      recurringEntries: [
        {
          kind: 'logbook',
          sourceId: 'e1',
          aircraftId: 'ac1',
          title: '100 hour inspection',
          recurrenceUnit: 'hours',
          recurrenceInterval: 100,
          totalTimeAtEntry: 1100,
        },
      ],
      components: [],
      externalItems: [],
    };
    const result = await executeRecordTool(
      fakeConvex(() => Promise.resolve(sourcesPayload)),
      'p1',
      'list_upcoming_due',
      {},
      createTagAllocator(0),
    );
    const payload = JSON.parse(result.resultForModel);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].cite).toBe('S1');
    expect(payload.items[0].title).toBe('100 hour inspection');
    expect(result.sources[0].route).toBe('/logbook');
  });
});

describe('tool definitions', () => {
  it('exposes the five record tools with object schemas', () => {
    expect(RECORD_TOOLS.map((t) => t.name)).toEqual([
      'get_aircraft_status',
      'list_logbook_entries',
      'get_component_status',
      'list_discrepancies',
      'list_upcoming_due',
    ]);
    for (const tool of RECORD_TOOLS) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(20);
    }
    expect(MAX_RECORD_TOOL_CALLS).toBeGreaterThan(0);
  });
});
