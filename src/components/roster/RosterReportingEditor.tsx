import { useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { Badge, Button } from "../ui";
import type { FunctionalReportingLine } from "./RosterOrgChartCanvas";

type PersonOption = { _id: string; fullName: string; roleTitle?: string };

type Props = {
  personId: string;
  primaryManagerId: string;
  onPrimaryManagerChange: (managerId: string) => void;
  additionalLines: FunctionalReportingLine[];
  personnel: PersonOption[];
  onAddAdditional: (supervisorPersonId: string, contextLabel: string) => Promise<void>;
  onRemoveAdditional: (lineId: string) => Promise<void>;
  compact?: boolean;
};

export function RosterReportingEditor({
  personId,
  primaryManagerId,
  onPrimaryManagerChange,
  additionalLines,
  personnel,
  onAddAdditional,
  onRemoveAdditional,
  compact,
}: Props) {
  const [additionalSupervisorId, setAdditionalSupervisorId] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const managerOptions = personnel.filter((p) => p._id !== personId);
  const usedSupervisorIds = new Set([
    primaryManagerId,
    ...additionalLines.map((line) => line.supervisorPersonId),
  ]);
  const availableAdditional = managerOptions.filter((p) => !usedSupervisorIds.has(p._id));

  const handleAddAdditional = async () => {
    if (!additionalSupervisorId) return;
    const supervisor = personnel.find((p) => p._id === additionalSupervisorId);
    const context =
      additionalContext.trim() ||
      supervisor?.roleTitle?.trim() ||
      supervisor?.fullName ||
      "Additional supervisor";
    try {
      setIsAdding(true);
      await onAddAdditional(additionalSupervisorId, context);
      setAdditionalSupervisorId("");
      setAdditionalContext("");
    } finally {
      setIsAdding(false);
    }
  };

  const labelClass = compact
    ? "text-[11px] uppercase tracking-wide text-white/45 mb-1"
    : "text-xs uppercase tracking-wide text-white/45 mb-1.5";

  const inputClass = compact
    ? "w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
    : "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white";

  return (
    <div className="space-y-3">
      <div>
        <p className={labelClass}>Primary manager</p>
        <select
          value={primaryManagerId}
          onChange={(e) => onPrimaryManagerChange(e.target.value)}
          className={inputClass}
        >
          <option value="">No primary manager</option>
          {managerOptions.map((candidate) => (
            <option key={candidate._id} value={candidate._id}>
              {candidate.fullName}
              {candidate.roleTitle ? ` · ${candidate.roleTitle}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className={labelClass}>Also reports to</p>
        {additionalLines.length === 0 ? (
          <p className="text-xs text-white/45 mb-2">
            Add another supervisor for matrix reporting (e.g. different crew chiefs by aircraft).
          </p>
        ) : (
          <ul className="space-y-1.5 mb-2">
            {additionalLines.map((line) => {
              const supervisor = personnel.find((p) => p._id === line.supervisorPersonId);
              return (
                <li
                  key={line._id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-amber-100/90 truncate">
                      {supervisor?.fullName ?? "Supervisor"}
                    </div>
                    <Badge size="sm" className="mt-1 bg-amber-500/15 text-amber-200 border-amber-500/30">
                      {line.contextLabel}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    className="text-white/40 hover:text-red-300 shrink-0"
                    onClick={() => void onRemoveAdditional(line._id)}
                    title="Remove additional supervisor"
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
            value={additionalSupervisorId}
            onChange={(e) => setAdditionalSupervisorId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select additional supervisor…</option>
            {availableAdditional.map((p) => (
              <option key={p._id} value={p._id}>
                {p.fullName}
                {p.roleTitle ? ` · ${p.roleTitle}` : ""}
              </option>
            ))}
          </select>
          <input
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Label (optional) — e.g. Citation line, King Air"
            className={`${inputClass} placeholder-white/40`}
          />
          <Button
            size="sm"
            icon={<FiPlus className="w-3.5 h-3.5" />}
            disabled={!additionalSupervisorId || isAdding}
            loading={isAdding}
            onClick={() => void handleAddAdditional()}
          >
            Add supervisor
          </Button>
        </div>
      </div>
    </div>
  );
}
