import { useCallback, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiChevronRight, FiRefreshCw, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { ORG_CHART_LEGEND, PART145_ORG_TEMPLATE, type OrgTemplateNode } from "../../data/part145OrgTemplate";
import type { OrgChartNode } from "../../utils/rosterOrganization";
import {
  ORG_NODE_HEIGHT,
  ORG_NODE_WIDTH,
  buildBranchPath,
  buildFunctionalEdges,
  buildPrimaryEdges,
  computeAutoOrgLayout,
  getNodeCenter,
  getOrgCanvasBounds,
  mergeOrgLayoutWithSaved,
  type PlacedOrgNode,
} from "../../utils/orgChartLayout";
import { Badge, Button } from "../ui";

export type FunctionalReportingLine = {
  _id: string;
  subordinatePersonId: string;
  supervisorPersonId: string;
  contextLabel: string;
};

type Props = {
  roots: OrgChartNode[];
  personnel: { _id: string; fullName: string; roleTitle?: string }[];
  reportingLines: FunctionalReportingLine[];
  savedLayouts: { personId: string; x: number; y: number }[];
  onReparent: (personId: string, newManagerId: string | null) => Promise<void>;
  onSaveLayout: (personId: string, x: number, y: number) => Promise<void>;
  onResetLayout: () => Promise<void>;
  onAddFunctionalLine: (subordinatePersonId: string, supervisorPersonId: string, contextLabel: string) => Promise<void>;
  onRemoveFunctionalLine: (lineId: string) => Promise<void>;
};

type DragState = {
  personId: string;
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

function isDescendant(roots: OrgChartNode[], ancestorId: string, personId: string): boolean {
  const findInTree = (node: OrgChartNode): boolean => {
    if (node.person._id === personId) return true;
    return node.children.some(findInTree);
  };

  const findAncestor = (nodes: OrgChartNode[]): OrgChartNode | null => {
    for (const node of nodes) {
      if (node.person._id === ancestorId) return node;
      const found = findAncestor(node.children);
      if (found) return found;
    }
    return null;
  };

  const ancestorNode = findAncestor(roots);
  if (!ancestorNode) return false;
  return findInTree(ancestorNode);
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
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [functionalSupervisorId, setFunctionalSupervisorId] = useState("");
  const [functionalContext, setFunctionalContext] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  const savedByPersonId = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const layout of savedLayouts) {
      map.set(layout.personId, { x: layout.x, y: layout.y });
    }
    for (const [personId, pos] of Object.entries(localPositions)) {
      map.set(personId, pos);
    }
    return map;
  }, [savedLayouts, localPositions]);

  const autoLayout = useMemo(() => computeAutoOrgLayout(roots), [roots]);
  const placedNodes = useMemo(
    () => mergeOrgLayoutWithSaved(autoLayout, savedByPersonId),
    [autoLayout, savedByPersonId],
  );

  const nodeById = useMemo(() => new Map(placedNodes.map((n) => [n.id, n])), [placedNodes]);

  const primaryEdges = useMemo(() => buildPrimaryEdges(roots, nodeById), [roots, nodeById]);
  const functionalEdges = useMemo(
    () => buildFunctionalEdges(reportingLines, nodeById),
    [reportingLines, nodeById],
  );

  const bounds = useMemo(() => getOrgCanvasBounds(placedNodes), [placedNodes]);

  const selectedLines = useMemo(
    () => reportingLines.filter((line) => line.subordinatePersonId === selectedPersonId),
    [reportingLines, selectedPersonId],
  );

  const hitTestNode = useCallback(
    (clientX: number, clientY: number, excludeId?: string): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left + canvas.scrollLeft;
      const y = clientY - rect.top + canvas.scrollTop;

      for (const node of placedNodes) {
        if (node.id === excludeId) continue;
        if (x >= node.x && x <= node.x + ORG_NODE_WIDTH && y >= node.y && y <= node.y + ORG_NODE_HEIGHT) {
          return node.id;
        }
      }
      return null;
    },
    [placedNodes],
  );

  const finishDrag = useCallback(
    async (state: DragState, clientX: number, clientY: number) => {
      const targetId = hitTestNode(clientX, clientY, state.personId);
      const nextX = state.originX + dragOffset.x;
      const nextY = state.originY + dragOffset.y;

      if (targetId && targetId !== state.personId) {
        if (isDescendant(roots, state.personId, targetId)) {
          toast.error("Cannot assign a manager inside this person's own team");
        } else {
          try {
            await onReparent(state.personId, targetId);
            toast.success("Administrative reporting line updated");
            setLocalPositions((prev) => {
              const next = { ...prev };
              delete next[state.personId];
              return next;
            });
          } catch (error: any) {
            toast.error(error?.message ?? "Failed to update reporting line");
          }
        }
      } else {
        try {
          await onSaveLayout(state.personId, nextX, nextY);
          setLocalPositions((prev) => ({ ...prev, [state.personId]: { x: nextX, y: nextY } }));
        } catch (error: any) {
          toast.error(error?.message ?? "Failed to save layout");
        }
      }
    },
    [dragOffset.x, dragOffset.y, hitTestNode, onReparent, onSaveLayout, roots],
  );

  const onPointerDown = (event: React.PointerEvent, node: PlacedOrgNode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
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
    if (!dragState) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    setDragOffset({ x: dx, y: dy });
    setDropTargetId(hitTestNode(event.clientX, event.clientY, dragState.personId));
  };

  const onPointerUp = async (event: React.PointerEvent) => {
    if (!dragState) return;
    await finishDrag(dragState, event.clientX, event.clientY);
    setDragState(null);
    setDropTargetId(null);
    setDragOffset({ x: 0, y: 0 });
  };

  if (roots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-10 px-6 text-center text-sm text-white/55">
        Assign a primary manager to each person (or leave top leaders unassigned) to build the org chart.
        Use functional lines when mechanics report to different crew chiefs by aircraft.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
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
            <span className="text-white/40">· Drag to reposition · Drop on a node to set primary manager</span>
          </div>

          <div
            ref={canvasRef}
            className="relative overflow-auto rounded-xl border border-white/10 bg-[#070d14]/80 p-6 scrollbar-thin"
            style={{ maxHeight: "min(70vh, 720px)" }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <svg
              className="absolute inset-0 pointer-events-none"
              width={bounds.width}
              height={bounds.height}
              style={{ minWidth: bounds.width, minHeight: bounds.height }}
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
                    stroke="rgba(56, 189, 248, 0.55)"
                    strokeWidth={2}
                  />
                );
              })}
              {functionalEdges.map((edge) => {
                const fromNode = nodeById.get(edge.fromId);
                const toNode = nodeById.get(edge.toId);
                if (!fromNode || !toNode) return null;
                const from = getNodeCenter(fromNode);
                const to = getNodeCenter(toNode);
                const path = `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 40} ${to.x} ${to.y}`;
                const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 20 };
                return (
                  <g key={`functional-${edge.fromId}-${edge.toId}-${edge.label}`}>
                    <path
                      d={path}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.65)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                    {edge.label ? (
                      <text x={mid.x} y={mid.y} fill="rgba(251, 191, 36, 0.9)" fontSize={10} textAnchor="middle">
                        {edge.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>

            <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
              {placedNodes.map((node) => {
                const isDragging = dragState?.personId === node.personId;
                const isDropTarget = dropTargetId === node.id;
                const isSelected = selectedPersonId === node.personId;
                const x = isDragging ? node.x + dragOffset.x : node.x;
                const y = isDragging ? node.y + dragOffset.y : node.y;

                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => onPointerDown(e, node)}
                    className={`absolute select-none cursor-grab active:cursor-grabbing rounded-xl border px-3 py-2.5 shadow-lg transition-shadow ${
                      isDropTarget
                        ? "border-emerald-400/60 bg-emerald-500/10 ring-2 ring-emerald-400/30"
                        : isSelected
                          ? "border-sky-400/50 bg-sky-500/15"
                          : "border-white/15 bg-[#0f1724]/95 hover:border-white/25"
                    } ${isDragging ? "z-20 opacity-90" : "z-10"}`}
                    style={{ width: ORG_NODE_WIDTH, height: ORG_NODE_HEIGHT, left: x, top: y }}
                  >
                    <div className="text-sm font-medium text-white truncate">{node.fullName}</div>
                    <div className="text-xs text-white/55 truncate mt-0.5">{node.roleTitle || "No title"}</div>
                    {node.department ? (
                      <div className="text-[10px] text-sky-200/70 truncate mt-1">{node.department}</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
                  toast.success("Org chart layout reset to auto");
                } catch (error: any) {
                  toast.error(error?.message ?? "Failed to reset layout");
                } finally {
                  setIsResetting(false);
                }
              }}
            >
              Reset layout
            </Button>
          </div>
        </div>

        <aside className="w-full lg:w-80 shrink-0 space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-white hover:bg-white/5"
              onClick={() => setShowTemplate((open) => !open)}
            >
              <span>Part 145 reference chart</span>
              {showTemplate ? <FiChevronDown /> : <FiChevronRight />}
            </button>
            {showTemplate ? (
              <div className="px-3 pb-3 border-t border-white/10 pt-2">
                <p className="text-[11px] text-white/45 mb-2">
                  Typical repair station branches (administrative). Your functional lines can differ by aircraft or crew.
                </p>
                <ul>
                  <TemplateBranch node={PART145_ORG_TEMPLATE} />
                </ul>
              </div>
            ) : null}
          </div>

          {selectedPersonId ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white">Selected member</h3>
                  <p className="text-xs text-white/55 mt-0.5">
                    {personnel.find((p) => p._id === selectedPersonId)?.fullName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  className="text-white/40 hover:text-white"
                >
                  <FiX />
                </button>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wide text-white/45 mb-2">
                  Functional lines (aircraft / crew)
                </p>
                {selectedLines.length === 0 ? (
                  <p className="text-xs text-white/45 mb-2">No extra supervisors for specific programs yet.</p>
                ) : (
                  <ul className="space-y-1.5 mb-2">
                    {selectedLines.map((line) => {
                      const supervisor = personnel.find((p) => p._id === line.supervisorPersonId);
                      return (
                        <li
                          key={line._id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="text-xs text-amber-100/90 truncate">
                              → {supervisor?.fullName ?? "Supervisor"}
                            </div>
                            <Badge size="sm" className="mt-1 bg-amber-500/15 text-amber-200 border-amber-500/30">
                              {line.contextLabel}
                            </Badge>
                          </div>
                          <button
                            type="button"
                            className="text-white/40 hover:text-red-300 shrink-0"
                            onClick={() => void onRemoveFunctionalLine(line._id)}
                            title="Remove functional line"
                          >
                            <FiX className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="space-y-2">
                  <select
                    value={functionalSupervisorId}
                    onChange={(e) => setFunctionalSupervisorId(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="">Also reports to (crew chief / lead)…</option>
                    {personnel
                      .filter((p) => p._id !== selectedPersonId)
                      .map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.fullName}
                          {p.roleTitle ? ` · ${p.roleTitle}` : ""}
                        </option>
                      ))}
                  </select>
                  <input
                    value={functionalContext}
                    onChange={(e) => setFunctionalContext(e.target.value)}
                    placeholder="Context — e.g. Citation line, King Air crew"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white placeholder-white/40"
                  />
                  <Button
                    size="sm"
                    disabled={!functionalSupervisorId || !functionalContext.trim()}
                    onClick={async () => {
                      try {
                        await onAddFunctionalLine(
                          selectedPersonId,
                          functionalSupervisorId,
                          functionalContext.trim(),
                        );
                        setFunctionalSupervisorId("");
                        setFunctionalContext("");
                        toast.success("Functional reporting line added");
                      } catch (error: any) {
                        toast.error(error?.message ?? "Failed to add functional line");
                      }
                    }}
                  >
                    Add functional line
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/45 px-1">
              Select a node to add functional reporting — for mechanics who report to different crew chiefs by aircraft.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
