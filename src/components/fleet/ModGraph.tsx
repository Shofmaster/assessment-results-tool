import { useMemo, useState } from 'react';
import { FiZoomIn, FiZoomOut, FiMaximize } from 'react-icons/fi';
import {
  MOD_TYPE_LABELS,
  type AircraftModification,
  type ModType,
  type ModificationEdge,
} from '../../types/aircraftModification';
import {
  MOD_NODE_HEIGHT,
  MOD_NODE_WIDTH,
  computeModEdgePaths,
  computeModGraphLayout,
} from '../../utils/modGraphLayout';

interface ModGraphProps {
  mods: AircraftModification[];
  edges: ModificationEdge[];
  selectedModId: string | null;
  onSelectMod: (modId: string | null) => void;
  onEdgeClick: (edgeId: string) => void;
}

/** Raw colors (not Tailwind classes) so the SVG doesn't depend on JIT class generation. */
const MOD_TYPE_COLORS: Record<ModType, { fill: string; stroke: string }> = {
  stc: { fill: 'rgba(139,92,246,0.16)', stroke: 'rgba(167,139,250,0.65)' },
  field_approval_337: { fill: 'rgba(56,189,248,0.14)', stroke: 'rgba(125,211,252,0.65)' },
  der_8110_3: { fill: 'rgba(52,211,153,0.14)', stroke: 'rgba(110,231,183,0.6)' },
  minor_alteration: { fill: 'rgba(255,255,255,0.07)', stroke: 'rgba(255,255,255,0.35)' },
  amoc: { fill: 'rgba(251,191,36,0.13)', stroke: 'rgba(252,211,77,0.6)' },
  other: { fill: 'rgba(148,163,184,0.14)', stroke: 'rgba(148,163,184,0.55)' },
};

const EDGE_STYLES: Record<
  ModificationEdge['kind'],
  { stroke: string; dash?: string; marker: string }
> = {
  depends_on: { stroke: 'rgba(56,189,248,0.75)', marker: 'mod-arrow-sky' },
  conflicts_with: { stroke: 'rgba(251,113,133,0.8)', dash: '6 4', marker: 'mod-arrow-rose' },
  interfaces_with: { stroke: 'rgba(251,191,36,0.7)', dash: '6 4', marker: 'mod-arrow-amber' },
  shared_system: { stroke: 'rgba(255,255,255,0.35)', dash: '2 4', marker: 'mod-arrow-white' },
};

interface ArtifactChip {
  label: string;
  fill: string;
  stroke: string;
  text: string;
}

