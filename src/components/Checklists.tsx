import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  FiAlertTriangle,
  FiCheckSquare,
  FiChevronDown,
  FiChevronUp,
  FiPlus,
  FiPrinter,
  FiSave,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import { useAppStore } from "../store/appStore";
import {
  useAddChecklistManualItem,
  useAllSharedReferenceDocs,
  useAssessments,
  useChecklistCustomTemplateItems,
  useChecklistItems,
  useChecklistRuns,
  useCreateChecklistRunFromSelectedDocs,
  useDeleteChecklistItem,
  useDeleteChecklistRun,
  useDocuments,
  useEntityProfile,
  useEscalateChecklistItemToIssue,
  useImportEntityProfileFromAssessment,
  useSaveChecklistCustomTemplateItems,
  useUpdateChecklistItem,
  useUpsertEntityProfile,
} from "../hooks/useConvexData";
import { useFocusViewHeading } from "../hooks/useFocusViewHeading";
import { AUDIT_CHECKLIST_TEMPLATES, getFrameworkTemplate } from "../config/auditChecklistTemplates";
import { Button, GlassCard, Input, Select } from "./ui";

type ChecklistItemStatus = "not_started" | "in_progress" | "complete" | "blocked";

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
  const activeProjectId = useAppStore((state) => state.activeProjectId);

  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const profile = useEntityProfile(activeProjectId || undefined) as any;
  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const sharedReferenceDocuments = (useAllSharedReferenceDocs() || []) as any[];
  const checklistRuns = (useChecklistRuns(activeProjectId || undefined) || []) as any[];

  const upsertProfile = useUpsertEntityProfile();
  const importProfileFromAssessment = useImportEntityProfileFromAssessment();
  const createRunFromSelectedDocs = useCreateChecklistRunFromSelectedDocs();
  const updateChecklistItem = useUpdateChecklistItem();
  const deleteChecklistItem = useDeleteChecklistItem();
  const deleteChecklistRun = useDeleteChecklistRun();
  const addChecklistManualItem = useAddChecklistManualItem();
  const escalateChecklistItemToIssue = useEscalateChecklistItemToIssue();
  const saveChecklistCustomTemplateItems = useSaveChecklistCustomTemplateItems();

  const [selectedFramework, setSelectedFramework] = useState<string>(AUDIT_CHECKLIST_TEMPLATES[0]?.framework ?? "faa");
  const currentTemplate = useMemo(
    () => getFrameworkTemplate(selectedFramework) ?? AUDIT_CHECKLIST_TEMPLATES[0],
    [selectedFramework]
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
  const [customItemsDraft, setCustomItemsDraft] = useState<Array<{ title: string; description: string; severity: "critical" | "major" | "minor" | "observation" }>>([
    { title: "", description: "", severity: "minor" },
  ]);
  const [checklistName, setChecklistName] = useState("");
  const [selectedProjectDocumentIds, setSelectedProjectDocumentIds] = useState<string[]>([]);
  const [selectedSharedReferenceDocumentIds, setSelectedSharedReferenceDocumentIds] = useState<string[]>([]);
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const [profileForm, setProfileForm] = useState({
    companyName: profile?.companyName ?? "",
    legalEntityName: profile?.legalEntityName ?? "",
    primaryLocation: profile?.primaryLocation ?? "",
    contactName: profile?.contactName ?? "",
    contactEmail: profile?.contactEmail ?? "",
    contactPhone: profile?.contactPhone ?? "",
    repairStationType: profile?.repairStationType ?? "",
    facilitySquareFootage: profile?.facilitySquareFootage ? String(profile.facilitySquareFootage) : "",
    employeeCount: profile?.employeeCount ? String(profile.employeeCount) : "",
    operationsScope: profile?.operationsScope ?? "",
    smsMaturity: profile?.smsMaturity ?? "",
  });

  const docsWithText = allDocuments.filter((doc) => (doc.extractedText || "").trim().length > 0).length;
  const profileCompleteness = [profileForm.companyName, profileForm.primaryLocation, profileForm.operationsScope].filter(Boolean).length;
  const profileWarning = profileCompleteness < 2;
  const documentWarning = docsWithText === 0;
  const allExpanded = checklistItems.length > 0 && checklistItems.every((item) => Boolean(expandedItemIds[item._id]));

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
    const next: Record<string, string> = {};
    for (const item of checklistItems) {
      next[item._id] = item.notes ?? "";
    }
    setNotesDraft(next);
  }, [selectedRun?._id, checklistItems]);

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

  const saveProfile = async () => {
    try {
      await upsertProfile({
        projectId: activeProjectId as any,
        companyName: profileForm.companyName || undefined,
        legalEntityName: profileForm.legalEntityName || undefined,
        primaryLocation: profileForm.primaryLocation || undefined,
        contactName: profileForm.contactName || undefined,
        contactEmail: profileForm.contactEmail || undefined,
        contactPhone: profileForm.contactPhone || undefined,
        repairStationType: profileForm.repairStationType || undefined,
        facilitySquareFootage: profileForm.facilitySquareFootage ? Number(profileForm.facilitySquareFootage) : undefined,
        employeeCount: profileForm.employeeCount ? Number(profileForm.employeeCount) : undefined,
        operationsScope: profileForm.operationsScope || undefined,
        smsMaturity: profileForm.smsMaturity || undefined,
      });
      toast.success("Entity profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save profile");
    }
  };

  const runImport = async (assessmentId: string) => {
    try {
      await importProfileFromAssessment({
        projectId: activeProjectId as any,
        assessmentId: assessmentId as any,
      });
      toast.success("Profile imported from assessment");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
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

  const addManualItem = async () => {
    if (!selectedRun?._id) return;
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
    const next: Record<string, boolean> = {};
    for (const item of checklistItems) {
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
          <h2 className="text-lg font-semibold text-white">Entity Profile</h2>
          <Input placeholder="Company Name" value={profileForm.companyName} onChange={(e) => setProfileForm((s) => ({ ...s, companyName: e.target.value }))} />
          <Input placeholder="Legal Entity Name" value={profileForm.legalEntityName} onChange={(e) => setProfileForm((s) => ({ ...s, legalEntityName: e.target.value }))} />
          <Input placeholder="Primary Location" value={profileForm.primaryLocation} onChange={(e) => setProfileForm((s) => ({ ...s, primaryLocation: e.target.value }))} />
          <Input placeholder="Repair Station Type" value={profileForm.repairStationType} onChange={(e) => setProfileForm((s) => ({ ...s, repairStationType: e.target.value }))} />
          <Input placeholder="Facility Sq Ft" value={profileForm.facilitySquareFootage} onChange={(e) => setProfileForm((s) => ({ ...s, facilitySquareFootage: e.target.value }))} />
          <Input placeholder="Employee Count" value={profileForm.employeeCount} onChange={(e) => setProfileForm((s) => ({ ...s, employeeCount: e.target.value }))} />
          <Input placeholder="Operations Scope" value={profileForm.operationsScope} onChange={(e) => setProfileForm((s) => ({ ...s, operationsScope: e.target.value }))} />
          <Input placeholder="SMS Maturity" value={profileForm.smsMaturity} onChange={(e) => setProfileForm((s) => ({ ...s, smsMaturity: e.target.value }))} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveProfile} icon={<FiSave />}>Save Profile</Button>
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) runImport(e.target.value);
              }}
              className="min-w-[220px]"
            >
              <option value="">Import from assessment...</option>
              {assessments.map((assessment) => (
                <option key={assessment._id} value={assessment._id}>
                  {assessment.data?.companyName || "Assessment"} - {new Date(assessment.importedAt).toLocaleDateString()}
                </option>
              ))}
            </Select>
          </div>
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
            {AUDIT_CHECKLIST_TEMPLATES.map((template) => (
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
            <Button variant="secondary" onClick={addManualItem} icon={<FiPlus />} disabled={!selectedRun}>
              Add Manual Item
            </Button>
            <Button variant="secondary" onClick={handlePrint} icon={<FiPrinter />} disabled={!selectedRun}>
              Print Checklist
            </Button>
            <Button variant="destructive" onClick={removeRun} icon={<FiTrash2 />} disabled={!selectedRun}>
              Delete Run
            </Button>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4 mt-4 checklist-print-board">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white print:text-black">Execution Board</h2>
          <div className="print:hidden">
            <Button variant="secondary" size="sm" onClick={toggleAllExpanded}>
              {allExpanded ? "Collapse All" : "Expand All"}
            </Button>
          </div>
        </div>
        {selectedRun && (
          <div className="hidden print:block text-black text-sm mb-3">
            <p>Checklist: {selectedRun.name || "Untitled checklist"}</p>
            <p>Framework: {selectedRun.frameworkLabel}</p>
            <p>Date: {new Date(selectedRun.createdAt).toLocaleString()}</p>
            <p>Entity: {profileForm.companyName || "N/A"} ({profileForm.primaryLocation || "N/A"})</p>
          </div>
        )}
        {checklistItems.length === 0 ? (
          <p className="text-white/70 text-sm">No checklist items yet. Generate a checklist run first.</p>
        ) : (
          <div className="space-y-2">
            {checklistItems.map((item: any) => {
              const expanded = Boolean(expandedItemIds[item._id]);
              return (
                <div key={item._id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 checklist-print-item">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => toggleItemExpanded(item._id)} className="text-left flex items-center gap-2">
                      {expanded ? <FiChevronUp className="text-white/60 print:hidden" /> : <FiChevronDown className="text-white/60 print:hidden" />}
                      <div>
                        <p className="text-white print:text-black font-medium">{item.title}</p>
                        <p className="text-xs text-white/60 print:text-black/70">Severity: {item.severity}</p>
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
                      >
                        <option value="not_started">{getStatusLabel("not_started")}</option>
                        <option value="in_progress">{getStatusLabel("in_progress")}</option>
                        <option value="complete">{getStatusLabel("complete")}</option>
                        <option value="blocked">{getStatusLabel("blocked")}</option>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => escalateItem(item._id)} disabled={Boolean(item.linkedIssueId)}>
                        {item.linkedIssueId ? "Escalated" : "Escalate to CAR"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => removeItem(item._id)} icon={<FiTrash2 />}>
                        Delete
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 space-y-2 print:hidden">
                      {item.description && <p className="text-sm text-white/75">{item.description}</p>}
                      {item.evidenceHint && <p className="text-xs text-white/60">Evidence hint: {item.evidenceHint}</p>}
                      <p className="text-xs text-white/60">Linked issue: {item.linkedIssueId ? String(item.linkedIssueId) : "None"}</p>
                      <p className="text-xs text-white/60">Created: {new Date(item.createdAt).toLocaleString()}</p>
                      <p className="text-xs text-white/60">Updated: {new Date(item.updatedAt).toLocaleString()}</p>
                      <Input
                        placeholder="Resolution / Corrective Action"
                        value={notesDraft[item._id] ?? ""}
                        onChange={(e) => setNotesDraft((prev) => ({ ...prev, [item._id]: e.target.value }))}
                        onBlur={() => updateItemNotes(item._id)}
                      />
                    </div>
                  )}

                  <div className="hidden print:block mt-2">
                    {item.description && <p className="text-sm text-black/80">{item.description}</p>}
                    {item.evidenceHint && <p className="text-xs text-black/70 mt-1">Evidence hint: {item.evidenceHint}</p>}
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
    </div>
  );
}
