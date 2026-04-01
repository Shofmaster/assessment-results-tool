import { useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiEdit2, FiPlus, FiTrash2, FiUsers } from "react-icons/fi";
import { toast } from "sonner";
import { useAppStore } from "../store/appStore";
import { useFocusViewHeading } from "../hooks/useFocusViewHeading";
import {
  useAddRosterAssignment,
  useAddRosterPerson,
  useAddRosterRequirementType,
  useRemoveRosterAssignment,
  useRemoveRosterPerson,
  useRemoveRosterRequirementType,
  useRosterAssignments,
  useRosterDashboard,
  useRosterPersonnel,
  useRosterRequirementTypes,
  useUpdateRosterAssignment,
  useUpdateRosterPerson,
  useUpdateRosterRequirementType,
} from "../hooks/useConvexData";
import { Badge, Button, GlassCard, Select } from "./ui";

const CAPABILITY_PRESETS = ["RII", "Inspector", "RTS"];

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

export default function Roster() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const requirements = (useRosterRequirementTypes(activeProjectId ?? undefined) ?? []) as any[];
  const personnel = (useRosterPersonnel(activeProjectId ?? undefined) ?? []) as any[];
  const assignments = (useRosterAssignments(activeProjectId ?? undefined) ?? []) as any[];

  const [dashboardCapability, setDashboardCapability] = useState("");
  const dashboard = useRosterDashboard(activeProjectId ?? undefined, dashboardCapability || undefined) as any;

  const addRequirement = useAddRosterRequirementType();
  const updateRequirement = useUpdateRosterRequirementType();
  const removeRequirement = useRemoveRosterRequirementType();
  const addPerson = useAddRosterPerson();
  const updatePerson = useUpdateRosterPerson();
  const removePerson = useRemoveRosterPerson();
  const addAssignment = useAddRosterAssignment();
  const updateAssignment = useUpdateRosterAssignment();
  const removeAssignment = useRemoveRosterAssignment();

  const [reqName, setReqName] = useState("");
  const [reqCategory, setReqCategory] = useState("");
  const [reqRecurrence, setReqRecurrence] = useState("");
  const [reqGrace, setReqGrace] = useState("");

  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [personJobDescription, setPersonJobDescription] = useState("");
  const [personCapabilities, setPersonCapabilities] = useState<string[]>([]);
  const [personCustomCaps, setPersonCustomCaps] = useState("");

  const [assignmentPersonId, setAssignmentPersonId] = useState("");
  const [assignmentRequirementId, setAssignmentRequirementId] = useState("");
  const [assignmentAssignedDate, setAssignmentAssignedDate] = useState("");
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentLastCompletedDate, setAssignmentLastCompletedDate] = useState("");
  const [assignmentRecurrenceOverride, setAssignmentRecurrenceOverride] = useState("");
  const [assignmentGraceOverride, setAssignmentGraceOverride] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");

  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [editingRequirement, setEditingRequirement] = useState({
    name: "",
    category: "",
    recurrenceDays: "",
    graceDays: "",
  });

  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState({
    fullName: "",
    roleTitle: "",
    jobDescription: "",
    capabilities: "",
  });

  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState({
    dueDate: "",
    recurrenceDaysOverride: "",
    graceDaysOverride: "",
    notes: "",
  });

  const peopleById = useMemo(() => {
    return new Map(personnel.map((person) => [person._id, person]));
  }, [personnel]);

  const requirementsById = useMemo(() => {
    return new Map(requirements.map((req) => [req._id, req]));
  }, [requirements]);

  const dashboardRows = dashboard?.rows ?? { upToDate: [], due30Days: [], expired: [] };
  const dashboardCounts = dashboard?.counts ?? { upToDate: 0, due30Days: 0, expired: 0 };

  const handleAddRequirement = async () => {
    if (!activeProjectId || !reqName.trim()) return;
    try {
      await addRequirement({
        projectId: activeProjectId as any,
        name: reqName.trim(),
        category: reqCategory.trim() || undefined,
        defaultRecurrenceDays: reqRecurrence ? Number(reqRecurrence) : undefined,
        defaultGraceDays: reqGrace ? Number(reqGrace) : undefined,
      });
      setReqName("");
      setReqCategory("");
      setReqRecurrence("");
      setReqGrace("");
      toast.success("Requirement type added");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add requirement type");
    }
  };

  const handleAddPerson = async () => {
    if (!activeProjectId || !personName.trim()) return;
    const customCaps = personCustomCaps
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const capabilities = Array.from(new Set([...personCapabilities, ...customCaps]));
    try {
      await addPerson({
        projectId: activeProjectId as any,
        fullName: personName.trim(),
        roleTitle: personRole.trim() || undefined,
        jobDescription: personJobDescription.trim() || undefined,
        capabilities,
      });
      setPersonName("");
      setPersonRole("");
      setPersonJobDescription("");
      setPersonCapabilities([]);
      setPersonCustomCaps("");
      toast.success("Person added to roster");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add person");
    }
  };

  const handleAddAssignment = async () => {
    if (!activeProjectId || !assignmentPersonId || !assignmentRequirementId) return;
    try {
      await addAssignment({
        projectId: activeProjectId as any,
        personId: assignmentPersonId as any,
        requirementTypeId: assignmentRequirementId as any,
        assignedDate: assignmentAssignedDate || undefined,
        dueDate: assignmentDueDate || undefined,
        lastCompletedDate: assignmentLastCompletedDate || undefined,
        recurrenceDaysOverride: assignmentRecurrenceOverride ? Number(assignmentRecurrenceOverride) : undefined,
        graceDaysOverride: assignmentGraceOverride ? Number(assignmentGraceOverride) : undefined,
        notes: assignmentNotes.trim() || undefined,
      });
      setAssignmentPersonId("");
      setAssignmentRequirementId("");
      setAssignmentAssignedDate("");
      setAssignmentDueDate("");
      setAssignmentLastCompletedDate("");
      setAssignmentRecurrenceOverride("");
      setAssignmentGraceOverride("");
      setAssignmentNotes("");
      toast.success("Assignment created");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add assignment");
    }
  };

  const startRequirementEdit = (req: any) => {
    setEditingRequirementId(req._id);
    setEditingRequirement({
      name: req.name ?? "",
      category: req.category ?? "",
      recurrenceDays: req.defaultRecurrenceDays?.toString() ?? "",
      graceDays: req.defaultGraceDays?.toString() ?? "",
    });
  };

  const saveRequirementEdit = async () => {
    if (!editingRequirementId || !editingRequirement.name.trim()) return;
    try {
      await updateRequirement({
        requirementTypeId: editingRequirementId as any,
        name: editingRequirement.name.trim(),
        category: editingRequirement.category.trim() || undefined,
        defaultRecurrenceDays: editingRequirement.recurrenceDays ? Number(editingRequirement.recurrenceDays) : undefined,
        defaultGraceDays: editingRequirement.graceDays ? Number(editingRequirement.graceDays) : undefined,
      });
      setEditingRequirementId(null);
      toast.success("Requirement updated");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update requirement");
    }
  };

  const startPersonEdit = (person: any) => {
    setEditingPersonId(person._id);
    setEditingPerson({
      fullName: person.fullName ?? "",
      roleTitle: person.roleTitle ?? "",
      jobDescription: person.jobDescription ?? "",
      capabilities: (person.capabilities ?? []).join(", "),
    });
  };

  const savePersonEdit = async () => {
    if (!editingPersonId || !editingPerson.fullName.trim()) return;
    const capabilities = editingPerson.capabilities
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      await updatePerson({
        personId: editingPersonId as any,
        fullName: editingPerson.fullName.trim(),
        roleTitle: editingPerson.roleTitle.trim() || undefined,
        jobDescription: editingPerson.jobDescription.trim() || undefined,
        capabilities,
      });
      setEditingPersonId(null);
      toast.success("Person updated");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update person");
    }
  };

  const startAssignmentEdit = (assignment: any) => {
    setEditingAssignmentId(assignment._id);
    setEditingAssignment({
      dueDate: assignment.dueDate ?? "",
      recurrenceDaysOverride: assignment.recurrenceDaysOverride?.toString() ?? "",
      graceDaysOverride: assignment.graceDaysOverride?.toString() ?? "",
      notes: assignment.notes ?? "",
    });
  };

  const saveAssignmentEdit = async () => {
    if (!editingAssignmentId) return;
    try {
      await updateAssignment({
        assignmentId: editingAssignmentId as any,
        dueDate: editingAssignment.dueDate || undefined,
        recurrenceDaysOverride: editingAssignment.recurrenceDaysOverride
          ? Number(editingAssignment.recurrenceDaysOverride)
          : undefined,
        graceDaysOverride: editingAssignment.graceDaysOverride
          ? Number(editingAssignment.graceDaysOverride)
          : undefined,
        notes: editingAssignment.notes.trim() || undefined,
      });
      setEditingAssignmentId(null);
      toast.success("Assignment updated");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update assignment");
    }
  };

  const handleRecordCompletionToday = async (assignmentId: string) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      await updateAssignment({
        assignmentId: assignmentId as any,
        lastCompletedDate: today,
      });
      toast.success("Completion recorded for today");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record completion");
    }
  };

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full min-h-0">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60">Pick or create a project to manage roster qualifications.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 flex flex-col gap-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Personnel Roster
        </h1>
        <p className="text-white/60 text-lg">
          Track custom requirements, recurrent due dates, and capabilities like RII, Inspector, RTS.
        </p>
      </div>

      <GlassCard>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Compliance Dashboard</h2>
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
              {Array.from(
                new Set(personnel.flatMap((person: any) => person.capabilities ?? []))
              ).map((capability) => (
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
                  {column.rows.map((row: any) => (
                    <li key={row.assignmentId} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-white truncate">{row.personName}</div>
                        <Badge size="sm" className={statusBadgeClass(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-white/65 mt-1">{row.requirementName}</div>
                      <div className="text-xs text-white/50 mt-1">
                        Due: {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "Not set"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <GlassCard>
          <h2 className="text-lg font-semibold text-white mb-3">Requirement Types</h2>
          <div className="space-y-2 mb-3">
            <input
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              placeholder="Requirement name"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <input
              value={reqCategory}
              onChange={(e) => setReqCategory(e.target.value)}
              placeholder="Category (optional)"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={reqRecurrence}
                onChange={(e) => setReqRecurrence(e.target.value)}
                placeholder="Recurrence days"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
              />
              <input
                type="number"
                value={reqGrace}
                onChange={(e) => setReqGrace(e.target.value)}
                placeholder="Grace days"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
              />
            </div>
            <Button size="sm" icon={<FiPlus className="w-3.5 h-3.5" />} onClick={handleAddRequirement} disabled={!reqName.trim()}>
              Add Requirement
            </Button>
          </div>
          <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {requirements.map((req) => (
              <li key={req._id} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                {editingRequirementId === req._id ? (
                  <div className="space-y-2">
                    <input
                      value={editingRequirement.name}
                      onChange={(e) => setEditingRequirement((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={editingRequirement.category}
                      onChange={(e) => setEditingRequirement((prev) => ({ ...prev, category: e.target.value }))}
                      placeholder="Category"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={editingRequirement.recurrenceDays}
                        onChange={(e) => setEditingRequirement((prev) => ({ ...prev, recurrenceDays: e.target.value }))}
                        placeholder="Recurrence"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      />
                      <input
                        type="number"
                        value={editingRequirement.graceDays}
                        onChange={(e) => setEditingRequirement((prev) => ({ ...prev, graceDays: e.target.value }))}
                        placeholder="Grace"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveRequirementEdit}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingRequirementId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-white font-medium">{req.name}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startRequirementEdit(req)}
                          className="text-white/40 hover:text-sky-200 transition-colors"
                          title="Edit requirement"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRequirement({ requirementTypeId: req._id as any })}
                          className="text-white/35 hover:text-red-300 transition-colors"
                          title="Delete requirement"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-white/60">
                      {req.category || "Uncategorized"} · Recurs {req.defaultRecurrenceDays ?? "-"}d · Grace {req.defaultGraceDays ?? 0}d
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard>
          <h2 className="text-lg font-semibold text-white mb-3">Personnel</h2>
          <div className="space-y-2 mb-3">
            <input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <input
              value={personRole}
              onChange={(e) => setPersonRole(e.target.value)}
              placeholder="Role / title"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <input
              value={personJobDescription}
              onChange={(e) => setPersonJobDescription(e.target.value)}
              placeholder="Job description"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_PRESETS.map((capability) => (
                <button
                  key={capability}
                  type="button"
                  onClick={() =>
                    setPersonCapabilities((prev) =>
                      prev.includes(capability)
                        ? prev.filter((value) => value !== capability)
                        : [...prev, capability]
                    )
                  }
                  className={`px-2.5 py-1 rounded border text-xs transition-colors ${
                    personCapabilities.includes(capability)
                      ? "bg-sky-500/20 text-sky-lighter border-sky-500/40"
                      : "bg-white/5 text-white/70 border-white/15"
                  }`}
                >
                  {capability}
                </button>
              ))}
            </div>
            <input
              value={personCustomCaps}
              onChange={(e) => setPersonCustomCaps(e.target.value)}
              placeholder="Custom capabilities (comma separated)"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <Button size="sm" icon={<FiUsers className="w-3.5 h-3.5" />} onClick={handleAddPerson} disabled={!personName.trim()}>
              Add Person
            </Button>
          </div>
          <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {personnel.map((person) => (
              <li key={person._id} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                {editingPersonId === person._id ? (
                  <div className="space-y-2">
                    <input
                      value={editingPerson.fullName}
                      onChange={(e) => setEditingPerson((prev) => ({ ...prev, fullName: e.target.value }))}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={editingPerson.roleTitle}
                      onChange={(e) => setEditingPerson((prev) => ({ ...prev, roleTitle: e.target.value }))}
                      placeholder="Role title"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={editingPerson.jobDescription}
                      onChange={(e) => setEditingPerson((prev) => ({ ...prev, jobDescription: e.target.value }))}
                      placeholder="Job description"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <input
                      value={editingPerson.capabilities}
                      onChange={(e) => setEditingPerson((prev) => ({ ...prev, capabilities: e.target.value }))}
                      placeholder="Capabilities comma separated"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={savePersonEdit}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPersonId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-white font-medium">{person.fullName}</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startPersonEdit(person)}
                          className="text-white/40 hover:text-sky-200 transition-colors"
                          title="Edit person"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePerson({ personId: person._id as any })}
                          className="text-white/35 hover:text-red-300 transition-colors"
                          title="Delete person"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-white/60">{person.roleTitle || "No role title"}</div>
                    <div className="text-xs text-white/50 mt-1">{person.jobDescription || "No job description"}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(person.capabilities ?? []).map((capability: string) => (
                        <Badge key={capability} size="sm">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard>
          <h2 className="text-lg font-semibold text-white mb-3">Assignments</h2>
          <div className="space-y-2 mb-3">
            <Select
              label="Person"
              value={assignmentPersonId}
              onChange={(e) => setAssignmentPersonId(e.target.value)}
              selectSize="sm"
            >
              <option value="">Select person</option>
              {personnel.map((person) => (
                <option key={person._id} value={person._id}>
                  {person.fullName}
                </option>
              ))}
            </Select>
            <Select
              label="Requirement"
              value={assignmentRequirementId}
              onChange={(e) => setAssignmentRequirementId(e.target.value)}
              selectSize="sm"
            >
              <option value="">Select requirement</option>
              {requirements.map((req) => (
                <option key={req._id} value={req._id}>
                  {req.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={assignmentAssignedDate}
                onChange={(e) => setAssignmentAssignedDate(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              />
              <input
                type="date"
                value={assignmentDueDate}
                onChange={(e) => setAssignmentDueDate(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={assignmentLastCompletedDate}
                onChange={(e) => setAssignmentLastCompletedDate(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              />
              <input
                type="number"
                value={assignmentRecurrenceOverride}
                onChange={(e) => setAssignmentRecurrenceOverride(e.target.value)}
                placeholder="Override recurrence days"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
              />
            </div>
            <input
              type="number"
              value={assignmentGraceOverride}
              onChange={(e) => setAssignmentGraceOverride(e.target.value)}
              placeholder="Override grace days"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <input
              value={assignmentNotes}
              onChange={(e) => setAssignmentNotes(e.target.value)}
              placeholder="Notes"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <Button
              size="sm"
              icon={<FiPlus className="w-3.5 h-3.5" />}
              onClick={handleAddAssignment}
              disabled={!assignmentPersonId || !assignmentRequirementId}
            >
              Add Assignment
            </Button>
          </div>
          <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {assignments.length === 0 && (
              <li className="text-xs text-white/50">No assignments yet.</li>
            )}
            {assignments.map((assignment) => {
              const person = peopleById.get(assignment.personId);
              const req = requirementsById.get(assignment.requirementTypeId);
              const status =
                dashboardRows.expired.find((row: any) => row.assignmentId === assignment._id)?.status ??
                dashboardRows.due30Days.find((row: any) => row.assignmentId === assignment._id)?.status ??
                "up_to_date";
              return (
                <li key={assignment._id} className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  {editingAssignmentId === assignment._id ? (
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={editingAssignment.dueDate}
                        onChange={(e) => setEditingAssignment((prev) => ({ ...prev, dueDate: e.target.value }))}
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={editingAssignment.recurrenceDaysOverride}
                          onChange={(e) =>
                            setEditingAssignment((prev) => ({ ...prev, recurrenceDaysOverride: e.target.value }))
                          }
                          placeholder="Recurrence override"
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                        />
                        <input
                          type="number"
                          value={editingAssignment.graceDaysOverride}
                          onChange={(e) =>
                            setEditingAssignment((prev) => ({ ...prev, graceDaysOverride: e.target.value }))
                          }
                          placeholder="Grace override"
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                        />
                      </div>
                      <input
                        value={editingAssignment.notes}
                        onChange={(e) => setEditingAssignment((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Notes"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveAssignmentEdit}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingAssignmentId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-white font-medium truncate">
                          {person?.fullName ?? "Unknown person"}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startAssignmentEdit(assignment)}
                            className="text-white/40 hover:text-sky-200 transition-colors"
                            title="Edit assignment"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAssignment({ assignmentId: assignment._id as any })}
                            className="text-white/35 hover:text-red-300 transition-colors"
                            title="Delete assignment"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-white/60">{req?.name ?? "Unknown requirement"}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge size="sm" className={statusBadgeClass(status)}>
                          {statusLabel(status)}
                        </Badge>
                        <span className="text-xs text-white/50">
                          Due {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : "not set"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRecordCompletionToday(assignment._id)}
                          className="!px-2 !py-1 !text-xs"
                        >
                          Record completion today
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </GlassCard>
      </div>

      {(requirements.length === 0 || personnel.length === 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm flex items-center gap-2">
          <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
          Add at least one requirement type and one person before creating assignments.
        </div>
      )}
    </div>
  );
}
