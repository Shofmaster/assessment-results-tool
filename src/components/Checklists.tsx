import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  FiAlertTriangle,
  FiCheckSquare,
  FiChevronDown,
  FiChevronUp,
  FiDownload,
  FiPlus,
  FiPrinter,
  FiSave,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import { useAppStore } from "../store/appStore";
import {
  useAddChecklistManualItem,
  useSharedReferenceDocsResolved,
  useChecklistCustomTemplateItems,
  useChecklistItems,
  useChecklistOccurrenceForRun,
  useChecklistOccurrences,
  useChecklistRuns,
  useChecklistSeriesForRun,
  useCloseChecklistOccurrence,
  useCreateChecklistRunFromSelectedDocs,
  useCreateSeriesAndLinkRun,
  useDeleteChecklistItem,
  useDeleteChecklistRun,
  useDocuments,
  useEntityProfile,
  useEscalateChecklistItemToIssue,
  useMyAdminCompanies,
  useProject,
  useSaveChecklistCustomTemplateItems,
  useStartNextChecklistCycle,
  useUpdateChecklistItem,
  useUpdateOpenOccurrencePlannedDue,
  useUpsertEntityProfile,
  useUserSettings,
} from "../hooks/useConvexData";
import { useFocusViewHeading } from "../hooks/useFocusViewHeading";
import { AUDIT_CHECKLIST_TEMPLATES, getFrameworkTemplate } from "../config/auditChecklistTemplates";
import { computeNextDue, getDueStatus } from "../types/inspectionSchedule";
import { Button, GlassCard, Input, Select } from "./ui";

type ChecklistItemStatus = "not_started" | "in_progress" | "complete" | "blocked";

type DueFilter = "all" | "incomplete" | "overdue" | "due_soon" | "due_week" | "no_due";
type ExecutionSort = "due_asc" | "section" | "severity";

function getChecklistItemDisplayDue(
  item: {
    dueDate?: string;
    intervalMonths?: number;
    intervalDays?: number;
    lastPerformedAt?: string;
  },
  runNextCycleDue?: string | null
): string | null {
  const months = item.intervalMonths ?? 0;
  const days = item.intervalDays ?? 0;
  if (months > 0 || days > 0) {
    const next = computeNextDue({
      lastPerformedAt: item.lastPerformedAt ?? undefined,
      intervalType: "calendar",
      intervalMonths: months,
      intervalDays: days,
      intervalValue: undefined,
    });
    if (next) return next;
  }
  if (item.dueDate?.slice(0, 10)) return item.dueDate.slice(0, 10);
  return runNextCycleDue?.slice(0, 10) ?? null;
}

function dueBadgeClass(status: ReturnType<typeof getDueStatus>, isDark = true): string {
  if (status === "overdue") return isDark ? "text-red-300 bg-red-500/15 border-red-500/30" : "text-red-700 bg-red-50 border-red-200";
  if (status === "due_soon") return isDark ? "text-amber-200 bg-amber-500/15 border-amber-500/25" : "text-amber-800 bg-amber-50 border-amber-200";
  if (status === "on_track") return isDark ? "text-emerald-200/90 bg-emerald-500/10 border-emerald-500/25" : "text-emerald-800 bg-emerald-50 border-emerald-200";
  return isDark ? "text-white/50 bg-white/5 border-white/10" : "text-slate-500 bg-slate-100 border-slate-200";
}