function artifactChips(mod: AircraftModification): ArtifactChip[] {
  const chips: ArtifactChip[] = [];
  if (mod.icaRequirements?.length) {
    chips.push({ label: 'ICA', fill: 'rgba(56,189,248,0.2)', stroke: 'rgba(125,211,252,0.5)', text: '#bae6fd' });
  }
  if (mod.afmSupplement?.required) {
    chips.push({ label: 'AFMS', fill: 'rgba(139,92,246,0.2)', stroke: 'rgba(167,139,250,0.5)', text: '#ddd6fe' });
  }
  const wb = mod.weightBalance;
  if (wb && (wb.weightChangeLbs || wb.momentChange)) {
    chips.push({ label: 'W&B', fill: 'rgba(251,191,36,0.18)', stroke: 'rgba(252,211,77,0.5)', text: '#fde68a' });
  }
  if (mod.placards?.length) {
    chips.push({ label: 'PLCD', fill: 'rgba(251,113,133,0.18)', stroke: 'rgba(251,113,133,0.5)', text: '#fecdd3' });
  }
  if (mod.recurringInspections?.length) {
    chips.push({ label: 'RECUR', fill: 'rgba(52,211,153,0.18)', stroke: 'rgba(110,231,183,0.5)', text: '#a7f3d0' });
  }
  return chips;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const ZOOM_LEVELS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

export function ModGraph({ mods, edges, selectedModId, onSelectMod, onEdgeClick }: ModGraphProps) {
  const [zoomIndex, setZoomIndex] = useState(3);
  const zoom = ZOOM_LEVELS[zoomIndex];

  const layout = useMemo(() => computeModGraphLayout(mods), [mods]);
  const edgePaths = useMemo(() => computeModEdgePaths(edges, layout.nodes), [edges, layout.nodes]);
  const modById = useMemo(() => new Map(mods.map((m) => [m._id, m])), [mods]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/65">
          Modification map
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          >
            <FiZoomOut size={14} />
          </button>
          <span className="text-xs text-white/45 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          >
            <FiZoomIn size={14} />
          </button>
          <button
            type="button"
            aria-label="Reset zoom"
            className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => setZoomIndex(3)}
          >
            <FiMaximize size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-auto scrollbar-thin max-h-[520px]">
        <svg
          width={layout.width * zoom}
          height={layout.height * zoom}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label="Aircraft modification relationship graph"
          onClick={() => onSelectMod(null)}
        >
          <defs>
            {(
              [
                ['mod-arrow-sky', 'rgba(56,189,248,0.85)'],
                ['mod-arrow-rose', 'rgba(251,113,133,0.9)'],
                ['mod-arrow-amber', 'rgba(251,191,36,0.85)'],
                ['mod-arrow-white', 'rgba(255,255,255,0.5)'],
              ] as const
            ).map(([id, color]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Column headers */}
          {layout.columns.map((col) => (
            <text
              key={col.key}
              x={col.x + MOD_NODE_WIDTH / 2}
              y={22}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="rgba(255,255,255,0.55)"
              style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              {col.label}
            </text>
          ))}

          {/* Edges under nodes */}
          {edgePaths.map((path) => {
            const style = EDGE_STYLES[path.kind];
            return (
              <g
                key={path.edgeId}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdgeClick(path.edgeId);
                }}
              >
                {/* Wide invisible hit target */}
                <path d={path.d} fill="none" stroke="transparent" strokeWidth={12} />
                <path
                  d={path.d}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.5}
                  strokeDasharray={style.dash}
                  markerEnd={`url(#${style.marker})`}
                />
                {path.kind === 'conflicts_with' && (
                  <circle cx={path.midX} cy={path.midY} r={5} fill="rgba(251,113,133,0.9)" />
                )}
                {path.kind === 'shared_system' && path.ataChapter && (
                  <text
                    x={path.midX}
                    y={path.midY - 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(255,255,255,0.55)"
                  >
                    ATA {path.ataChapter}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((node) => {
            const mod = modById.get(node.modId);
            if (!mod) return null;
            const colors = MOD_TYPE_COLORS[mod.modType];
            const inactive = mod.status !== 'installed';
            const selected = selectedModId === mod._id;
            const chips = artifactChips(mod);
            const needsReview = (mod.extractionConfidence ?? 1) < 0.7 && !mod.userVerified;
            return (
              <g
                key={node.modId}
                transform={`translate(${node.x}, ${node.y})`}
                opacity={inactive ? 0.5 : 1}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMod(selected ? null : mod._id);
                }}
              >
                <rect
                  width={MOD_NODE_WIDTH}
                  height={MOD_NODE_HEIGHT}
                  rx={10}
                  fill={colors.fill}
                  stroke={selected ? 'rgba(125,211,252,1)' : colors.stroke}
                  strokeWidth={selected ? 2 : 1}
                />
                <text x={10} y={17} fontSize={9} fontWeight={700} fill="rgba(255,255,255,0.5)" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {MOD_TYPE_LABELS[mod.modType]}
                  {inactive ? ` · ${mod.status.toUpperCase()}` : ''}
                  {needsReview ? ' · REVIEW' : ''}
                </text>
                <text x={10} y={35} fontSize={12} fontWeight={600} fill="rgba(255,255,255,0.92)">
                  {truncate(mod.title, 30)}
                </text>
                <text x={10} y={51} fontSize={10} fill="rgba(255,255,255,0.55)">
                  {truncate(mod.approvalRef ?? '', 34)}
                </text>
                {/* Artifact chips */}
                {chips.map((chip, i) => {
                  const chipWidth = chip.label.length * 6 + 10;
                  const x = 10 + chips.slice(0, i).reduce((acc, c) => acc + c.label.length * 6 + 10 + 5, 0);
                  return (
                    <g key={chip.label} transform={`translate(${x}, ${MOD_NODE_HEIGHT - 26})`}>
                      <rect width={chipWidth} height={16} rx={4} fill={chip.fill} stroke={chip.stroke} strokeWidth={0.75} />
                      <text x={chipWidth / 2} y={11.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill={chip.text}>
                        {chip.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 px-3 py-2">
        {(Object.keys(MOD_TYPE_COLORS) as ModType[]).map((type) => (
          <span key={type} className="flex items-center gap-1.5 text-[10px] text-white/55">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border"
              style={{ backgroundColor: MOD_TYPE_COLORS[type].fill, borderColor: MOD_TYPE_COLORS[type].stroke }}
            />
            {MOD_TYPE_LABELS[type]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-white/55">
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="rgba(56,189,248,0.75)" strokeWidth="1.5" /></svg>
          depends on
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/55">
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="rgba(251,113,133,0.8)" strokeWidth="1.5" strokeDasharray="6 4" /></svg>
          conflicts
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/55">
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="rgba(251,191,36,0.7)" strokeWidth="1.5" strokeDasharray="6 4" /></svg>
          interfaces
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/55">
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="2 4" /></svg>
          shared system
        </span>
      </div>
    </div>
  );
}
