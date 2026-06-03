import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertTriangle, FiArrowRight, FiEdit2, FiPlus, FiTrash2, FiUsers } from "react-icons/fi";
import { toast } from "sonner";
import { useAppStore } from "../store/appStore";
import { useFocusViewHeading } from "../hooks/useFocusViewHeading";
import {
  useAddRosterAssignment,
  useAddRosterPerson,
  useAddRosterRequirementType,
  useProject,
  useRemoveRosterAssignment,
  useRemoveRosterPerson,
  useRemoveRosterRequirementType,
  useRosterAssignments,
  useRosterDashboard,
  useRosterPersonnel,
  useRosterRequirementTypes,
  useMigrateRosterQualificationRules,
  useUpdateRosterAssignment,
  useUpdateRosterPerson,
  useUpdateRosterRequirementType,
} from "../hooks/useConvexData";
import { Badge, Button, GlassCard, Select } from "./ui";
import { statusBadgeClass, statusLabel } from "../utils/rosterStatus";

const CAPABILITY_GROUPS = [
  {
    label: "Authorizations & Sign-off",
    capabilities: [
      "RII",
      "Inspector",
      "RTS",
      "A&P Mechanic",
      "Inspection Authorization (IA)",
      "DOM Authorization",
    ],
  },
  {
    label: "Maintenance Disciplines",
    capabilities: [
      "Line Maintenance",
      "Base Maintenance",
      "Airframe Technician",
      "Powerplant Technician",
      "Avionics Technician",
      "Electrical Systems",
      "Structures Technician",
      "Sheet Metal Repair",
      "Composite Repair",
      "Cabin Interiors",
      "Landing Gear",
      "Fuel Systems",
      "Hydraulics",
      "Pneumatics",
      "Propeller Maintenance",
      "Engine Borescope",
      "Engine Run",
      "Taxi Qualified",
      "Ground Support Equipment",
    ],
  },
  {
    label: "Inspection & Quality",
    capabilities: [
      "NDT Level I",
      "NDT Level II",
      "NDT Level III",
      "Parts Inspection",
      "Stores / Receiving Inspection",
      "Quality Assurance",
      "Internal Auditor",
      "Calibration Coordinator",
      "Technical Records",
    ],
  },
  {
    label: "Compliance & Programs",
    capabilities: [
      "SMS",
      "EWIS",
      "Human Factors",
      "HazMat / Dangerous Goods",
      "RVSM",
      "Pitot-Static / Transponder",
      "Weight & Balance",
      "Planning / Production Control",
      "Reliability Program",
      "Tool Control",
      "Training Instructor",
      "Welding",
      "Machining",
    ],
  },
  {
    label: "Pilot & Flight Ops Currency",
    capabilities: [
      "Pilot (PIC)",
      "Instrument Rated Pilot",
      "Flight Instructor (CFI)",
    ],
  },
] as const;

function formatRequirementRecurrence(req: any): string {
  const strat = req.dueDateStrategy;
  if (strat === "ia_march_odd_year") return "Strategy: IA renewal · Mar 31 (odd years)";
  if (strat === "calendar_month_end" && req.defaultCalendarMonths) {
    return `Strategy: every ${req.defaultCalendarMonths} mo (end of calendar month)`;
  }
  if (req.defaultIntervalValue != null && req.defaultIntervalUnit) {
    return `Interval: every ${req.defaultIntervalValue} ${req.defaultIntervalUnit}`;
  }
  if (req.defaultRecurrenceDays != null) return `Legacy: every ${req.defaultRecurrenceDays} days`;
  return "Interval not set";
}