function diffDaysFromToday(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function itemMatchesDueFilter(item: { status: string }, filter: DueFilter, displayDue: string | null): boolean {
  if (filter === "all") return true;
  const incomplete = item.status !== "complete";
  if (filter === "incomplete") return incomplete;
  if (!incomplete) return false;
  if (filter === "no_due") return !displayDue;
  if (!displayDue) return false;
  const diff = diffDaysFromToday(displayDue);
  if (filter === "overdue") return diff < 0;
  if (filter === "due_soon") return diff < 0 || (diff >= 0 && diff <= 30);
  if (filter === "due_week") return diff >= 0 && diff <= 7;
  return true;
}

function sortExecutionItems(items: any[], sort: ExecutionSort, runNextCycleDue?: string | null): any[] {
  const copy = [...items];
  if (sort === "section") {
    copy.sort((a, b) => (a.section || "").localeCompare(b.section || "") || a.title.localeCompare(b.title));
  } else if (sort === "severity") {
    const rank: Record<string, number> = { critical: 0, major: 1, minor: 2, observation: 3 };
    copy.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  } else {
    copy.sort((a, b) => {
      const da = getChecklistItemDisplayDue(a, runNextCycleDue);
      const db = getChecklistItemDisplayDue(b, runNextCycleDue);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }
  return copy;
}

function wouldCloseCycleBeLate(plannedDueDate: string | undefined): boolean {
  if (!plannedDueDate || plannedDueDate.length < 10) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > plannedDueDate.slice(0, 10);
}

function downloadChecklistOccurrencesCsv(seriesName: string, occurrences: any[]) {
  const headers = [
    "occurrenceIndex",
    "label",
    "plannedDueDate",
    "closedAt",
    "onTime",
    "lateReason",
    "itemsComplete",
    "itemsTotal",
    "checklistRunId",
  ];
  const escape = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
  const rows = occurrences.map((o) =>
    [
      o.occurrenceIndex,
      o.label ?? "",
      o.plannedDueDate ?? "",
      o.closedAt ?? "",
      o.onTime === undefined ? "" : o.onTime ? "yes" : "no",
      o.lateReason ?? "",
      o.completionComplete ?? "",
      o.completionTotal ?? "",
      o.checklistRunId,
    ].map((v) => escape(String(v)))
  );
  const body = [headers.map(escape).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${seriesName.replace(/[^\w\-]+/g, "_").slice(0, 80) || "checklist"}_history.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getStatusLabel(status: ChecklistItemStatus): string {
  if (status === "not_started") return "Not started";
  if (status === "in_progress") return "In progress";
  if (status === "complete") return "Complete";
  return "Blocked";
}

export default function Checklists() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeProjectId = useAppStore((state) => state.activeProjectId);

  const project = useProject(activeProjectId || undefined) as any;
  const projectCompanyId = project?.companyId as string | undefined;
  const projectReady = project !== undefined;
  const isTenantProject = projectReady && Boolean(projectCompanyId);

  const profile = useEntityProfile(activeProjectId || undefined) as any;
  const myAdminCompanies = (useMyAdminCompanies() || []) as any[];
  const canManageCompanyProfile =
    Boolean(projectCompanyId) && myAdminCompanies.some((c: any) => String(c._id) === String(projectCompanyId));
  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const sharedReferenceDocuments = (useSharedReferenceDocsResolved() || []) as any[];
  const checklistRuns = (useChecklistRuns(activeProjectId || undefined) || []) as any[];

  const upsertProfile = useUpsertEntityProfile();
  const createRunFromSelectedDocs = useCreateChecklistRunFromSelectedDocs();
  const updateChecklistItem = useUpdateChecklistItem();
  const deleteChecklistItem = useDeleteChecklistItem();
  const deleteChecklistRun = useDeleteChecklistRun();
  const addChecklistManualItem = useAddChecklistManualItem();
  const escalateChecklistItemToIssue = useEscalateChecklistItemToIssue();
  const saveChecklistCustomTemplateItems = useSaveChecklistCustomTemplateItems();
  const createSeriesAndLinkRun = useCreateSeriesAndLinkRun();
  const closeChecklistOccurrence = useCloseChecklistOccurrence();
  const startNextChecklistCycle = useStartNextChecklistCycle();
  const updateOpenOccurrencePlannedDue = useUpdateOpenOccurrencePlannedDue();

  const settings = useUserSettings();
  // Filter frameworks by admin-configured enabled list (null = all enabled)
  const enabledFrameworkIds = settings?.enabledFrameworks ?? null;
  const availableTemplates = useMemo(
    () => enabledFrameworkIds === null
      ? AUDIT_CHECKLIST_TEMPLATES
      : AUDIT_CHECKLIST_TEMPLATES.filter((t) => enabledFrameworkIds.includes(t.framework)),
    [enabledFrameworkIds]
  );

  const [selectedFramework, setSelectedFramework] = useState<string>(AUDIT_CHECKLIST_TEMPLATES[0]?.framework ?? "faa");
  const currentTemplate = useMemo(
    () => getFrameworkTemplate(selectedFramework) ?? availableTemplates[0] ?? AUDIT_CHECKLIST_TEMPLATES[0],
    [selectedFramework, availableTemplates]
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string>(currentTemplate?.variants[0]?.id ?? "");
  const selectedVariant = currentTemplate?.variants.find((variant) => variant.id === selectedVariantId) ?? currentTemplate?.variants[0];
  const savedCustomTemplateItems = (useChecklistCustomTemplateItems(
    activeProjectId || undefined,
    currentTemplate?.framework,
    selectedVariant?.id
  ) || []) as any[];

  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const selectedRun = checklistRuns.find((run: any) => run._id === selectedRunId) ?? checklistRuns[0];
  const checklistItems = (useChecklistItems(selectedRun?._id) || []) as any[];
  const seriesForRun = useChecklistSeriesForRun(selectedRun?._id) as any;
  const occurrenceForRun = useChecklistOccurrenceForRun(selectedRun?._id) as any;
  const seriesOccurrences = (useChecklistOccurrences(seriesForRun?._id) || []) as any[];
  const [customItemsDraft, setCustomItemsDraft] = useState<Array<{ title: string; description: string; severity: "critical" | "major" | "minor" | "observation" }>>([
    { title: "", description: "", severity: "minor" },
  ]);
  const [checklistName, setChecklistName] = useState("");
  const [selectedProjectDocumentIds, setSelectedProjectDocumentIds] = useState<string[]>([]);
  const [selectedSharedReferenceDocumentIds, setSelectedSharedReferenceDocumentIds] = useState<string[]>([]);
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [ownerDraft, setOwnerDraft] = useState<Record<string, string>>({});
  const [dueDraft, setDueDraft] = useState<Record<string, string>>({});
  const [intervalMonthsDraft, setIntervalMonthsDraft] = useState<Record<string, string>>({});
  const [intervalDaysDraft, setIntervalDaysDraft] = useState<Record<string, string>>({});
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [executionSort, setExecutionSort] = useState<ExecutionSort>("due_asc");

  const [seriesLinkName, setSeriesLinkName] = useState("");
  const [seriesPurpose, setSeriesPurpose] = useState<"pre_audit" | "recurring_ops" | "event">("recurring_ops");
  const [seriesIsRecurring, setSeriesIsRecurring] = useState(true);
  const [seriesIntervalM, setSeriesIntervalM] = useState("");
  const [seriesIntervalD, setSeriesIntervalD] = useState("");
  const [seriesPlannedDue, setSeriesPlannedDue] = useState("");
  const [closeCycleModalOpen, setCloseCycleModalOpen] = useState(false);
  const [lateReasonDraft, setLateReasonDraft] = useState("");
  const [nextCycleDueInput, setNextCycleDueInput] = useState("");
  const [openPlannedDueDraft, setOpenPlannedDueDraft] = useState("");

  const [legacyProfileForm, setLegacyProfileForm] = useState({
    companyName: "",
    legalEntityName: "",
    primaryLocation: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    repairStationType: "",
    facilitySquareFootage: "",
    employeeCount: "",
    operationsScope: "",
    smsMaturity: "",
  });

  useEffect(() => {
    if (isTenantProject || !profile) return;
    setLegacyProfileForm({
      companyName: profile.companyName ?? "",
      legalEntityName: profile.legalEntityName ?? "",
      primaryLocation: profile.primaryLocation ?? "",
      contactName: profile.contactName ?? "",
      contactEmail: profile.contactEmail ?? "",
      contactPhone: profile.contactPhone ?? "",
      repairStationType: profile.repairStationType ?? "",
      facilitySquareFootage: profile.facilitySquareFootage != null ? String(profile.facilitySquareFootage) : "",
      employeeCount: profile.employeeCount != null ? String(profile.employeeCount) : "",
      operationsScope: profile.operationsScope ?? "",
      smsMaturity: profile.smsMaturity ?? "",
    });
  }, [isTenantProject, profile?._id, profile?.updatedAt]);

  const docsWithText = allDocuments.filter((doc) => (doc.extractedText || "").trim().length > 0).length;
  const profileCompleteness = [
    profile?.companyName,
    profile?.primaryLocation,
    profile?.operationsScope,
  ].filter(Boolean).length;
  const profileWarning = profileCompleteness < 2;
  const documentWarning = docsWithText === 0;
  const runNextCycleDue = selectedRun?.nextCycleDue ?? null;
  const isRunArchived = selectedRun?.status === "archived";
  const hasOpenCycleInSeries = useMemo(
    () => (seriesOccurrences ?? []).some((o: any) => !o.closedAt),
    [seriesOccurrences]
  );
  const canStartNextCycle =
    Boolean(seriesForRun?._id) &&
    (seriesOccurrences?.length ?? 0) > 0 &&
    !hasOpenCycleInSeries;

  const executionLocked = isRunArchived;
  const allExecutionItemsComplete = useMemo(
    () => checklistItems.length > 0 && checklistItems.every((i: any) => i.status === "complete"),
    [checklistItems],
  );
  const openOccurrence = occurrenceForRun && !occurrenceForRun.closedAt ? occurrenceForRun : null;
  const canCloseCycle =
    Boolean(openOccurrence && allExecutionItemsComplete && !executionLocked);
  const lateIfCloseNow = openOccurrence
    ? wouldCloseCycleBeLate(openOccurrence.plannedDueDate)
    : false;

  const filteredExecutionItems = useMemo(() => {
    const filtered = checklistItems.filter((item: any) => {
      const displayDue = getChecklistItemDisplayDue(item, runNextCycleDue);
      return itemMatchesDueFilter(item, dueFilter, displayDue);
    });
    return sortExecutionItems(filtered, executionSort, runNextCycleDue);
  }, [checklistItems, dueFilter, executionSort, runNextCycleDue]);
  const allExpanded =
    filteredExecutionItems.length > 0 && filteredExecutionItems.every((item: any) => Boolean(expandedItemIds[item._id]));

  useEffect(() => {
    setCloseCycleModalOpen(false);
    setLateReasonDraft("");
    setNextCycleDueInput("");
    setSeriesLinkName(selectedRun?.name || "");
    setSeriesPlannedDue(selectedRun?.nextCycleDue?.slice(0, 10) || "");
  }, [selectedRun?._id]);

  useEffect(() => {
    if (occurrenceForRun && !occurrenceForRun.closedAt) {
      const p = occurrenceForRun.plannedDueDate || selectedRun?.nextCycleDue || "";
      setOpenPlannedDueDraft(typeof p === "string" ? p.slice(0, 10) : "");
    } else {
      setOpenPlannedDueDraft("");
    }
  }, [occurrenceForRun?._id, occurrenceForRun?.plannedDueDate, occurrenceForRun?.closedAt, selectedRun?.nextCycleDue]);

  useEffect(() => {
    const fromSaved = savedCustomTemplateItems.map((item: any) => ({
      title: item.title ?? "",
      description: item.description ?? "",
      severity: item.severity ?? "minor",
    }));
    setCustomItemsDraft(fromSaved.length > 0 ? [...fromSaved, { title: "", description: "", severity: "minor" }] : [{ title: "", description: "", severity: "minor" }]);
  }, [savedCustomTemplateItems, selectedFramework, selectedVariantId]);

  useEffect(() => {
    setExpandedItemIds({});
    const nextNotes: Record<string, string> = {};
    const nextOwner: Record<string, string> = {};
    const nextDue: Record<string, string> = {};
    const nextIm: Record<string, string> = {};
    const nextId: Record<string, string> = {};
    for (const item of checklistItems) {
      nextNotes[item._id] = item.notes ?? "";
      nextOwner[item._id] = item.owner ?? "";
      nextDue[item._id] = item.dueDate ? item.dueDate.slice(0, 10) : "";
      nextIm[item._id] = item.intervalMonths != null && item.intervalMonths > 0 ? String(item.intervalMonths) : "";
      nextId[item._id] = item.intervalDays != null && item.intervalDays > 0 ? String(item.intervalDays) : "";
    }
    setNotesDraft(nextNotes);
    setOwnerDraft(nextOwner);
    setDueDraft(nextDue);
    setIntervalMonthsDraft(nextIm);
    setIntervalDaysDraft(nextId);
  }, [selectedRun?._id, checklistItems]);

  const runIdFromUrl = searchParams.get("runId");
  useEffect(() => {
    if (!runIdFromUrl || checklistRuns.length === 0) return;
    const exists = checklistRuns.some((run: any) => String(run._id) === runIdFromUrl);
    if (!exists) return;
    setSelectedRunId(runIdFromUrl);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("runId");
        return next;
      },
      { replace: true }
    );
  }, [runIdFromUrl, checklistRuns, setSearchParams]);

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
        <GlassCard className="p-6">
          <h2 className="text-xl font-semibold text-white">Select a project to use Checklists</h2>
          <p className="mt-2 text-white/70">Checklist generation is project-scoped. Open a project first to continue.</p>
          <Button className="mt-4" onClick={() => navigate("/logbook")}>
            Go to Projects
          </Button>
        </GlassCard>
      </div>
    );
  }

  const saveLegacyProfile = async () => {
    if (isTenantProject) return;
    try {
      await upsertProfile({
        projectId: activeProjectId as any,
        companyName: legacyProfileForm.companyName || undefined,
        legalEntityName: legacyProfileForm.legalEntityName || undefined,
        primaryLocation: legacyProfileForm.primaryLocation || undefined,
        contactName: legacyProfileForm.contactName || undefined,
        contactEmail: legacyProfileForm.contactEmail || undefined,
        contactPhone: legacyProfileForm.contactPhone || undefined,
        repairStationType: legacyProfileForm.repairStationType || undefined,
        facilitySquareFootage: legacyProfileForm.facilitySquareFootage
          ? Number(legacyProfileForm.facilitySquareFootage)
          : undefined,
        employeeCount: legacyProfileForm.employeeCount ? Number(legacyProfileForm.employeeCount) : undefined,
        operationsScope: legacyProfileForm.operationsScope || undefined,
        smsMaturity: legacyProfileForm.smsMaturity || undefined,
      });
      toast.success("Entity profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    }
  };

  const generateChecklist = async () => {
    if (!currentTemplate || !selectedVariant) return;
    if (selectedProjectDocumentIds.length === 0 && selectedSharedReferenceDocumentIds.length === 0) {
      toast.error("Select at least one reference material document");
      return;
    }
    try {
      const runId = await createRunFromSelectedDocs({
        projectId: activeProjectId as any,
        profileId: profile?._id,
        name: checklistName.trim() || undefined,
        framework: currentTemplate.framework,
        frameworkLabel: currentTemplate.label,
        subtypeId: selectedVariant.id,
        subtypeLabel: selectedVariant.label,
        generatedFromTemplateVersion: currentTemplate.version,
        items: selectedVariant.items,
        selectedProjectDocumentIds: selectedProjectDocumentIds as any[],
        selectedSharedReferenceDocumentIds: selectedSharedReferenceDocumentIds as any[],
      });
      setSelectedRunId(String(runId));
      toast.success("Checklist generated with selected reference material");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate checklist");
    }
  };

  const saveReusableCustomItems = async () => {
    if (!activeProjectId || !currentTemplate || !selectedVariant) return;
    const cleanItems = customItemsDraft
      .map((item) => ({
        ...item,
        title: item.title.trim(),
        description: item.description.trim(),
      }))
      .filter((item) => item.title.length > 0)
      .map((item) => ({
        title: item.title,
        description: item.description || undefined,
        severity: item.severity,
      }));
    try {
      await saveChecklistCustomTemplateItems({
        projectId: activeProjectId as any,
        framework: currentTemplate.framework,
        subtypeId: selectedVariant.id,
        subtypeLabel: selectedVariant.label,
        items: cleanItems,
      });
      toast.success("Reusable custom items saved for this checklist type");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save custom items");
    }
  };

  const updateItemStatus = async (itemId: string, status: ChecklistItemStatus) => {
    try {
      await updateChecklistItem({
        checklistItemId: itemId as any,
        status,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update checklist item");
    }
  };

  const updateItemNotes = async (itemId: string) => {
    try {
      await updateChecklistItem({
        checklistItemId: itemId as any,
        notes: notesDraft[itemId] || undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update checklist notes");
    }
  };

  const updateItemOwner = async (itemId: string) => {
    try {
      await updateChecklistItem({
        checklistItemId: itemId as any,
        owner: ownerDraft[itemId]?.trim() || "",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update owner");
    }
  };

  const updateItemDueDate = async (itemId: string) => {
    const raw = (dueDraft[itemId] ?? "").trim();
    try {
      await updateChecklistItem({
        checklistItemId: itemId as any,
        dueDate: raw || "",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update due date");
    }
  };

  const saveItemIntervals = async (itemId: string) => {
    const m = parseInt(intervalMonthsDraft[itemId] || "0", 10);
    const d = parseInt(intervalDaysDraft[itemId] || "0", 10);
    try {
      await updateChecklistItem({
        checklistItemId: itemId as any,
        intervalMonths: Number.isFinite(m) ? m : 0,
        intervalDays: Number.isFinite(d) ? d : 0,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save recurrence");
    }
  };

  const escalateItem = async (itemId: string) => {
    try {
      await escalateChecklistItemToIssue({
        checklistItemId: itemId as any,
      });
      toast.success("Checklist item escalated to CAR/Issue");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Escalation failed");
    }
  };

  const removeItem = async (itemId: string) => {
    if (!window.confirm("Delete this checklist item?")) return;
    try {
      await deleteChecklistItem({ checklistItemId: itemId as any });
      toast.success("Checklist item deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete checklist item");
    }
  };

  const removeRun = async () => {
    if (!selectedRun?._id) return;
    if (!window.confirm("Delete this checklist run and all checklist items?")) return;
    try {
      await deleteChecklistRun({ checklistRunId: selectedRun._id });
      setSelectedRunId("");
      toast.success("Checklist run deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete checklist run");
    }
  };

  const saveOpenCyclePlannedDue = async () => {
    if (!openOccurrence?._id || executionLocked) return;
    const raw = openPlannedDueDraft.trim();
    if (!raw || raw.length < 10) {
      toast.error("Set a planned due date (YYYY-MM-DD) for this cycle");
      return;
    }
    try {
      await updateOpenOccurrencePlannedDue({
        occurrenceId: openOccurrence._id,
        plannedDueDate: raw.slice(0, 10),
      });
      toast.success("Cycle planned due date updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update planned due");
    }
  };

  const linkRunToNewSeries = async () => {
    if (!selectedRun?._id || executionLocked || selectedRun.checklistSeriesId) return;
    const name = (seriesLinkName.trim() || selectedRun.name || "Checklist series").slice(0, 200);
    const im = parseInt(seriesIntervalM, 10);
    const id = parseInt(seriesIntervalD, 10);
    try {
      await createSeriesAndLinkRun({
        checklistRunId: selectedRun._id,
        name,
        purpose: seriesPurpose,
        isRecurring: seriesIsRecurring,
        intervalMonths: Number.isFinite(im) && im > 0 ? im : undefined,
        intervalDays: Number.isFinite(id) && id > 0 ? id : undefined,
        plannedDueDate: seriesPlannedDue.trim().slice(0, 10) || undefined,
      });
      toast.success("Checklist linked to a new series");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create series");
    }
  };

  const exportSeriesHistory = () => {
    if (!seriesForRun) return;
    const rows = [...(seriesOccurrences ?? [])].sort((a: any, b: any) => a.occurrenceIndex - b.occurrenceIndex);
    downloadChecklistOccurrencesCsv(seriesForRun.name || "series", rows);
  };

  const confirmCloseCycle = async () => {
    if (!openOccurrence?._id) return;
    if (lateIfCloseNow && lateReasonDraft.trim().length < 10) {
      toast.error("This cycle is past its planned due — enter a reason (at least 10 characters)");
      return;
    }
    try {
      await closeChecklistOccurrence({
        occurrenceId: openOccurrence._id,
        lateReason: lateIfCloseNow ? lateReasonDraft.trim() : undefined,
      });
      toast.success("Cycle closed; this run is archived");
      setCloseCycleModalOpen(false);
      setLateReasonDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close cycle");
    }
  };

  const startNextSeriesCycle = async () => {
    if (!seriesForRun?._id || !canStartNextCycle) return;
    try {
      const result = await startNextChecklistCycle({
        seriesId: seriesForRun._id,
        plannedDueDate: nextCycleDueInput.trim().slice(0, 10) || undefined,
      });
      if (result?.runId) setSelectedRunId(String(result.runId));
      setNextCycleDueInput("");
      toast.success("Next cycle started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start next cycle");
    }
  };

  const addManualItem = async () => {
    if (!selectedRun?._id || executionLocked) return;
    try {
      await addChecklistManualItem({
        checklistRunId: selectedRun._id,
        section: "Manual Additions",
        title: "Custom checklist item",
        severity: "minor",
      });
      toast.success("Manual checklist item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add manual item");
    }
  };

  const toggleProjectDocument = (id: string) => {
    setSelectedProjectDocumentIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleSharedDocument = (id: string) => {
    setSelectedSharedReferenceDocumentIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItemIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleAllExpanded = () => {
    const next: Record<string, boolean> = { ...expandedItemIds };
    for (const item of filteredExecutionItems) {
      next[item._id] = !allExpanded;
    }
    setExpandedItemIds(next);
  };

  const handlePrint = () => {
    if (!selectedRun) {
      toast.error("Select a checklist run to print");
      return;
    }
    window.print();
  };

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 checklist-print-root">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2 print:text-black">
          <FiCheckSquare className="text-sky-300 print:hidden" />
          Entity-Aware Checklists
        </h1>
        <p className="text-white/70 mt-1 print:hidden">Build pre-audit checklists from your entity profile and selected framework.</p>
      </div>

      {(profileWarning || documentWarning) && (
        <GlassCard className="p-4 mb-4 border border-amber-300/20 print:hidden">
          <div className="flex items-start gap-2 text-amber-200">
            <FiAlertTriangle className="mt-0.5" />
            <div className="text-sm space-y-1">
              {profileWarning && <p>Profile is incomplete. Add company, location, and scope before generating final checklist runs.</p>}
              {documentWarning && <p>No extracted document text found yet. Add project documents for better checklist readiness evidence.</p>}
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 print:hidden">
        <GlassCard className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Entity profile</h2>
          {!projectReady ? (
            <p className="text-sm text-white/60">Loading project…</p>
          ) : isTenantProject ? (
            <>
              <p className="text-xs text-white/55">
                This project uses your organization&apos;s shared profile. It is managed under{" "}
                <Link to="/company-admin" className="text-sky-300 underline underline-offset-2 hover:text-sky-200">
                  Company admin
                </Link>
                {canManageCompanyProfile ? "" : " (company admins and managers can edit)"}.
              </p>
              {profile ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white/85 space-y-1">
                  <p>
                    <span className="text-white/50">Company: </span>
                    {profile.companyName || profile.legalEntityName || "—"}
                  </p>
                  <p>
                    <span className="text-white/50">Location: </span>
                    {profile.primaryLocation || "—"}
                  </p>
                  <p>
                    <span className="text-white/50">Operations scope: </span>
                    {profile.operationsScope || "—"}
                  </p>
                  {(profile.contactName || profile.contactEmail) && (
                    <p>
                      <span className="text-white/50">Contact: </span>
                      {[profile.contactName, profile.contactEmail].filter(Boolean).join(" · ") || "—"}
                    </p>
                  )}
                  {(profile.repairStationType || profile.employeeCount != null) && (
                    <p className="text-white/70 text-xs">
                      {[profile.repairStationType, profile.employeeCount != null ? `${profile.employeeCount} employees` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-amber-200/90">
                  No organization profile yet. A company admin can add it in Company admin.
                </p>
              )}
              {!canManageCompanyProfile && (
                <p className="text-xs text-white/50">Need changes? Ask a company admin or manager to update Company admin.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-white/55">Personal or legacy project — profile is stored on this project only.</p>
              <Input
                placeholder="Company Name"
                value={legacyProfileForm.companyName}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, companyName: e.target.value }))}
              />
              <Input
                placeholder="Legal Entity Name"
                value={legacyProfileForm.legalEntityName}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, legalEntityName: e.target.value }))}
              />
              <Input
                placeholder="Primary Location"
                value={legacyProfileForm.primaryLocation}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, primaryLocation: e.target.value }))}
              />
              <Input
                placeholder="Repair Station Type"
                value={legacyProfileForm.repairStationType}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, repairStationType: e.target.value }))}
              />
              <Input
                placeholder="Facility Sq Ft"
                value={legacyProfileForm.facilitySquareFootage}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, facilitySquareFootage: e.target.value }))}
              />
              <Input
                placeholder="Employee Count"
                value={legacyProfileForm.employeeCount}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, employeeCount: e.target.value }))}
              />
              <Input
                placeholder="Operations Scope"
                value={legacyProfileForm.operationsScope}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, operationsScope: e.target.value }))}
              />
              <Input
                placeholder="SMS Maturity"
                value={legacyProfileForm.smsMaturity}
                onChange={(e) => setLegacyProfileForm((s) => ({ ...s, smsMaturity: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveLegacyProfile} icon={<FiSave />}>
                  Save Profile
                </Button>
              </div>
            </>
          )}
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Checklist Generator</h2>
          <Input
            placeholder="Checklist name (optional)"
            value={checklistName}
            onChange={(e) => setChecklistName(e.target.value)}
          />
          <Select
            value={selectedFramework}
            onChange={(e) => {
              const nextFramework = e.target.value;
              setSelectedFramework(nextFramework);
              const nextTemplate = getFrameworkTemplate(nextFramework);
              setSelectedVariantId(nextTemplate?.variants[0]?.id ?? "");
            }}
          >
            {availableTemplates.map((template) => (
              <option key={template.framework} value={template.framework}>
                {template.label}
              </option>
            ))}
          </Select>
          <Select value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)}>
            {(currentTemplate?.variants ?? []).map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </Select>
          <p className="text-sm text-white/70">
            Template version: <span className="text-white/90">{currentTemplate?.version ?? "n/a"}</span>
          </p>
          <p className="text-sm text-white/70">
            Items to generate: <span className="text-white/90">{selectedVariant?.items.length ?? 0}</span>
          </p>
          <Button onClick={generateChecklist} icon={<FiUpload />} disabled={!selectedVariant}>
            Generate Checklist Run
          </Button>
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Source Documents</h2>
          <p className="text-xs text-white/70">Select the exact reference material to use when generating the checklist.</p>
          <div className="rounded-lg border border-white/10 p-2 max-h-36 overflow-auto space-y-2">
            <p className="text-xs text-white/60">Project documents</p>
            {allDocuments.length === 0 && <p className="text-xs text-white/50">No project documents available.</p>}
            {allDocuments.map((doc) => (
              <label key={doc._id} className="flex items-center gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={selectedProjectDocumentIds.includes(doc._id)}
                  onChange={() => toggleProjectDocument(doc._id)}
                />
                <span>{doc.name}</span>
                <span className="text-white/50">({doc.category})</span>
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 p-2 max-h-36 overflow-auto space-y-2">
            <p className="text-xs text-white/60">Shared reference documents</p>
            {sharedReferenceDocuments.length === 0 && <p className="text-xs text-white/50">No shared references available.</p>}
            {sharedReferenceDocuments.map((doc) => (
              <label key={doc._id} className="flex items-center gap-2 text-xs text-white/80">
                <input
                  type="checkbox"
                  checked={selectedSharedReferenceDocumentIds.includes(doc._id)}
                  onChange={() => toggleSharedDocument(doc._id)}
                />
                <span>{doc.name}</span>
                <span className="text-white/50">({doc.documentType})</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-white/60">
            Selected documents: {selectedProjectDocumentIds.length + selectedSharedReferenceDocumentIds.length}
          </p>
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Custom Items (Reusable)</h2>
          <p className="text-xs text-white/70">
            Add optional items for this checklist type. Saved items auto-apply to future runs.
          </p>
          {customItemsDraft.map((item, idx) => (
            <div key={`custom-item-${idx}`} className="rounded-lg border border-white/10 p-2 space-y-2">
              <Input
                placeholder="Custom checklist title"
                value={item.title}
                onChange={(e) =>
                  setCustomItemsDraft((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p))
                  )
                }
              />
              <Input
                placeholder="Optional description"
                value={item.description}
                onChange={(e) =>
                  setCustomItemsDraft((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, description: e.target.value } : p))
                  )
                }
              />
              <Select
                value={item.severity}
                onChange={(e) =>
                  setCustomItemsDraft((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, severity: e.target.value as any } : p))
                  )
                }
              >
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="observation">Observation</option>
              </Select>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setCustomItemsDraft((prev) => [...prev, { title: "", description: "", severity: "minor" }])
              }
              icon={<FiPlus />}
            >
              Add Blank Item
            </Button>
            <Button onClick={saveReusableCustomItems} icon={<FiSave />} disabled={!selectedVariant}>
              Save Reusable Items
            </Button>
          </div>
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Checklist Runs</h2>
          <Select value={selectedRun?._id ?? ""} onChange={(e) => setSelectedRunId(e.target.value)}>
            {checklistRuns.length === 0 && <option value="">No checklist runs yet</option>}
            {checklistRuns.map((run: any) => (
              <option key={run._id} value={run._id}>
                {run.name || `${run.frameworkLabel}${run.subtypeLabel ? ` - ${run.subtypeLabel}` : ""}`} ({run.status})
              </option>
            ))}
          </Select>
          {selectedRun && (
            <div className="text-sm text-white/70">
              <p>Name: {selectedRun.name || "Untitled checklist"}</p>
              <p>Created: {new Date(selectedRun.createdAt).toLocaleString()}</p>
              <p>Framework: {selectedRun.frameworkLabel}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={addManualItem} icon={<FiPlus />} disabled={!selectedRun || executionLocked}>
              Add Manual Item
            </Button>
            <Button variant="secondary" onClick={handlePrint} icon={<FiPrinter />} disabled={!selectedRun}>
              Print Checklist
            </Button>
            <Button variant="destructive" onClick={removeRun} icon={<FiTrash2 />} disabled={!selectedRun || executionLocked}>
              Delete Run
            </Button>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4 mt-4 space-y-3 print:hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">Series &amp; cycle history</h2>
          {seriesForRun ? (
            <Button variant="secondary" size="sm" onClick={exportSeriesHistory} icon={<FiDownload />} disabled={!seriesOccurrences?.length}>
              Export history (CSV)
            </Button>
          ) : null}
        </div>
        {!selectedRun ? (
          <p className="text-sm text-white/60">Select a checklist run to manage series and cycles.</p>
        ) : !selectedRun.checklistSeriesId ? (
          <div className="space-y-3 rounded-lg border border-white/10 p-3">
            <p className="text-sm text-white/70">
              Link this run to a named series to track planned due dates, close completed cycles (archives the run), export history, and start the next cycle with cloned items.
            </p>
            <Input
              placeholder="Series name"
              value={seriesLinkName}
              onChange={(e) => setSeriesLinkName(e.target.value)}
              disabled={executionLocked}
            />
            <Select value={seriesPurpose} onChange={(e) => setSeriesPurpose(e.target.value as typeof seriesPurpose)} disabled={executionLocked}>
              <option value="pre_audit">Pre-audit</option>
              <option value="recurring_ops">Recurring operations</option>
              <option value="event">Event / one-off</option>
            </Select>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={seriesIsRecurring}
                onChange={(e) => setSeriesIsRecurring(e.target.checked)}
                disabled={executionLocked}
              />
              Recurring schedule (intervals used when starting the next cycle)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Interval — months (optional)"
                value={seriesIntervalM}
                onChange={(e) => setSeriesIntervalM(e.target.value)}
                disabled={executionLocked}
              />
              <Input
                type="number"
                min={0}
                placeholder="Interval — days (optional)"
                value={seriesIntervalD}
                onChange={(e) => setSeriesIntervalD(e.target.value)}
                disabled={executionLocked}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-white/60">Planned due for this cycle (optional)</span>
              <input
                type="date"
                className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                value={seriesPlannedDue}
                onChange={(e) => setSeriesPlannedDue(e.target.value)}
                disabled={executionLocked}
              />
            </div>
            <Button onClick={linkRunToNewSeries} disabled={executionLocked}>
              Create series &amp; link this run
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-white/80 space-y-1">
              <p>
                <span className="text-white/50">Series:</span> {seriesForRun.name}
              </p>
              <p className="text-white/60">
                Purpose: {seriesForRun.purpose.replace(/_/g, " ")}
                {seriesForRun.isRecurring
                  ? ` · Recurring${seriesForRun.intervalMonths ? ` · every ${seriesForRun.intervalMonths} mo` : ""}${
                      seriesForRun.intervalDays ? ` · every ${seriesForRun.intervalDays} d` : ""
                    }`
                  : ""}
              </p>
            </div>
            {openOccurrence && !executionLocked ? (
              <div className="rounded-lg border border-white/10 p-3 space-y-2">
                <p className="text-xs text-white/60 uppercase tracking-wide">Current open cycle</p>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-white/60">Planned due (cycle)</span>
                    <input
                      type="date"
                      className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
                      value={openPlannedDueDraft}
                      onChange={(e) => setOpenPlannedDueDraft(e.target.value)}
                    />
                  </div>
                  <Button variant="secondary" size="sm" onClick={saveOpenCyclePlannedDue}>
                    Save planned due
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCloseCycleModalOpen(true)}
                    disabled={!canCloseCycle}
                  >
                    Close cycle (all items complete)
                  </Button>
                </div>
                {!canCloseCycle ? (
                  <p className="text-xs text-amber-200/90">
                    Mark every checklist item complete to close this cycle. Closing archives this run.
                  </p>
                ) : null}
              </div>
            ) : null}
            {canStartNextCycle ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                <p className="text-sm text-emerald-100/90">All cycles in this series are closed. Start the next cycle.</p>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-xs text-white/60">Next planned due (optional)</span>
                    <input
                      type="date"
                      className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
                      value={nextCycleDueInput}
                      onChange={(e) => setNextCycleDueInput(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={startNextSeriesCycle} icon={<FiPlus />}>
                    Start next cycle
                  </Button>
                </div>
                <p className="text-xs text-white/50">If you leave the date blank, the server uses series interval from the last close date when configured.</p>
              </div>
            ) : null}
            <div className="rounded-lg border border-white/10 overflow-x-auto">
              <table className="w-full text-left text-sm text-white/85 min-w-[640px]">
                <thead className="text-xs text-white/55 border-b border-white/10">
                  <tr>
                    <th className="p-2 font-medium">Cycle</th>
                    <th className="p-2 font-medium">Planned due</th>
                    <th className="p-2 font-medium">Closed</th>
                    <th className="p-2 font-medium">On time</th>
                    <th className="p-2 font-medium">Late reason</th>
                    <th className="p-2 font-medium">Run</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesOccurrences.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-3 text-white/50">
                        No occurrences yet.
                      </td>
                    </tr>
                  ) : (
                    seriesOccurrences.map((o: any) => {
                      const isCurrentRow = selectedRun?._id === o.checklistRunId;
                      return (
                        <tr key={o._id} className={isCurrentRow ? "bg-sky-500/10" : ""}>
                          <td className="p-2">
                            {o.label ?? `Cycle ${o.occurrenceIndex}`} (#{o.occurrenceIndex})
                          </td>
                          <td className="p-2">{o.plannedDueDate?.slice(0, 10) ?? "—"}</td>
                          <td className="p-2">{o.closedAt ? new Date(o.closedAt).toLocaleString() : "Open"}</td>
                          <td className="p-2">
                            {o.closedAt ? (o.onTime ? "Yes" : "No") : "—"}
                          </td>
                          <td className="p-2 max-w-[200px] truncate" title={o.lateReason ?? ""}>
                            {o.lateReason ?? "—"}
                          </td>
                          <td className="p-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="!px-2"
                              onClick={() => setSelectedRunId(String(o.checklistRunId))}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4 mt-4 checklist-print-board">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3 print:hidden">
          <h2 className="text-lg font-semibold text-white">Execution Board</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value as DueFilter)}
              selectSize="sm"
              className="min-w-[160px]"
            >
              <option value="all">All items</option>
              <option value="incomplete">Incomplete only</option>
              <option value="overdue">Overdue</option>
              <option value="due_soon">Due ≤30 days</option>
              <option value="due_week">Due ≤7 days</option>
              <option value="no_due">No due date</option>
            </Select>
            <Select
              value={executionSort}
              onChange={(e) => setExecutionSort(e.target.value as ExecutionSort)}
              selectSize="sm"
              className="min-w-[150px]"
            >
              <option value="due_asc">Sort: due date</option>
              <option value="section">Sort: section</option>
              <option value="severity">Sort: severity</option>
            </Select>
            <Button variant="secondary" size="sm" onClick={toggleAllExpanded}>
              {allExpanded ? "Collapse All" : "Expand All"}
            </Button>
          </div>
        </div>
        <h2 className="hidden print:block text-lg font-semibold text-black mb-2">Execution Board</h2>
        {selectedRun && (
          <div className="hidden print:block text-black text-sm mb-3">
            <p>Checklist: {selectedRun.name || "Untitled checklist"}</p>
            <p>Framework: {selectedRun.frameworkLabel}</p>
            <p>Date: {new Date(selectedRun.createdAt).toLocaleString()}</p>
            <p>
              Entity: {profile?.companyName || profile?.legalEntityName || "N/A"} ({profile?.primaryLocation || "N/A"})
            </p>
          </div>
        )}
        {checklistItems.length === 0 ? (
          <p className="text-white/70 text-sm">No checklist items yet. Generate a checklist run first.</p>
        ) : filteredExecutionItems.length === 0 ? (
          <p className="text-white/70 text-sm">No items match this filter. Try switching to &quot;All items&quot;.</p>
        ) : (
          <div className="space-y-2">
            {filteredExecutionItems.map((item: any) => {
              const expanded = Boolean(expandedItemIds[item._id]);
              const displayDue = getChecklistItemDisplayDue(item, runNextCycleDue);
              const dueSt = getDueStatus(displayDue);
              return (
                <div key={item._id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 checklist-print-item">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => toggleItemExpanded(item._id)} className="text-left flex items-center gap-2 min-w-0">
                      {expanded ? <FiChevronUp className="text-white/60 shrink-0 print:hidden" /> : <FiChevronDown className="text-white/60 shrink-0 print:hidden" />}
                      <div className="min-w-0">
                        <p className="text-white print:text-black font-medium">{item.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <p className="text-xs text-white/60 print:text-black/70">Severity: {item.severity}</p>
                          {item.owner ? (
                            <p className="text-xs text-white/50 print:text-black/70">Owner: {item.owner}</p>
                          ) : null}
                          {displayDue ? (
                            <span
                              className={`text-xs px-2 py-0.5 rounded border print:border-black/30 print:text-black ${
                                item.status === "complete"
                                  ? "text-white/55 bg-white/5 border-white/15 print:text-black/70"
                                  : dueBadgeClass(dueSt)
                              }`}
                            >
                              Due {displayDue}
                              {item.status === "complete"
                                ? " · complete"
                                : dueSt === "no_date"
                                  ? ""
                                  : ` · ${dueSt.replace(/_/g, " ")}`}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                    <p className="text-xs text-white/60 print:text-black/70">
                      {item.section}
                      {item.requirementRef ? ` · ${item.requirementRef}` : ""}
                      {item.sourceType ? ` · ${item.sourceType}` : ""}
                      {item.sourceDocumentName ? ` · ${item.sourceDocumentName}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                      <Select
                        value={item.status}
                        onChange={(e) => updateItemStatus(item._id, e.target.value as ChecklistItemStatus)}
                        selectSize="sm"
                        disabled={executionLocked}
                      >
                        <option value="not_started">{getStatusLabel("not_started")}</option>
                        <option value="in_progress">{getStatusLabel("in_progress")}</option>
                        <option value="complete">{getStatusLabel("complete")}</option>
                        <option value="blocked">{getStatusLabel("blocked")}</option>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => escalateItem(item._id)}
                        disabled={Boolean(item.linkedIssueId) || executionLocked}
                      >
                        {item.linkedIssueId ? "Escalated" : "Escalate to CAR"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeItem(item._id)}
                        icon={<FiTrash2 />}
                        disabled={executionLocked}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 space-y-2 print:hidden">
                      {item.description && <p className="text-sm text-white/75">{item.description}</p>}
                      {item.evidenceHint && <p className="text-xs text-white/60">Evidence hint: {item.evidenceHint}</p>}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Owner / assignee"
                          value={ownerDraft[item._id] ?? ""}
                          onChange={(e) => setOwnerDraft((prev) => ({ ...prev, [item._id]: e.target.value }))}
                          onBlur={() => updateItemOwner(item._id)}
                          disabled={executionLocked}
                        />
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-white/60">Due date</span>
                          <input
                            type="date"
                            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                            value={dueDraft[item._id] ?? ""}
                            onChange={(e) => setDueDraft((prev) => ({ ...prev, [item._id]: e.target.value }))}
                            onBlur={() => updateItemDueDate(item._id)}
                            disabled={executionLocked}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-white/55">
                        Recurrence: set interval in months and/or days (months take precedence). Marking <strong className="text-white/80">Complete</strong> rolls
                        the next due when an interval is set.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Every N months"
                          value={intervalMonthsDraft[item._id] ?? ""}
                          onChange={(e) => setIntervalMonthsDraft((prev) => ({ ...prev, [item._id]: e.target.value }))}
                          onBlur={() => saveItemIntervals(item._id)}
                          disabled={executionLocked}
                        />
                        <Input
                          type="number"
                          min={0}
                          placeholder="Every N days"
                          value={intervalDaysDraft[item._id] ?? ""}
                          onChange={(e) => setIntervalDaysDraft((prev) => ({ ...prev, [item._id]: e.target.value }))}
                          onBlur={() => saveItemIntervals(item._id)}
                          disabled={executionLocked}
                        />
                      </div>
                      {item.lastPerformedAt ? (
                        <p className="text-xs text-white/60">Last completion (baseline): {item.lastPerformedAt}</p>
                      ) : null}
                      <p className="text-xs text-white/60">Linked issue: {item.linkedIssueId ? String(item.linkedIssueId) : "None"}</p>
                      <p className="text-xs text-white/60">Created: {new Date(item.createdAt).toLocaleString()}</p>
                      <p className="text-xs text-white/60">Updated: {new Date(item.updatedAt).toLocaleString()}</p>
                      <Input
                        placeholder="Resolution / Corrective Action"
                        value={notesDraft[item._id] ?? ""}
                        onChange={(e) => setNotesDraft((prev) => ({ ...prev, [item._id]: e.target.value }))}
                        onBlur={() => updateItemNotes(item._id)}
                        disabled={executionLocked}
                      />
                    </div>
                  )}

                  <div className="hidden print:block mt-2">
                    {item.description && <p className="text-sm text-black/80">{item.description}</p>}
                    {item.evidenceHint && <p className="text-xs text-black/70 mt-1">Evidence hint: {item.evidenceHint}</p>}
                    {displayDue ? <p className="text-xs text-black/70 mt-1">Due: {displayDue}</p> : null}
                    {(ownerDraft[item._id] || item.owner) ? (
                      <p className="text-xs text-black/70 mt-1">Owner: {ownerDraft[item._id] || item.owner}</p>
                    ) : null}
                    <p className="text-xs text-black/70 mt-1">Status: {getStatusLabel(item.status)}</p>
                    <p className="text-xs text-black/70 mt-1">Resolution / Corrective Action:</p>
                    <div className="mt-1 border border-black/40 rounded p-2 min-h-16 whitespace-pre-wrap">
                      {notesDraft[item._id] || item.notes || ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {closeCycleModalOpen && openOccurrence ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 print:hidden">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-slate-900 shadow-xl p-5 space-y-4">
            <h3 className="text-lg font-semibold text-white">Close this checklist cycle?</h3>
            <p className="text-sm text-white/70">
              This archives the current run after recording completion. You can start the next cycle from the series panel when all cycles are closed.
            </p>
            {openOccurrence.plannedDueDate ? (
              <p className="text-xs text-white/55">
                Planned due was {openOccurrence.plannedDueDate.slice(0, 10)}.
                {lateIfCloseNow ? (
                  <span className="text-amber-200"> Closing today counts as late — a reason is required.</span>
                ) : null}
              </p>
            ) : null}
            {lateIfCloseNow ? (
              <div className="space-y-1">
                <label className="text-xs text-white/60">Late reason (min. 10 characters)</label>
                <textarea
                  className="w-full min-h-[88px] rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-sky-light"
                  placeholder="Explain why this cycle closed after the planned date..."
                  value={lateReasonDraft}
                  onChange={(e) => setLateReasonDraft(e.target.value)}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setCloseCycleModalOpen(false); setLateReasonDraft(""); }}>
                Cancel
              </Button>
              <Button
                onClick={confirmCloseCycle}
                disabled={lateIfCloseNow && lateReasonDraft.trim().length < 10}
              >
                Confirm close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
