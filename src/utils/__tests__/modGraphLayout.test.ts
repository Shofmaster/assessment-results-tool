import { describe, expect, it } from 'vitest';
import {
  MOD_CANVAS_PADDING,
  MOD_COLUMN_GAP,
  MOD_NODE_WIDTH,
  ataColumnLabel,
  computeModEdgePaths,
  computeModGraphLayout,
  normalizeAtaChapter,
} from '../modGraphLayout';
import type { AircraftModification, ModificationEdge } from '../../types/aircraftModification';

function makeMod(overrides: Partial<AircraftModification>): AircraftModification {
  return {
    _id: 'mod-1',
    projectId: 'p1',
    userId: 'u1',
    aircraftId: 'a1',
    modType: 'stc',
    title: 'Test mod',
    status: 'installed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeAtaChapter', () => {
  it('pads single digits and strips sub-chapters', () => {
    expect(normalizeAtaChapter('5')).toBe('05');
    expect(normalizeAtaChapter('34-51')).toBe('34');
    expect(normalizeAtaChapter(' 23 ')).toBe('23');
  });

  it('returns null for missing or non-numeric input', () => {
    expect(normalizeAtaChapter(undefined)).toBeNull();
    expect(normalizeAtaChapter('avionics')).toBeNull();
  });
});

describe('ataColumnLabel', () => {
  it('names known chapters and falls back for unknown ones', () => {
    expect(ataColumnLabel('34')).toBe('ATA 34 — Navigation');
    expect(ataColumnLabel('99')).toBe('ATA 99');
    expect(ataColumnLabel('none')).toBe('No ATA chapter');
  });
});

describe('computeModGraphLayout', () => {
  it('groups nodes into ATA columns in numeric order with "no ATA" last', () => {
    const layout = computeModGraphLayout([
      makeMod({ _id: 'nav', ataChapters: ['34'] }),
      makeMod({ _id: 'none', ataChapters: undefined }),
      makeMod({ _id: 'com', ataChapters: ['23'] }),
    ]);
    expect(layout.columns.map((c) => c.key)).toEqual(['23', '34', 'none']);
    const navNode = layout.nodes.find((n) => n.modId === 'nav')!;
    expect(navNode.x).toBe(MOD_CANVAS_PADDING + (MOD_NODE_WIDTH + MOD_COLUMN_GAP));
  });

  it('sorts rows within a column by install date, undated last', () => {
    const layout = computeModGraphLayout([
      makeMod({ _id: 'later', ataChapters: ['34'], dateInstalled: '2025-06-01' }),
      makeMod({ _id: 'undated', ataChapters: ['34'] }),
      makeMod({ _id: 'earlier', ataChapters: ['34'], dateInstalled: '2020-01-15' }),
    ]);
    const ys = ['earlier', 'later', 'undated'].map(
      (id) => layout.nodes.find((n) => n.modId === id)!.y,
    );
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
  });

  it('produces a non-degenerate canvas for an empty mod list', () => {
    const layout = computeModGraphLayout([]);
    expect(layout.nodes).toEqual([]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

describe('computeModEdgePaths', () => {
  it('builds a path per edge and skips edges with missing endpoints', () => {
    const mods = [
      makeMod({ _id: 'a', ataChapters: ['23'] }),
      makeMod({ _id: 'b', ataChapters: ['34'] }),
    ];
    const layout = computeModGraphLayout(mods);
    const edges: ModificationEdge[] = [
      {
        _id: 'e1',
        projectId: 'p1',
        userId: 'u1',
        aircraftId: 'a1',
        fromModId: 'a',
        toModId: 'b',
        kind: 'depends_on',
        source: 'manual',
        createdAt: '',
        updatedAt: '',
      },
      {
        _id: 'e2',
        projectId: 'p1',
        userId: 'u1',
        aircraftId: 'a1',
        fromModId: 'a',
        toModId: 'ghost',
        kind: 'conflicts_with',
        source: 'manual',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const paths = computeModEdgePaths(edges, layout.nodes);
    expect(paths).toHaveLength(1);
    expect(paths[0].edgeId).toBe('e1');
    expect(paths[0].d).toMatch(/^M .+ C .+$/);
  });
});
