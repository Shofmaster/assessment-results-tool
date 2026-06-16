import { useMemo, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiChevronsLeft, FiChevronsRight, FiRefreshCw, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { ORG_CHART_LEGEND, PART145_ORG_TEMPLATE, type OrgTemplateNode } from "../../data/part145OrgTemplate";
import type { OrgChartNode, RosterPersonRow } from "../../utils/rosterOrganization";
import {
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  buildBranchPath,
  buildFunctionalEdges,
  buildFunctionalQuadraticPath,
  buildPolylinePath,
  buildPrimaryEdges,
  buildSmoothPathThrough,
  computeGridOrgLayout,
  defaultFunctionalControlPoint,
  getNodeCenter,
  getOrgCanvasBounds,
  mergeOrgLayoutWithSaved,
  normalizeRouteWaypoints,
  orgChartGridBackgroundStyle,
  pointOnPolyline,
  pointOnSmoothPath,
  snapPointToOrgGrid,
  type OrgPoint,
  type PlacedOrgNode,
} from "../../utils/orgChartLayout";
import { Button } from "../ui";
import { rosterCardSurfaceStyle } from "../../utils/rosterCardColors";
import { RosterCardColorPicker } from "./RosterCardColorPicker";
import { RosterReportingEditor } from "./RosterReportingEditor";

export type FunctionalReportingLine = {
  _id: string;
  subordinatePersonId: string;
  supervisorPersonId: string;
  contextLabel: string;
  pathControlX?: number;
  pathControlY?: number;
  waypoints?: { x: number; y: number }[];
};

type Props = {
  roots: OrgChartNode[];
  personnel: RosterPersonRow[];
  reportingLines: FunctionalReportingLine[];
  savedLayouts: { personId: string; x: number; y: number }[];
  primaryRoutes: { childPersonId: string; waypoints: { x: number; y: number }[] }[];
  onReparent: (personId: string, newManagerId: string | null) => Promise<void>;
  onSaveLayout: (personId: string, x: number, y: number) => Promise<void>;
  onResetLayout: () => Promise<void>;
  onAddFunctionalLine: (subordinatePersonId: string, supervisorPersonId: string, contextLabel: string) => Promise<void>;
  onRemoveFunctionalLine: (lineId: string) => Promise<void>;
  onSaveFunctionalLinePath: (lineId: string, waypoints: { x: number; y: number }[]) => Promise<void>;
  onSavePrimaryLinePath: (childPersonId: string, waypoints: { x: number; y: number }[]) => Promise<void>;
  getPersonCardColor: (person: RosterPersonRow) => string | undefined;
  onCardColorChange: (personId: string, color: string | null) => Promise<void>;
};

type DragState = {
  personId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type LineKind = "functional" | "primary";

type WaypointDragState = {
  /** "functional" → id is a reporting-line id; "primary" → id is the child person id. */
  kind: LineKind;
  id: string;
  /** Index into the line's waypoint list being dragged. */
  index: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

/** A reporting line resolved to absolute geometry, with its current waypoints. */
type LineGeom = {
  kind: LineKind;
  id: string;
  from: OrgPoint;
  to: OrgPoint;
  /** Interior points the line passes through (excludes the two card anchors). */
  waypoints: OrgPoint[];
  /** Default on-line handle position shown when there are no waypoints yet. */
  seed: OrgPoint;
  /** Path drawn when there are no waypoints (classic elbow / lifted curve). */
  defaultPath: string;
  label?: string;
};

const lineKey = (kind: LineKind, id: string) => `${kind}:${id}`;

function TemplateBranch({ node, depth = 0 }: { node: OrgTemplateNode; depth?: number }) {
  return (
    <li className={depth > 0 ? "mt-1.5" : undefined}>
      <div className="text-xs text-white/70">
        <span className="font-medium text-white/85">{node.title}</span>
        {node.department ? <span className="text-white/45"> · {node.department}</span> : null}
      </div>
      {node.children?.length ? (
        <ul className={`mt-1 space-y-1 border-l border-white/10 ${depth === 0 ? "ml-3 pl-3" : "ml-2 pl-2"}`}>
          {node.children.map((child) => (
            <TemplateBranch key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function RosterOrgChartCanvas({
  roots,
  personnel,
  reportingLines,
  savedLayouts,
  primaryRoutes,
  onReparent,
  onSaveLayout,
  onResetLayout,
  onAddFunctionalLine,
  onRemoveFunctionalLine,
  onSaveFunctionalLinePath,
  onSavePrimaryLinePath,
  getPersonCardColor,
  onCardColorChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [waypointDrag, setWaypointDrag] = useState<WaypointDragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [handleOffset, setHandleOffset] = useState({ x: 0, y: 0 });
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [localWaypoints, setLocalWaypoints] = useState<Record<string, OrgPoint[]>>({});
  const [isResetting, setIsResetting] = useState(false);

  const showSidebar = !sidebarCollapsed;

  const savedByPersonId = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const layout of savedLayouts) {
      map.set(layout.personId, snapPointToOrgGrid(layout.x, layout.y));
    }
    for (const [personId, pos] of Object.entries(localPositions)) {
      map.set(personId, snapPointToOrgGrid(pos.x, pos.y));
    }
    return map;
  }, [savedLayouts, localPositions]);

  const autoLayout = useMemo(() => computeGridOrgLayout(personnel, roots), [personnel, roots]);
  const placedNodes = useMemo(
    () => mergeOrgLayoutWithSaved(autoLayout, savedByPersonId),
    [autoLayout, savedByPersonId],
  );

  const nodeById = useMemo(() => new Map(placedNodes.map((n) => [n.id, n])), [placedNodes]);
  const personById = useMemo(() => new Map(personnel.map((p) => [p._id, p])), [personnel]);

  const primaryEdges = useMemo(() => buildPrimaryEdges(roots, nodeById), [roots, nodeById]);
  const functionalEdges = useMemo(
    () => buildFunctionalEdges(reportingLines, nodeById),
    [reportingLines, nodeById],
  );

  const bounds = useMemo(() => getOrgCanvasBounds(placedNodes), [placedNodes]);

  const dragSnapTarget = useMemo(() => {
    if (!dragState) return null;
    const node = nodeById.get(dragState.personId);
    if (!node) return null;
    return snapPointToOrgGrid(node.x + dragOffset.x, node.y + dragOffset.y);
  }, [dragState, dragOffset, nodeById]);

  const selectedPerson = selectedPersonId ? personById.get(selectedPersonId) : undefined;
  const selectedLines = useMemo(
    () => reportingLines.filter((line) => line.subordinatePersonId === selectedPersonId),
    [reportingLines, selectedPersonId],
  );

  const additionalCountByPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of reportingLines) {
      const key = line.subordinatePersonId;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [reportingLines]);

  const savedPrimaryWaypoints = useMemo(() => {
    const map = new Map<string, OrgPoint[]>();
    for (const route of primaryRoutes) {
      map.set(route.childPersonId, route.waypoints ?? []);
    }
    return map;
  }, [primaryRoutes]);

  const savedFunctionalWaypoints = useMemo(() => {
    const map = new Map<string, OrgPoint[]>();
    for (const line of reportingLines) {
      map.set(line._id, normalizeRouteWaypoints(line));
    }
    return map;
  }, [reportingLines]);

  const resolveWaypoints = (kind: LineKind, id: string): OrgPoint[] => {
    const local = localWaypoints[lineKey(kind, id)];
    if (local) return local;
    const saved = kind === "primary" ? savedPrimaryWaypoints.get(id) : savedFunctionalWaypoints.get(id);
    return saved ?? [];
  };

  const lines = useMemo(() => {
    const result: LineGeom[] = [];

    for (const edge of primaryEdges) {
      const id = edge.lineId;
      if (!id) continue;
      const fromNode = nodeById.get(edge.fromId);
      const toNode = nodeById.get(edge.toId);
      if (!fromNode || !toNode) continue;
      const from = getNodeCenter(fromNode);
      const to = getNodeCenter(toNode);
      from.y += ORG_NODE_HEIGHT / 2;
      to.y -= ORG_NODE_HEIGHT / 2;
      result.push({
        kind: "primary",
        id,
        from,
        to,
        waypoints: resolveWaypoints("primary", id),
        // Midpoint of the elbow's horizontal run — lies exactly on the default line.
        seed: { x: (from.x + to.x) / 2, y: from.y + (to.y - from.y) / 2 },
        defaultPath: buildBranchPath(from, to),
      });
    }

    functionalEdges.forEach((edge, index) => {
      const id = edge.lineId;
      if (!id) return;
      const fromNode = nodeById.get(edge.fromId);
      const toNode = nodeById.get(edge.toId);
      if (!fromNode || !toNode) return;
      const from = getNodeCenter(fromNode);
      const to = getNodeCenter(toNode);
      const control = defaultFunctionalControlPoint(from, to, index);
      result.push({
        kind: "functional",
        id,
        from,
        to,
        waypoints: resolveWaypoints("functional", id),
        // Point on the default quadratic at t=0.5 (on the curve, not the control point).
        seed: {
          x: 0.25 * from.x + 0.5 * control.x + 0.25 * to.x,
          y: 0.25 * from.y + 0.5 * control.y + 0.25 * to.y,
        },
        defaultPath: buildFunctionalQuadraticPath(from, to, control),
        label: edge.label,
      });
    });

    return result;
    // resolveWaypoints depends on these inputs; listing them keeps geometry in sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryEdges, functionalEdges, nodeById, savedPrimaryWaypoints, savedFunctionalWaypoints, localWaypoints]);

  /** Waypoints with the in-progress drag offset applied to the dragged index. */
  const liveWaypoints = (line: LineGeom): OrgPoint[] => {
    if (!waypointDrag || waypointDrag.kind !== line.kind || waypointDrag.id !== line.id) {
      return line.waypoints;
    }
    const next = line.waypoints.slice();
    if (waypointDrag.index < next.length) {
      next[waypointDrag.index] = {
        x: waypointDrag.originX + handleOffset.x,
        y: waypointDrag.originY + handleOffset.y,
      };
    }
    return next;
  };

  // Primary (blue) lines route as straight segments; functional (amber) lines stay smooth.
  const routedPath = (line: LineGeom, points: OrgPoint[]): string =>
    line.kind === "primary" ? buildPolylinePath(points) : buildSmoothPathThrough(points);

  const segmentMidpoint = (line: LineGeom, points: OrgPoint[], segmentIndex: number): OrgPoint =>
    line.kind === "primary"
      ? pointOnPolyline(points, segmentIndex, 0.5)
      : pointOnSmoothPath(points, segmentIndex, 0.5);

  const finishDrag = async (state: DragState) => {
    const snapped = snapPointToOrgGrid(state.originX + dragOffset.x, state.originY + dragOffset.y);
    try {
      await onSaveLayout(state.personId, snapped.x, snapped.y);
      setLocalPositions((prev) => ({ ...prev, [state.personId]: snapped }));
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save layout");
    }
  };

  const onPointerDown = (event: React.PointerEvent, node: PlacedOrgNode) => {
    if (event.button !== 0 || waypointDrag) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelectedPersonId(node.personId);
    setDragState({
      personId: node.personId,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    });
    setDragOffset({ x: 0, y: 0 });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (waypointDrag) {
      setHandleOffset({
        x: event.clientX - waypointDrag.startX,
        y: event.clientY - waypointDrag.startY,
      });
      return;
    }
    if (!dragState) return;
    setDragOffset({
      x: event.clientX - dragState.startX,
      y: event.clientY - dragState.startY,
    });
  };

  const persistWaypoints = async (kind: LineKind, id: string, waypoints: OrgPoint[]) => {
    try {
      if (kind === "primary") {
        await onSavePrimaryLinePath(id, waypoints);
      } else {
        await onSaveFunctionalLinePath(id, waypoints);
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save line route");
    }
  };

  const finishWaypointDrag = async (drag: WaypointDragState) => {
    const key = lineKey(drag.kind, drag.id);
    const base = resolveWaypoints(drag.kind, drag.id);
    const next = base.slice();
    if (drag.index < next.length) {
      next[drag.index] = {
        x: drag.originX + handleOffset.x,
        y: drag.originY + handleOffset.y,
      };
    }
    setLocalWaypoints((prev) => ({ ...prev, [key]: next }));
    await persistWaypoints(drag.kind, drag.id, next);
  };

  const onPointerUp = async () => {
    if (waypointDrag) {
      await finishWaypointDrag(waypointDrag);
      setWaypointDrag(null);
      setHandleOffset({ x: 0, y: 0 });
      return;
    }
    if (!dragState) return;
    await finishDrag(dragState);
    setDragState(null);
    setDragOffset({ x: 0, y: 0 });
  };

  const beginWaypointDrag = (
    event: React.PointerEvent,
    line: LineGeom,
    index: number,
    origin: OrgPoint,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    setWaypointDrag({
      kind: line.kind,
      id: line.id,
      index,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
    });
    setHandleOffset({ x: 0, y: 0 });
  };

  /** First-time bend: create a waypoint at the seed position, then drag it. */
  const beginSeedDrag = (event: React.PointerEvent, line: LineGeom) => {
    setLocalWaypoints((prev) => ({ ...prev, [lineKey(line.kind, line.id)]: [line.seed] }));
    beginWaypointDrag(event, line, 0, line.seed);
  };

  /** Insert a new waypoint on segment `segmentIndex` at `pos`, then drag it. */
  const beginAddDrag = (
    event: React.PointerEvent,
    line: LineGeom,
    segmentIndex: number,
    pos: OrgPoint,
  ) => {
    const base = line.waypoints;
    const next = [...base.slice(0, segmentIndex), pos, ...base.slice(segmentIndex)];
    setLocalWaypoints((prev) => ({ ...prev, [lineKey(line.kind, line.id)]: next }));
    beginWaypointDrag(event, line, segmentIndex, pos);
  };

  const removeWaypoint = async (line: LineGeom, index: number) => {
    const next = line.waypoints.filter((_, i) => i !== index);
    setLocalWaypoints((prev) => ({ ...prev, [lineKey(line.kind, line.id)]: next }));
    await persistWaypoints(line.kind, line.id, next);
  };

  /** Clear all waypoints for a single line, returning just that line to its default route. */
  const resetLine = async (line: LineGeom) => {
    setLocalWaypoints((prev) => ({ ...prev, [lineKey(line.kind, line.id)]: [] }));
    await persistWaypoints(line.kind, line.id, []);
  };

  if (personnel.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-10 px-6 text-center text-sm text-white/55">
        Add team members first, then arrange them on the org chart grid.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/55">
            {ORG_CHART_LEGEND.map((item) => (
              <span key={item.style} className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block w-8 border-t-2 ${
                    item.style === "solid" ? "border-sky-400/80" : "border-amber-400/80 border-dashed"
                  }`}
                />
                {item.label}
              </span>
            ))}
            <span className="text-white/40">
              Drag dots to bend a line · click + to add a bend · double-click a dot to remove it · click ✕ to reset the line
            </span>
          </div>

          <div
            ref={canvasRef}
            className="relative overflow-auto rounded-xl border border-white/10 bg-[#060b12] p-4 scrollbar-thin"
            style={{ maxHeight: "min(88vh, 980px)", minHeight: "min(56vh, 520px)", ...orgChartGridBackgroundStyle }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <svg
              className="absolute top-4 left-4 pointer-events-none"
              width={bounds.width}
              height={bounds.height}
            >
              {lines.map((line) => {
                const live = liveWaypoints(line);
                const pts = [line.from, ...live, line.to];
                const d = live.length === 0 ? line.defaultPath : routedPath(line, pts);
                if (line.kind === "primary") {
                  return (
                    <path
                      key={`path-primary-${line.id}`}
                      d={d}
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.5)"
                      strokeWidth={1.75}
                    />
                  );
                }
                const segCount = pts.length - 1;
                const labelAt = segmentMidpoint(line, pts, Math.floor((segCount - 1) / 2));
                return (
                  <g key={`path-functional-${line.id}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.55)"
                      strokeWidth={1.75}
                      strokeDasharray="5 4"
                    />
                    {line.label ? (
                      <text
                        x={labelAt.x}
                        y={labelAt.y - 8}
                        fill="rgba(251, 191, 36, 0.85)"
                        fontSize={9}
                        textAnchor="middle"
                      >
                        {line.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
              {dragSnapTarget ? (
                <div
                  aria-hidden
                  className="absolute pointer-events-none rounded-lg border-2 border-dashed border-sky-400/50 bg-sky-400/8 z-[5]"
                  style={{
                    left: dragSnapTarget.x,
                    top: dragSnapTarget.y,
                    width: ORG_NODE_WIDTH,
                    height: ORG_NODE_HEIGHT,
                  }}
                />
              ) : null}
              {placedNodes.map((node) => {
                const isDragging = dragState?.personId === node.personId;
                const isSelected = selectedPersonId === node.personId;
                const dragPos = isDragging
                  ? snapPointToOrgGrid(node.x + dragOffset.x, node.y + dragOffset.y)
                  : { x: node.x, y: node.y };
                const extraSupervisors = additionalCountByPerson.get(node.personId) ?? 0;
                const personRow = personById.get(node.personId);
                const cardColor = personRow ? getPersonCardColor(personRow) : undefined;
                const colorStyle = rosterCardSurfaceStyle(cardColor);

                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => onPointerDown(e, node)}
                    className={`absolute select-none cursor-grab active:cursor-grabbing rounded-lg border shadow-md transition-[box-shadow,border-color] z-10 ${
                      isSelected
                        ? "ring-1 ring-sky-400/25 z-20"
                        : cardColor
                          ? "hover:brightness-110"
                          : "border-white/12 bg-[#0c1420]/95 hover:border-white/22"
                    } ${isDragging ? "opacity-95 shadow-lg shadow-sky-500/10" : ""}`}
                    style={{
                      width: ORG_NODE_WIDTH,
                      height: ORG_NODE_HEIGHT,
                      left: dragPos.x,
                      top: dragPos.y,
                      ...(isSelected
                        ? { backgroundColor: "rgba(14, 165, 233, 0.12)", borderColor: "rgba(56, 189, 248, 0.55)" }
                        : colorStyle ?? { borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(12, 20, 32, 0.95)" }),
                    }}
                  >
                    <div className="px-2.5 py-2 h-full flex flex-col justify-center">
                      <div className="text-sm font-medium text-white truncate leading-tight">{node.fullName}</div>
                      <div className="text-[11px] text-white/50 truncate mt-0.5">
                        {node.roleTitle || "No title"}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 min-h-[14px]">
                        {node.department ? (
                          <span className="text-[10px] text-sky-200/65 truncate">{node.department}</span>
                        ) : null}
                        {extraSupervisors > 0 ? (
                          <span className="text-[10px] text-amber-200/80 shrink-0">+{extraSupervisors} sup.</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <svg
              className="absolute top-4 left-4 z-30"
              width={bounds.width}
              height={bounds.height}
              style={{ pointerEvents: "none" }}
            >
              {lines.map((line) => {
                const live = liveWaypoints(line);
                const dotColor =
                  line.kind === "primary" ? "rgba(56, 189, 248, 0.9)" : "rgba(251, 191, 36, 0.85)";

                if (live.length === 0) {
                  return (
                    <g key={`handle-seed-${line.kind}-${line.id}`} style={{ pointerEvents: "all" }}>
                      <circle
                        cx={line.seed.x}
                        cy={line.seed.y}
                        r={9}
                        fill="transparent"
                        className="cursor-grab"
                        onPointerDown={(event) => beginSeedDrag(event, line)}
                      />
                      <circle
                        cx={line.seed.x}
                        cy={line.seed.y}
                        r={4.5}
                        fill={dotColor}
                        stroke="rgba(15, 23, 42, 0.95)"
                        strokeWidth={1.5}
                        className="cursor-grab"
                        onPointerDown={(event) => beginSeedDrag(event, line)}
                      />
                    </g>
                  );
                }

                const pts = [line.from, ...live, line.to];
                const segCount = pts.length - 1;
                const resetAt = { x: live[0].x + 15, y: live[0].y - 15 };

                return (
                  <g key={`handle-line-${line.kind}-${line.id}`} style={{ pointerEvents: "all" }}>
                    {Array.from({ length: segCount }).map((_, i) => {
                      const mid = segmentMidpoint(line, pts, i);
                      return (
                        <g key={`add-${i}`} className="cursor-copy">
                          <circle
                            cx={mid.x}
                            cy={mid.y}
                            r={8}
                            fill="transparent"
                            onPointerDown={(event) => beginAddDrag(event, line, i, mid)}
                          />
                          <circle
                            cx={mid.x}
                            cy={mid.y}
                            r={3.5}
                            fill="rgba(15, 23, 42, 0.85)"
                            stroke={dotColor}
                            strokeWidth={1.25}
                            onPointerDown={(event) => beginAddDrag(event, line, i, mid)}
                          />
                          <path
                            d={`M ${mid.x - 2} ${mid.y} H ${mid.x + 2} M ${mid.x} ${mid.y - 2} V ${mid.y + 2}`}
                            stroke={dotColor}
                            strokeWidth={1}
                            pointerEvents="none"
                          />
                        </g>
                      );
                    })}
                    {live.map((wp, k) => {
                      const isDragging =
                        waypointDrag?.kind === line.kind &&
                        waypointDrag?.id === line.id &&
                        waypointDrag?.index === k;
                      return (
                        <g key={`dot-${k}`}>
                          <circle
                            cx={wp.x}
                            cy={wp.y}
                            r={10}
                            fill="transparent"
                            onPointerDown={(event) => beginWaypointDrag(event, line, k, wp)}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              void removeWaypoint(line, k);
                            }}
                          />
                          <circle
                            cx={wp.x}
                            cy={wp.y}
                            r={5}
                            fill={dotColor}
                            stroke="rgba(15, 23, 42, 0.95)"
                            strokeWidth={1.5}
                            className={isDragging ? "cursor-grabbing" : "cursor-grab"}
                            onPointerDown={(event) => beginWaypointDrag(event, line, k, wp)}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              void removeWaypoint(line, k);
                            }}
                          />
                        </g>
                      );
                    })}
                    <g
                      className="cursor-pointer"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        void resetLine(line);
                      }}
                    >
                      <title>Reset this line to its default route</title>
                      <circle
                        cx={resetAt.x}
                        cy={resetAt.y}
                        r={7}
                        fill="rgba(15, 23, 42, 0.92)"
                        stroke="rgba(248, 113, 113, 0.85)"
                        strokeWidth={1.25}
                      />
                      <path
                        d={`M ${resetAt.x - 2.5} ${resetAt.y - 2.5} L ${resetAt.x + 2.5} ${resetAt.y + 2.5} M ${resetAt.x + 2.5} ${resetAt.y - 2.5} L ${resetAt.x - 2.5} ${resetAt.y + 2.5}`}
                        stroke="rgba(248, 113, 113, 0.95)"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          <Button
            size="sm"
            variant="ghost"
            icon={<FiRefreshCw className="w-3.5 h-3.5" />}
            loading={isResetting}
            onClick={async () => {
              try {
                setIsResetting(true);
                await onResetLayout();
                setLocalPositions({});
                setLocalWaypoints({});
                toast.success("Reset org chart layout and line routes");
              } catch (error: any) {
                toast.error(error?.message ?? "Failed to reset layout");
              } finally {
                setIsResetting(false);
              }
            }}
          >
            Reset to auto grid
          </Button>
        </div>

        {showSidebar ? (
        <aside className="w-full lg:w-80 shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
              Details
            </span>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 hover:text-white hover:bg-white/5"
              title="Hide panel"
            >
              <FiChevronsRight className="w-3.5 h-3.5" />
              Hide
            </button>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-white hover:bg-white/5"
              onClick={() => setShowTemplate((open) => !open)}
            >
              <span>Part 145 reference</span>
              {showTemplate ? <FiChevronDown /> : <FiChevronRight />}
            </button>
            {showTemplate ? (
              <div className="px-3 pb-3 border-t border-white/10 pt-2">
                <ul>
                  <TemplateBranch node={PART145_ORG_TEMPLATE} />
                </ul>
              </div>
            ) : null}
          </div>

          {selectedPerson ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">{selectedPerson.fullName}</h3>
                  <p className="text-xs text-white/50 mt-0.5">Reporting & card color</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  className="text-white/40 hover:text-white"
                >
                  <FiX />
                </button>
              </div>

              <RosterCardColorPicker
                compact
                value={selectedPerson.cardColor ?? getPersonCardColor(selectedPerson)}
                onChange={async (next) => {
                  try {
                    await onCardColorChange(selectedPerson._id, next);
                    toast.success(next ? "Card color updated" : "Card color cleared");
                  } catch (error: any) {
                    toast.error(error?.message ?? "Failed to update card color");
                  }
                }}
              />

              <RosterReportingEditor
                personId={selectedPerson._id}
                primaryManagerId={selectedPerson.reportsToPersonId ?? ""}
                onPrimaryManagerChange={async (managerId) => {
                  try {
                    await onReparent(selectedPerson._id, managerId || null);
                  } catch (error: any) {
                    toast.error(error?.message ?? "Failed to update primary manager");
                  }
                }}
                additionalLines={selectedLines}
                personnel={personnel}
                compact
                onAddAdditional={(supervisorId, contextLabel) =>
                  onAddFunctionalLine(selectedPerson._id, supervisorId, contextLabel)
                }
                onRemoveAdditional={onRemoveFunctionalLine}
              />
            </div>
          ) : (
            <p className="text-xs text-white/45 px-1 leading-relaxed">
              Click a person on the grid to set their <strong className="text-white/65">primary manager</strong> and
              add <strong className="text-white/65">additional supervisors</strong> (matrix reporting by aircraft or
              crew).
            </p>
          )}
        </aside>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 lg:flex-col lg:self-start lg:py-3"
            title="Show details panel"
          >
            <FiChevronsLeft className="w-4 h-4" />
            <span className="lg:[writing-mode:vertical-rl] lg:rotate-180">Details</span>
          </button>
        )}
      </div>
    </div>
  );
}
