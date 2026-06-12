import { useMemo, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiRefreshCw, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { ORG_CHART_LEGEND, PART145_ORG_TEMPLATE, type OrgTemplateNode } from "../../data/part145OrgTemplate";
import type { OrgChartNode, RosterPersonRow } from "../../utils/rosterOrganization";
import {
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  ORG_SLOT_HEIGHT,
  ORG_SLOT_WIDTH,
  buildBranchPath,
  buildFunctionalEdges,
  buildFunctionalQuadraticPath,
  buildPrimaryEdges,
  computeGridOrgLayout,
  getNodeCenter,
  getOrgCanvasBounds,
  mergeOrgLayoutWithSaved,
  orgChartGridBackgroundStyle,
  resolveFunctionalControlPoint,
  snapPointToOrgGrid,
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
};

type Props = {
  roots: OrgChartNode[];
  personnel: RosterPersonRow[];
  reportingLines: FunctionalReportingLine[];
  savedLayouts: { personId: string; x: number; y: number }[];
  onReparent: (personId: string, newManagerId: string | null) => Promise<void>;
  onSaveLayout: (personId: string, x: number, y: number) => Promise<void>;
  onResetLayout: () => Promise<void>;
  onAddFunctionalLine: (subordinatePersonId: string, supervisorPersonId: string, contextLabel: string) => Promise<void>;
  onRemoveFunctionalLine: (lineId: string) => Promise<void>;
  onSaveFunctionalLinePath: (lineId: string, pathControlX: number, pathControlY: number) => Promise<void>;
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

type LineControlDragState = {
  lineId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

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
  onReparent,
  onSaveLayout,
  onResetLayout,
  onAddFunctionalLine,
  onRemoveFunctionalLine,
  onSaveFunctionalLinePath,
  getPersonCardColor,
  onCardColorChange,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [lineControlDrag, setLineControlDrag] = useState<LineControlDragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [lineControlOffset, setLineControlOffset] = useState({ x: 0, y: 0 });
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [localLineControls, setLocalLineControls] = useState<Record<string, { x: number; y: number }>>({});
  const [isResetting, setIsResetting] = useState(false);

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

  const savedLineControls = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const line of reportingLines) {
      if (line.pathControlX === undefined || line.pathControlY === undefined) continue;
      map.set(line._id, { x: line.pathControlX, y: line.pathControlY });
    }
    for (const [lineId, pos] of Object.entries(localLineControls)) {
      map.set(lineId, pos);
    }
    return map;
  }, [reportingLines, localLineControls]);

  const functionalLineGeometry = useMemo(() => {
    return functionalEdges
      .map((edge, index) => {
        if (!edge.lineId) return null;
        const fromNode = nodeById.get(edge.fromId);
        const toNode = nodeById.get(edge.toId);
        if (!fromNode || !toNode) return null;
        const from = getNodeCenter(fromNode);
        const to = getNodeCenter(toNode);
        const saved = savedLineControls.get(edge.lineId);
        const control = saved ?? resolveFunctionalControlPoint(from, to, edge, index);
        return {
          edge,
          from,
          to,
          control,
          path: buildFunctionalQuadraticPath(from, to, control),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [functionalEdges, nodeById, savedLineControls]);

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
    if (event.button !== 0 || lineControlDrag) return;
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
    if (lineControlDrag) {
      setLineControlOffset({
        x: event.clientX - lineControlDrag.startX,
        y: event.clientY - lineControlDrag.startY,
      });
      return;
    }
    if (!dragState) return;
    setDragOffset({
      x: event.clientX - dragState.startX,
      y: event.clientY - dragState.startY,
    });
  };

  const finishLineControlDrag = async (state: LineControlDragState) => {
    const next = {
      x: state.originX + lineControlOffset.x,
      y: state.originY + lineControlOffset.y,
    };
    try {
      await onSaveFunctionalLinePath(state.lineId, next.x, next.y);
      setLocalLineControls((prev) => ({ ...prev, [state.lineId]: next }));
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save line route");
    }
  };

  const onPointerUp = async () => {
    if (lineControlDrag) {
      await finishLineControlDrag(lineControlDrag);
      setLineControlDrag(null);
      setLineControlOffset({ x: 0, y: 0 });
      return;
    }
    if (!dragState) return;
    await finishDrag(dragState);
    setDragState(null);
    setDragOffset({ x: 0, y: 0 });
  };

  const onLineControlPointerDown = (
    event: React.PointerEvent,
    lineId: string,
    control: { x: number; y: number },
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    setLineControlDrag({
      lineId,
      startX: event.clientX,
      startY: event.clientY,
      originX: control.x,
      originY: control.y,
    });
    setLineControlOffset({ x: 0, y: 0 });
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
              Drag amber dots to route additional supervisor lines · drag cards into grid slots · set managers in the panel →
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
              {primaryEdges.map((edge) => {
                const fromNode = nodeById.get(edge.fromId);
                const toNode = nodeById.get(edge.toId);
                if (!fromNode || !toNode) return null;
                const from = getNodeCenter(fromNode);
                const to = getNodeCenter(toNode);
                from.y += ORG_NODE_HEIGHT / 2;
                to.y -= ORG_NODE_HEIGHT / 2;
                return (
                  <path
                    key={`primary-${edge.fromId}-${edge.toId}`}
                    d={buildBranchPath(from, to)}
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.5)"
                    strokeWidth={1.75}
                  />
                );
              })}
              {functionalLineGeometry.map(({ edge, from, to, control, path }) => {
                const isDragging = lineControlDrag?.lineId === edge.lineId;
                const dragControl = isDragging
                  ? {
                      x: control.x + lineControlOffset.x,
                      y: control.y + lineControlOffset.y,
                    }
                  : control;
                const displayPath = isDragging
                  ? buildFunctionalQuadraticPath(from, to, dragControl)
                  : path;
                return (
                  <g key={`functional-${edge.lineId}`}>
                    <path
                      d={displayPath}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.55)"
                      strokeWidth={1.75}
                      strokeDasharray="5 4"
                    />
                    {edge.label ? (
                      <text
                        x={dragControl.x}
                        y={dragControl.y - 8}
                        fill="rgba(251, 191, 36, 0.85)"
                        fontSize={9}
                        textAnchor="middle"
                      >
                        {edge.label}
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
              {functionalLineGeometry.map(({ edge, control }) => {
                if (!edge.lineId) return null;
                const isDragging = lineControlDrag?.lineId === edge.lineId;
                const dragControl = isDragging
                  ? {
                      x: control.x + lineControlOffset.x,
                      y: control.y + lineControlOffset.y,
                    }
                  : control;
                return (
                  <g key={`functional-handle-${edge.lineId}`} style={{ pointerEvents: "all" }}>
                    <circle
                      cx={dragControl.x}
                      cy={dragControl.y}
                      r={10}
                      fill="transparent"
                      onPointerDown={(event) => onLineControlPointerDown(event, edge.lineId!, control)}
                    />
                    <circle
                      cx={dragControl.x}
                      cy={dragControl.y}
                      r={5}
                      fill="rgba(251, 191, 36, 0.85)"
                      stroke="rgba(15, 23, 42, 0.95)"
                      strokeWidth={1.5}
                      className={isDragging ? "cursor-grabbing" : "cursor-grab"}
                      onPointerDown={(event) => onLineControlPointerDown(event, edge.lineId!, control)}
                    />
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
                setLocalLineControls({});
                toast.success("Reset org chart layout and supervisor line routes");
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

        <aside className="w-full lg:w-80 shrink-0 space-y-3">
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
      </div>
    </div>
  );
}
