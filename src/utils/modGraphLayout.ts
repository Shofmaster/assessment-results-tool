/**
 * Pure layout math for the aircraft Modifications graph (ModGraph.tsx).
 * Deterministic v1 layout: nodes grouped into columns by primary ATA chapter
 * (first entry of ataChapters), columns ordered numerically, rows ordered by
 * dateInstalled. No persisted positions — see rosterOrgChartLayouts for the
 * drag-persistence pattern if that's ever wanted here.
 */
import type { AircraftModification, ModificationEdge } from '../types/aircraftModification';

export const MOD_NODE_WIDTH = 210;
export const MOD_NODE_HEIGHT = 92;
export const MOD_COLUMN_GAP = 70;
export const MOD_ROW_GAP = 28;
export const MOD_CANVAS_PADDING = 32;
/** Vertical space reserved above each column for its ATA header label. */
export const MOD_COLUMN_HEADER_HEIGHT = 26;

/** ATA chapter names for column headers (common chapters only). */
const ATA_NAMES: Record<string, string> = {
  '11': 'Placards & Markings',
  '21': 'Air Conditioning',
  '22': 'Auto Flight',
  '23': 'Communications',
  '24': 'Electrical Power',
  '25': 'Equipment / Furnishings',
  '26': 'Fire Protection',
  '27': 'Flight Controls',
  '28': 'Fuel',
  '29': 'Hydraulic Power',
  '30': 'Ice & Rain Protection',
  '31': 'Instruments',
  '32': 'Landing Gear',
  '33': 'Lights',
  '34': 'Navigation',
  '35': 'Oxygen',
  '36': 'Pneumatic',
  '38': 'Water / Waste',
  '39': 'Electrical Panels',
  '45': 'Central Maintenance',
  '49': 'APU',
  '51': 'Structures',
  '52': 'Doors',
  '53': 'Fuselage',
  '54': 'Nacelles / Pylons',
  '55': 'Stabilizers',
  '56': 'Windows',
  '57': 'Wings',
  '61': 'Propellers',
  '71': 'Powerplant',
  '72': 'Engine',
  '73': 'Engine Fuel & Control',
  '74': 'Ignition',
  '76': 'Engine Controls',
  '77': 'Engine Indicating',
  '78': 'Exhaust',
  '79': 'Oil',
  '80': 'Starting',
  '91': 'Charts',
};

const NO_ATA_KEY = 'none';

export interface PlacedModNode {
  modId: string;
  x: number;
  y: number;
  /** Column key: normalized ATA chapter or "none". */
  columnKey: string;
}

export interface ModGraphColumn {
  key: string;
  /** e.g. "ATA 34 — Navigation" or "No ATA chapter" */
  label: string;
  x: number;
}

export interface ModGraphLayout {
  nodes: PlacedModNode[];
  columns: ModGraphColumn[];
  width: number;
  height: number;
}

/** Normalize an ATA chapter string to its 2-digit chapter ("34-51" → "34"). */
export function normalizeAtaChapter(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{1,2})/);
  if (!match) return null;
  return match[1].padStart(2, '0');
}

export function ataColumnLabel(key: string): string {
  if (key === NO_ATA_KEY) return 'No ATA chapter';
  const name = ATA_NAMES[key];
  return name ? `ATA ${key} — ${name}` : `ATA ${key}`;
}

function primaryAtaKey(mod: AircraftModification): string {
  return normalizeAtaChapter(mod.ataChapters?.[0]) ?? NO_ATA_KEY;
}

function installSortValue(mod: AircraftModification): string {
  // ISO dates sort lexicographically; undated mods sink to the bottom.
  return mod.dateInstalled || '9999-12-31';
}

/**
 * Compute deterministic node positions. Columns by primary ATA chapter in
 * numeric order ("No ATA" last); within a column, rows sorted by install date
 * then title.
 */