function renderPromptFieldInput(props: {
  field: any;
  value: string;
  onChange: (v: string) => void;
}) {
  const { field, value, onChange } = props;
  const baseClass =
    "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40";
  if (field.fieldType === "date") {
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={baseClass} />
    );
  }
  if (field.fieldType === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || field.label}
        rows={2}
        className={baseClass}
      />
    );
  }
  if (field.fieldType === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || field.label}
        className={baseClass}
      />
    );
  }
  if (field.fieldType === "select" && field.options?.length) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
        <option value="">Select…</option>
        {field.options.map((opt: string) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      className={baseClass}
    />
  );
}

export default function Roster() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const activeProject = useProject(activeProjectId ?? undefined) as any;

  const requirements = (useRosterRequirementTypes(activeProjectId ?? undefined) ?? []) as any[];
  const personnel = (useRosterPersonnel(activeProjectId ?? undefined) ?? []) as any[];
  const assignments = (useRosterAssignments(activeProjectId ?? undefined) ?? []) as any[];

  const dashboardAllCaps = useRosterDashboard(activeProjectId ?? undefined, undefined) as any;

  const addRequirement = useAddRosterRequirementType();
  const updateRequirement = useUpdateRosterRequirementType();
  const removeRequirement = useRemoveRosterRequirementType();
  const addPerson = useAddRosterPerson();
  const updatePerson = useUpdateRosterPerson();
  const removePerson = useRemoveRosterPerson();
  const addAssignment = useAddRosterAssignment();
  const updateAssignment = useUpdateRosterAssignment();
  const removeAssignment = useRemoveRosterAssignment();
  const migrateRosterRules = useMigrateRosterQualificationRules();

  const [reqName, setReqName] = useState("");
  const [reqCategory, setReqCategory] = useState("");
  const [reqRecurrence, setReqRecurrence] = useState("");
  const [reqGrace, setReqGrace] = useState("");
  const [reqStrategy, setReqStrategy] = useState<string>("fixed_days");
  const [reqIntervalValue, setReqIntervalValue] = useState("");
  const [reqIntervalUnit, setReqIntervalUnit] = useState<string>("days");
  const [reqCalendarMonths, setReqCalendarMonths] = useState("");

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
  const [assignmentRecurrenceIntervalValue, setAssignmentRecurrenceIntervalValue] = useState("");
  const [assignmentRecurrenceIntervalUnit, setAssignmentRecurrenceIntervalUnit] = useState<
    "days" | "months" | "years"
  >("months");
  const [assignmentGraceOverride, setAssignmentGraceOverride] = useState("");
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [assignmentEvidence, setAssignmentEvidence] = useState<Record<string, string>>({});

  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [editingRequirement, setEditingRequirement] = useState({
    name: "",
    category: "",
    recurrenceDays: "",
    graceDays: "",
    dueDateStrategy: "fixed_days",
    intervalValue: "",
    intervalUnit: "days",
    calendarMonths: "",
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
    recurrenceIntervalValue: "",
    recurrenceIntervalUnit: "months" as "days" | "months" | "years",
    graceDaysOverride: "",
    notes: "",
  });
  const [editingAssignmentEvidence, setEditingAssignmentEvidence] = useState<Record<string, string>>({});
  const [pendingDeletePerson, setPendingDeletePerson] = useState<any | null>(null);
  const [deleteAdminPosition, setDeleteAdminPosition] = useState("");
  const [isDeletingPerson, setIsDeletingPerson] = useState(false);

  const peopleById = useMemo(() => {
    return new Map(personnel.map((person) => [person._id, person]));
  }, [personnel]);

  const requirementsById = useMemo(() => {
    return new Map(requirements.map((req) => [req._id, req]));
  }, [requirements]);

  const selectedNewAssignmentRequirement = useMemo(() => {
    if (!assignmentRequirementId) return null;
    return requirementsById.get(assignmentRequirementId as any) ?? null;
  }, [assignmentRequirementId, requirementsById]);

  useEffect(() => {
    setAssignmentEvidence({});
  }, [assignmentRequirementId]);

  const assignmentStatusById = useMemo(() => {
    const d = dashboardAllCaps?.rows ?? { upToDate: [], due30Days: [], expired: [] };
    const map = new Map<string, string>();
    for (const col of [d.expired, d.due30Days, d.upToDate]) {
      for (const personRow of col) {
        for (const q of personRow.qualifications ?? []) {
          map.set(String(q.assignmentId), q.status);
        }
      }
    }
    return map;
  }, [dashboardAllCaps]);

  const handleAddRequirement = async () => {
    if (!activeProjectId || !reqName.trim()) return;
    try {
      await addRequirement({
        projectId: activeProjectId as any,
        name: reqName.trim(),
        category: reqCategory.trim() || undefined,
        defaultRecurrenceDays: reqRecurrence ? Number(reqRecurrence) : undefined,
        defaultGraceDays: reqGrace ? Number(reqGrace) : undefined,
        dueDateStrategy: reqStrategy as any,
        defaultIntervalValue: reqIntervalValue ? Number(reqIntervalValue) : undefined,
        defaultIntervalUnit: reqIntervalUnit as any,
        defaultCalendarMonths: reqCalendarMonths ? Number(reqCalendarMonths) : undefined,
      });
      setReqName("");
      setReqCategory("");
      setReqRecurrence("");
      setReqGrace("");
      setReqStrategy("fixed_days");
      setReqIntervalValue("");
      setReqIntervalUnit("days");
      setReqCalendarMonths("");
      toast.success("Requirement type added");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to add requirement type");
    }
  };

  const handleMigrateRosterRules = async () => {
    if (!activeProjectId) return;
    try {
      const res = await migrateRosterRules({ projectId: activeProjectId as any });
      toast.success(
        `Qualification rules applied: ${res.requirementsUpdated} requirement type(s), ${res.assignmentsUpdated} assignment(s).`,
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to migrate qualification rules");
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
    const evidenceEntries = Object.fromEntries(
      Object.entries(assignmentEvidence).filter(([, val]) => String(val).trim() !== ""),
    );
    try {
      await addAssignment({
        projectId: activeProjectId as any,
        personId: assignmentPersonId as any,
        requirementTypeId: assignmentRequirementId as any,
        assignedDate: assignmentAssignedDate || undefined,
        dueDate: assignmentDueDate || undefined,
        lastCompletedDate: assignmentLastCompletedDate || undefined,
        recurrenceDaysOverride: assignmentRecurrenceOverride ? Number(assignmentRecurrenceOverride) : undefined,
        recurrenceIntervalValueOverride: assignmentRecurrenceIntervalValue
          ? Number(assignmentRecurrenceIntervalValue)
          : undefined,
        recurrenceIntervalUnitOverride: assignmentRecurrenceIntervalValue
          ? assignmentRecurrenceIntervalUnit
          : undefined,
        graceDaysOverride: assignmentGraceOverride ? Number(assignmentGraceOverride) : undefined,
        notes: assignmentNotes.trim() || undefined,
        evidence: Object.keys(evidenceEntries).length ? evidenceEntries : undefined,
      });
      const req = requirementsById.get(assignmentRequirementId as any);
      const prompts = req?.promptSchema ?? [];
      const incomplete = prompts.filter((f: any) => f.id && !String(evidenceEntries[f.id] ?? "").trim());
      setAssignmentPersonId("");
      setAssignmentRequirementId("");
      setAssignmentAssignedDate("");
      setAssignmentDueDate("");
      setAssignmentLastCompletedDate("");
      setAssignmentRecurrenceOverride("");
      setAssignmentRecurrenceIntervalValue("");
      setAssignmentRecurrenceIntervalUnit("months");
      setAssignmentGraceOverride("");
      setAssignmentNotes("");
      setAssignmentEvidence({});
      toast.success("Assignment created");
      if (incomplete.length > 0) {
        toast.warning(`Consider adding evidence for: ${incomplete.map((f: any) => f.label).join(", ")}`);
      }
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
      dueDateStrategy: req.dueDateStrategy ?? "fixed_days",
      intervalValue:
        req.defaultIntervalValue != null
          ? String(req.defaultIntervalValue)
          : req.defaultRecurrenceDays != null
            ? String(req.defaultRecurrenceDays)
            : "",
      intervalUnit: req.defaultIntervalUnit ?? "days",
      calendarMonths: req.defaultCalendarMonths != null ? String(req.defaultCalendarMonths) : "",
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
        dueDateStrategy: editingRequirement.dueDateStrategy as any,
        defaultIntervalValue: editingRequirement.intervalValue ? Number(editingRequirement.intervalValue) : undefined,
        defaultIntervalUnit: editingRequirement.intervalUnit as any,
        defaultCalendarMonths: editingRequirement.calendarMonths
          ? Number(editingRequirement.calendarMonths)
          : undefined,
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
      recurrenceIntervalValue: assignment.recurrenceIntervalValueOverride?.toString() ?? "",
      recurrenceIntervalUnit: assignment.recurrenceIntervalUnitOverride ?? "months",
      graceDaysOverride: assignment.graceDaysOverride?.toString() ?? "",
      notes: assignment.notes ?? "",
    });
    setEditingAssignmentEvidence({ ...(assignment.evidence ?? {}) });
  };

  const saveAssignmentEdit = async () => {
    if (!editingAssignmentId) return;
    const ev = Object.fromEntries(
      Object.entries(editingAssignmentEvidence).filter(([, val]) => String(val).trim() !== ""),
    );
    try {
      await updateAssignment({
        assignmentId: editingAssignmentId as any,
        dueDate: editingAssignment.dueDate || undefined,
        recurrenceDaysOverride: editingAssignment.recurrenceDaysOverride
          ? Number(editingAssignment.recurrenceDaysOverride)
          : undefined,
        recurrenceIntervalValueOverride: editingAssignment.recurrenceIntervalValue
          ? Number(editingAssignment.recurrenceIntervalValue)
          : undefined,
        recurrenceIntervalUnitOverride: editingAssignment.recurrenceIntervalValue
          ? editingAssignment.recurrenceIntervalUnit
          : undefined,
        graceDaysOverride: editingAssignment.graceDaysOverride
          ? Number(editingAssignment.graceDaysOverride)
          : undefined,
        notes: editingAssignment.notes.trim() || undefined,
        evidence: ev,
      });
      const currentAssignment = assignments.find((a: any) => a._id === editingAssignmentId);
      const req = currentAssignment
        ? requirementsById.get(currentAssignment.requirementTypeId)
        : undefined;
      const prompts = req?.promptSchema ?? [];
      const incomplete = prompts.filter((f: any) => f.id && !String(ev[f.id] ?? "").trim());
      setEditingAssignmentId(null);
      setEditingAssignmentEvidence({});
      toast.success("Assignment updated");
      if (incomplete.length > 0) {
        toast.warning(`Consider adding evidence for: ${incomplete.map((f: any) => f.label).join(", ")}`);
      }
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

  const handleDeleteAssignment = async (assignment: any) => {
    const person = peopleById.get(assignment.personId);
    const req = requirementsById.get(assignment.requirementTypeId);
    const ok = window.confirm(
      `Delete assignment for ${person?.fullName ?? "this person"} · ${req?.name ?? "requirement"}?`,
    );
    if (!ok) return;
    try {
      await removeAssignment({ assignmentId: assignment._id as any });
      toast.success("Assignment deleted");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete assignment");
    }
  };

  const handleDeleteRequirement = async (req: any) => {
    const linkedCount = assignments.filter((a: any) => a.requirementTypeId === req._id).length;
    const ok = window.confirm(
      linkedCount > 0
        ? `Delete "${req.name}" and ${linkedCount} linked assignment${linkedCount !== 1 ? "s" : ""}?`
        : `Delete requirement "${req.name}"?`,
    );
    if (!ok) return;
    try {
      await removeRequirement({ requirementTypeId: req._id as any });
      toast.success("Requirement deleted");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete requirement");
    }
  };

  const openDeletePersonSplash = (person: any) => {
    setPendingDeletePerson(person);
    setDeleteAdminPosition("");
    setIsDeletingPerson(false);
  };

  const closeDeletePersonSplash = () => {
    if (isDeletingPerson) return;
    setPendingDeletePerson(null);
    setDeleteAdminPosition("");
  };

  const handleConfirmDeletePerson = async () => {
    if (!pendingDeletePerson) return;
    const adminPosition = deleteAdminPosition.trim();
    if (!adminPosition.toLowerCase().includes("admin")) {
      toast.error("Enter an admin position before deleting this person");
      return;
    }
    try {
      setIsDeletingPerson(true);
      await removePerson({ personId: pendingDeletePerson._id as any, adminPosition });
      toast.success("Person deleted from roster");
      setPendingDeletePerson(null);
      setDeleteAdminPosition("");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete person");
    } finally {
      setIsDeletingPerson(false);
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
          Track custom requirements, recurrent due dates, and aviation capability authorizations.
        </p>
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={handleMigrateRosterRules} disabled={!activeProjectId}>
            Apply qualification rule presets to this project
          </Button>
          <p className="text-xs text-white/45 mt-1 max-w-xl">
            Syncs legacy day-only requirements to strategies and refreshes assignment due dates (best-effort). Safe
            to run more than once.
          </p>
        </div>
      </div>

      <GlassCard className="!p-4 sm:!p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Qualification overview</h2>
            <p className="text-sm text-white/55 mt-0.5 max-w-xl">
              See who is current, due soon, or expired across all personnel — filters, columns, and drill-down live on
              the Quality & Compliance hub.
            </p>
          </div>
          <Link
            to="/quality-command-center#personnel"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky/30 bg-sky/10 px-4 py-2.5 text-sm font-medium text-sky-lighter hover:bg-sky/20 transition-colors shrink-0"
          >
            Open Quality hub
            <FiArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
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
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
              {CAPABILITY_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] uppercase tracking-wide text-white/45 mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.capabilities.map((capability) => (
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
                </div>
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
                          onClick={() => openDeletePersonSplash(person)}
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
            {selectedNewAssignmentRequirement?.promptSchema?.length ? (
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 space-y-2">
                <p className="text-xs font-medium text-sky-200/90">Qualification evidence (optional but recommended)</p>
                {(selectedNewAssignmentRequirement.promptSchema as any[]).map((field: any) => (
                  <div key={field.id}>
                    <label className="block text-[11px] uppercase tracking-wide text-white/50 mb-0.5">
                      {field.label}
                      {field.required ? <span className="text-amber-300/90"> · required</span> : null}
                    </label>
                    {renderPromptFieldInput({
                      field,
                      value: assignmentEvidence[field.id] ?? "",
                      onChange: (v) =>
                        setAssignmentEvidence((prev) => ({
                          ...prev,
                          [field.id]: v,
                        })),
                    })}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-white/50 mb-0.5">Assigned date</label>
                <input
                  type="date"
                  value={assignmentAssignedDate}
                  onChange={(e) => setAssignmentAssignedDate(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/50 mb-0.5">Override due date (optional)</label>
                <input
                  type="date"
                  value={assignmentDueDate}
                  onChange={(e) => setAssignmentDueDate(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-white/50 mb-0.5">Last completed (baseline)</label>
                <input
                  type="date"
                  value={assignmentLastCompletedDate}
                  onChange={(e) => setAssignmentLastCompletedDate(e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-white/50 mb-0.5">Override — recurrence days</label>
                <input
                  type="number"
                  value={assignmentRecurrenceOverride}
                  onChange={(e) => setAssignmentRecurrenceOverride(e.target.value)}
                  placeholder="Days only"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={assignmentRecurrenceIntervalValue}
                onChange={(e) => setAssignmentRecurrenceIntervalValue(e.target.value)}
                placeholder="Override interval value"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
              />
              <select
                value={assignmentRecurrenceIntervalUnit}
                onChange={(e) =>
                  setAssignmentRecurrenceIntervalUnit(e.target.value as "days" | "months" | "years")
                }
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              >
                <option value="days">Override unit: days</option>
                <option value="months">Override unit: months</option>
                <option value="years">Override unit: years</option>
              </select>
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
              const status = assignmentStatusById.get(String(assignment._id)) ?? "up_to_date";
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
                      {req?.promptSchema?.length ? (
                        <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2 space-y-2">
                          <p className="text-[10px] uppercase text-sky-200/80">Evidence</p>
                          {(req.promptSchema as any[]).map((field: any) => (
                            <div key={field.id}>
                              <label className="text-[10px] text-white/50">{field.label}</label>
                              {renderPromptFieldInput({
                                field,
                                value: editingAssignmentEvidence[field.id] ?? "",
                                onChange: (v) =>
                                  setEditingAssignmentEvidence((prev) => ({ ...prev, [field.id]: v })),
                              })}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={editingAssignment.recurrenceDaysOverride}
                          onChange={(e) =>
                            setEditingAssignment((prev) => ({ ...prev, recurrenceDaysOverride: e.target.value }))
                          }
                          placeholder="Recurrence days"
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
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          value={editingAssignment.recurrenceIntervalValue}
                          onChange={(e) =>
                            setEditingAssignment((prev) => ({
                              ...prev,
                              recurrenceIntervalValue: e.target.value,
                            }))
                          }
                          placeholder="Interval value"
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                        />
                        <select
                          value={editingAssignment.recurrenceIntervalUnit}
                          onChange={(e) =>
                            setEditingAssignment((prev) => ({
                              ...prev,
                              recurrenceIntervalUnit: e.target.value as "days" | "months" | "years",
                            }))
                          }
                          className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                        >
                          <option value="days">Unit: days</option>
                          <option value="months">Unit: months</option>
                          <option value="years">Unit: years</option>
                        </select>
                      </div>
                      <input
                        value={editingAssignment.notes}
                        onChange={(e) => setEditingAssignment((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Notes"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveAssignmentEdit}>Save</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingAssignmentId(null);
                            setEditingAssignmentEvidence({});
                          }}
                        >
                          Cancel
                        </Button>
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
                          onClick={() => void handleDeleteAssignment(assignment)}
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
                        {assignment.needsRuleMigrationReview ? (
                          <Badge size="sm" className="bg-amber-500/20 text-amber-200 border-amber-500/35">
                            Review dates / evidence
                          </Badge>
                        ) : null}
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
            <Select
              label="Due date strategy"
              value={reqStrategy}
              onChange={(e) => setReqStrategy(e.target.value)}
              selectSize="sm"
            >
              <option value="fixed_days">Fixed — add days from baseline</option>
              <option value="fixed_interval">Fixed — calendar (days / months / years)</option>
              <option value="calendar_month_end">End of calendar month after N months</option>
              <option value="ia_march_odd_year">IA renewal — Mar 31, odd years (14 CFR 65.93)</option>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={reqIntervalValue}
                onChange={(e) => setReqIntervalValue(e.target.value)}
                placeholder="Interval value (e.g. 24)"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
              />
              <Select
                label="Interval unit"
                value={reqIntervalUnit}
                onChange={(e) => setReqIntervalUnit(e.target.value)}
                selectSize="sm"
              >
                <option value="days">Days</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </Select>
            </div>
            {reqStrategy === "calendar_month_end" ? (
              <input
                type="number"
                value={reqCalendarMonths}
                onChange={(e) => setReqCalendarMonths(e.target.value)}
                placeholder="Calendar months (e.g. 24 for BFR / A&P recent exp.)"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40"
              />
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={reqRecurrence}
                onChange={(e) => setReqRecurrence(e.target.value)}
                placeholder="Legacy recurrence days (optional)"
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
                    <Select
                      label="Strategy"
                      value={editingRequirement.dueDateStrategy}
                      onChange={(e) =>
                        setEditingRequirement((prev) => ({ ...prev, dueDateStrategy: e.target.value }))
                      }
                      selectSize="sm"
                    >
                      <option value="fixed_days">Fixed days from baseline</option>
                      <option value="fixed_interval">Fixed (days/months/years)</option>
                      <option value="calendar_month_end">End of month + N months</option>
                      <option value="ia_march_odd_year">IA Mar 31 odd years</option>
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={editingRequirement.intervalValue}
                        onChange={(e) => setEditingRequirement((prev) => ({ ...prev, intervalValue: e.target.value }))}
                        placeholder="Interval value"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      />
                      <select
                        value={editingRequirement.intervalUnit}
                        onChange={(e) =>
                          setEditingRequirement((prev) => ({ ...prev, intervalUnit: e.target.value }))
                        }
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                      >
                        <option value="days">Days</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                    <input
                      type="number"
                      value={editingRequirement.calendarMonths}
                      onChange={(e) =>
                        setEditingRequirement((prev) => ({ ...prev, calendarMonths: e.target.value }))
                      }
                      placeholder="Calendar months (calendar_month_end)"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={editingRequirement.recurrenceDays}
                        onChange={(e) => setEditingRequirement((prev) => ({ ...prev, recurrenceDays: e.target.value }))}
                        placeholder="Legacy recurrence days"
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
                          onClick={() => void handleDeleteRequirement(req)}
                          className="text-white/35 hover:text-red-300 transition-colors"
                          title="Delete requirement"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-white/60">
                      {req.category || "Uncategorized"} · Grace {req.defaultGraceDays ?? 0}d
                    </div>
                    <div className="text-[11px] text-sky-200/80 mt-0.5">{formatRequirementRecurrence(req)}</div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      {(requirements.length === 0 || personnel.length === 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm flex items-center gap-2">
          <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
          Add at least one requirement type and one person before creating assignments.
        </div>
      )}

      {pendingDeletePerson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-person-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-red-400/30 bg-slate-950/95 p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="rounded-full bg-red-500/20 p-2 text-red-300">
                <FiAlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 id="delete-person-title" className="text-xl font-display font-bold text-white">
                  Delete Personnel Record
                </h2>
                <p className="text-sm text-white/70 mt-1">
                  You are about to delete <span className="font-semibold text-white">{pendingDeletePerson.fullName}</span> from{" "}
                  <span className="font-semibold text-white">{activeProject?.name ?? "this company"}</span>. Do you want to continue?
                </p>
              </div>
            </div>

            <label className="block text-xs uppercase tracking-wide text-white/55 mb-1">
              Enter an admin position for this company
            </label>
            <input
              value={deleteAdminPosition}
              onChange={(e) => setDeleteAdminPosition(e.target.value)}
              placeholder="Example: Company Admin"
              className="w-full rounded-lg bg-white/5 border border-white/15 px-3 py-2 text-sm text-white placeholder-white/40"
            />
            <p className="text-xs text-white/50 mt-2">Include the word "admin" to enable deletion.</p>

            <div className="flex justify-end gap-2 mt-5">
              <Button size="sm" variant="ghost" onClick={closeDeletePersonSplash} disabled={isDeletingPerson}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleConfirmDeletePerson}
                disabled={isDeletingPerson || !deleteAdminPosition.trim().toLowerCase().includes("admin")}
                icon={<FiTrash2 className="w-3.5 h-3.5" />}
              >
                {isDeletingPerson ? "Deleting..." : "Yes, delete person"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
