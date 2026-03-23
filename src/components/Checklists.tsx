import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FiAlertTriangle, FiCheckSquare, FiPlus, FiSave, FiUpload } from "react-icons/fi";
import { useAppStore } from "../store/appStore";
import {
  useAssessments,
  useEntityProfile,
  useUpsertEntityProfile,
  useImportEntityProfileFromAssessment,
  useChecklistRuns,
  useChecklistItems,
  useCreateChecklistRunFromTemplateAndLibrary,
  useUpdateChecklistItem,
  useAddChecklistManualItem,
  useEscalateChecklistItemToIssue,
  useChecklistCustomTemplateItems,
  useSaveChecklistCustomTemplateItems,
  useDocuments,
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
  const checklistRuns = (useChecklistRuns(activeProjectId || undefined) || []) as any[];

  const upsertProfile = useUpsertEntityProfile();
  const importProfileFromAssessment = useImportEntityProfileFromAssessment();
  const createRunFromTemplateAndLibrary = useCreateChecklistRunFromTemplateAndLibrary();
  const updateChecklistItem = useUpdateChecklistItem();
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

  useEffect(() => {
    const fromSaved = savedCustomTemplateItems.map((item: any) => ({
      title: item.title ?? "",
      description: item.description ?? "",
      severity: item.severity ?? "minor",
    }));
    setCustomItemsDraft(fromSaved.length > 0 ? [...fromSaved, { title: "", description: "", severity: "minor" }] : [{ title: "", description: "", severity: "minor" }]);
  }, [savedCustomTemplateItems, selectedFramework, selectedVariantId]);

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
    try {
      const runId = await createRunFromTemplateAndLibrary({
        projectId: activeProjectId as any,
        profileId: profile?._id,
        framework: currentTemplate.framework,
        frameworkLabel: currentTemplate.label,
        subtypeId: selectedVariant.id,
        subtypeLabel: selectedVariant.label,
        generatedFromTemplateVersion: currentTemplate.version,
        items: selectedVariant.items,
      });
      setSelectedRunId(String(runId));
      toast.success("Checklist generated with template, library requirements, and saved custom items");
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

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <FiCheckSquare className="text-sky-300" />
          Entity-Aware Checklists
        </h1>
        <p className="text-white/70 mt-1">
          Build pre-audit checklists from your entity profile and selected framework.
        </p>
      </div>

      {(profileWarning || documentWarning) && (
        <GlassCard className="p-4 mb-4 border border-amber-300/20">
          <div className="flex items-start gap-2 text-amber-200">
            <FiAlertTriangle className="mt-0.5" />
            <div className="text-sm space-y-1">
              {profileWarning && <p>Profile is incomplete. Add company, location, and scope before generating final checklist runs.</p>}
              {documentWarning && <p>No extracted document text found yet. Add project documents for better checklist readiness evidence.</p>}
            </div>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
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
          <div className="text-xs text-white/60">
            Pulls requirements from matching admin and project library documents automatically.
          </div>
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
                {run.frameworkLabel} {run.subtypeLabel ? `- ${run.subtypeLabel}` : ""} ({run.status})
              </option>
            ))}
          </Select>
          {selectedRun && (
            <div className="text-sm text-white/70">
              <p>Created: {new Date(selectedRun.createdAt).toLocaleString()}</p>
              <p>Framework: {selectedRun.frameworkLabel}</p>
            </div>
          )}
          <Button variant="secondary" onClick={addManualItem} icon={<FiPlus />} disabled={!selectedRun}>
            Add Manual Item
          </Button>
        </GlassCard>
      </div>

      <GlassCard className="p-4 mt-4">
        <h2 className="text-lg font-semibold text-white mb-3">Execution Board</h2>
        {checklistItems.length === 0 ? (
          <p className="text-white/70 text-sm">No checklist items yet. Generate a checklist run first.</p>
        ) : (
          <div className="space-y-2">
            {checklistItems.map((item: any) => (
              <div key={item._id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-white font-medium">{item.title}</p>
                    <p className="text-xs text-white/60">
                      {item.section}
                      {item.requirementRef ? ` · ${item.requirementRef}` : ""}
                      {item.sourceType ? ` · Source: ${item.sourceType}` : ""}
                      {item.sourceDocumentName ? ` · ${item.sourceDocumentName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => escalateItem(item._id)}
                      disabled={Boolean(item.linkedIssueId)}
                    >
                      {item.linkedIssueId ? "Escalated" : "Escalate to CAR"}
                    </Button>
                  </div>
                </div>
                {item.description && <p className="text-sm text-white/75 mt-2">{item.description}</p>}
                {item.evidenceHint && <p className="text-xs text-white/60 mt-1">Evidence hint: {item.evidenceHint}</p>}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
