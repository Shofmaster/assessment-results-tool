import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useRosterDashboard, useRosterPersonnel } from "../../hooks/useConvexData";
import { Badge, GlassCard, Select } from "../ui";

function statusBadgeClass(status: string): string {
  if (status === "expired") return "bg-red-500/20 text-red-300 border-red-500/30";
  if (status === "due_30_days") return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-green-500/20 text-green-300 border-green-500/30";
}

function statusLabel(status: string): string {
  if (status === "expired") return "Expired";
  if (status === "due_30_days") return "Due in 30 Days";
  return "Up to Date";
}

/**
 * Personnel qualification overview: up to date, due in 30 days, expired (grace-aware), with optional capability filter.
 */
export default function RosterComplianceDashboard() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const personnel = (useRosterPersonnel(activeProjectId ?? undefined) ?? []) as any[];
  const [dashboardCapability, setDashboardCapability] = useState("");
  const [selectedDashboardPersonId, setSelectedDashboardPersonId] = useState<string | null>(null);
  const dashboard = useRosterDashboard(activeProjectId ?? undefined, dashboardCapability || undefined) as any;

  const dashboardRows = dashboard?.rows ?? { upToDate: [], due30Days: [], expired: [] };
  const dashboardCounts = dashboard?.counts ?? { upToDate: 0, due30Days: 0, expired: 0 };

  if (!activeProjectId) return null;

  return (
    <GlassCard>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Personnel qualifications</h2>
          <p className="text-sm text-white/60">Who is up to date, due in 30 days, and expired.</p>
        </div>
        <div className="w-full sm:w-60">
          <Select
            label="Filter by capability"
            value={dashboardCapability}
            onChange={(e) => setDashboardCapability(e.target.value)}
            selectSize="sm"
          >
            <option value="">All capabilities</option>
            {Array.from(new Set(personnel.flatMap((person: any) => person.capabilities ?? []))).map((capability) => (
              <option key={capability} value={capability}>
                {capability}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border border-green-500/25 bg-green-500/10 p-4">
          <div className="text-xs text-green-200/80 uppercase tracking-wide">Up to Date</div>
          <div className="text-3xl font-display font-bold text-green-300">{dashboardCounts.upToDate}</div>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="text-xs text-amber-200/80 uppercase tracking-wide">Due in 30 Days</div>
          <div className="text-3xl font-display font-bold text-amber-300">{dashboardCounts.due30Days}</div>
        </div>
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4">
          <div className="text-xs text-red-200/80 uppercase tracking-wide">Expired</div>
          <div className="text-3xl font-display font-bold text-red-300">{dashboardCounts.expired}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: "Up to Date", rows: dashboardRows.upToDate },
          { title: "Due in 30 Days", rows: dashboardRows.due30Days },
          { title: "Expired", rows: dashboardRows.expired },
        ].map((column) => (
          <div key={column.title} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <h3 className="text-sm font-semibold text-white mb-2">{column.title}</h3>
            {column.rows.length === 0 ? (
              <p className="text-xs text-white/50">No records</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
                {column.rows.map((row: any) => {
                  const isSelected = selectedDashboardPersonId === row.personId;
                  return (
                    <li
                      key={row.personId}
                      className={`rounded-lg border bg-white/5 p-2.5 cursor-pointer transition-colors ${
                        isSelected ? "border-sky-400/50 bg-sky-500/10" : "border-white/10"
                      }`}
                      onClick={() =>
                        setSelectedDashboardPersonId((prev) => (prev === row.personId ? null : row.personId))
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-white truncate">{row.personName}</div>
                        <Badge size="sm" className={statusBadgeClass(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-white/60 mt-1">{row.roleTitle || "No role title"}</div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {row.summary?.expired ? (
                          <Badge size="sm" className="bg-red-500/20 text-red-300 border-red-500/30">
                            {row.summary.expired} expired
                          </Badge>
                        ) : null}
                        {row.summary?.due_30_days ? (
                          <Badge size="sm" className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                            {row.summary.due_30_days} due soon
                          </Badge>
                        ) : null}
                        {row.summary?.up_to_date ? (
                          <Badge size="sm" className="bg-green-500/20 text-green-300 border-green-500/30">
                            {row.summary.up_to_date} up to date
                          </Badge>
                        ) : null}
                      </div>
                      {isSelected ? (
                        <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-1.5">
                          {(row.qualifications ?? []).map((qualification: any) => (
                            <div
                              key={qualification.assignmentId}
                              className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-white/85 truncate">{qualification.requirementName}</div>
                                <Badge size="sm" className={statusBadgeClass(qualification.status)}>
                                  {statusLabel(qualification.status)}
                                </Badge>
                              </div>
                              <div className="text-[11px] text-white/50 mt-0.5">
                                Due:{" "}
                                {qualification.dueDate
                                  ? new Date(qualification.dueDate).toLocaleDateString()
                                  : "Not set"}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