export function computeModGraphLayout(mods: AircraftModification[]): ModGraphLayout {
  const byColumn = new Map<string, AircraftModification[]>();
  for (const mod of mods) {
    const key = primaryAtaKey(mod);
    const list = byColumn.get(key);
    if (list) list.push(mod);
    else byColumn.set(key, [mod]);
  }

  const columnKeys = Array.from(byColumn.keys()).sort((a, b) => {
    if (a === NO_ATA_KEY) return 1;
    if (b === NO_ATA_KEY) return -1;
    return Number(a) - Number(b);
  });

  const nodes: PlacedModNode[] = [];
  const columns: ModGraphColumn[] = [];
  let maxRows = 0;

  columnKeys.forEach((key, columnIndex) => {
    const x = MOD_CANVAS_PADDING + columnIndex * (MOD_NODE_WIDTH + MOD_COLUMN_GAP);
    columns.push({ key, label: ataColumnLabel(key), x });
    const columnMods = (byColumn.get(key) ?? [])
      .slice()
      .sort((a, b) => {
        const dateCmp = installSortValue(a).localeCompare(installSortValue(b));
        if (dateCmp !== 0) return dateCmp;
        return a.title.localeCompare(b.title);
      });
    maxRows = Math.max(maxRows, columnMods.length);
    columnMods.forEach((mod, rowIndex) => {
      nodes.push({
        modId: mod._id,
        x,
        y:
          MOD_CANVAS_PADDING +
          MOD_COLUMN_HEADER_HEIGHT +
          rowIndex * (MOD_NODE_HEIGHT + MOD_ROW_GAP),
        columnKey: key,
      });
    });
  });

  const width =
    MOD_CANVAS_PADDING * 2 +
    Math.max(columnKeys.length, 1) * MOD_NODE_WIDTH +
    Math.max(columnKeys.length - 1, 0) * MOD_COLUMN_GAP;
  const height =
    MOD_CANVAS_PADDING * 2 +
    MOD_COLUMN_HEADER_HEIGHT +
    Math.max(maxRows, 1) * MOD_NODE_HEIGHT +
    Math.max(maxRows - 1, 0) * MOD_ROW_GAP;

  return { nodes, columns, width, height };
}

export interface ModEdgePath {
  edgeId: string;
  /** SVG path (cubic bezier between node border anchors). */
  d: string;
  midX: number;
  midY: number;
  kind: ModificationEdge['kind'];
  ataChapter?: string;
}

/**
 * Build bezier paths for edges. Anchors leave from the horizontal center of the
 * nearest vertical side of each node (right side of the left node → left side
 * of the right node), or top/bottom for same-column edges.
 */
export function computeModEdgePaths(
  edges: ModificationEdge[],
  nodes: PlacedModNode[],
): ModEdgePath[] {
  const byId = new Map(nodes.map((n) => [n.modId, n]));
  const paths: ModEdgePath[] = [];
  for (const edge of edges) {
    const from = byId.get(edge.fromModId);
    const to = byId.get(edge.toModId);
    if (!from || !to) continue;

    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (from.columnKey === to.columnKey) {
      // Same column: connect vertical faces, bow out to the right.
      x1 = from.x + MOD_NODE_WIDTH;
      y1 = from.y + MOD_NODE_HEIGHT / 2;
      x2 = to.x + MOD_NODE_WIDTH;
      y2 = to.y + MOD_NODE_HEIGHT / 2;
      const bow = MOD_COLUMN_GAP * 0.6;
      const d = `M ${x1} ${y1} C ${x1 + bow} ${y1}, ${x2 + bow} ${y2}, ${x2} ${y2}`;
      paths.push({
        edgeId: edge._id,
        d,
        midX: x1 + bow,
        midY: (y1 + y2) / 2,
        kind: edge.kind,
        ataChapter: edge.ataChapter,
      });
      continue;
    }
    const leftToRight = from.x < to.x;
    x1 = leftToRight ? from.x + MOD_NODE_WIDTH : from.x;
    y1 = from.y + MOD_NODE_HEIGHT / 2;
    x2 = leftToRight ? to.x : to.x + MOD_NODE_WIDTH;
    y2 = to.y + MOD_NODE_HEIGHT / 2;
    const dx = (x2 - x1) / 2;
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    paths.push({
      edgeId: edge._id,
      d,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
      kind: edge.kind,
      ataChapter: edge.ataChapter,
    });
  }
  return paths;
}
