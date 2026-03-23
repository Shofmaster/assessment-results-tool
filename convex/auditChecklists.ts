import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const severityValidator = v.union(
  v.literal("critical"),
  v.literal("major"),
  v.literal("minor"),
  v.literal("observation")
);

const itemStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("blocked")
);

const runStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived")
);

const checklistItemInputValidator = v.object({
  section: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  requirementRef: v.optional(v.string()),
  evidenceHint: v.optional(v.string()),
  severity: severityValidator,
  owner: v.optional(v.string()),
  dueDate: v.optional(v.string()),
  notes: v.optional(v.string()),
});

type Severity = "critical" | "major" | "minor" | "observation";

const DOC_CATEGORIES_FOR_CHECKLISTS = new Set(["uploaded", "regulatory", "entity", "sms", "reference"]);
const MAX_DOCS_PER_RUN = 15;
const MAX_REQUIREMENTS_PER_DOC = 500;
const MAX_SENTENCE_LENGTH = 600;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function inferDocType(name: string, category?: string): string {
  const n = name.toLowerCase();
  if (/\b(isbao|is-bao)\b/.test(n)) return "isbao-standards";
  if (/\b(sms|safety\s*management)\b/.test(n) || category === "sms") return "sms-manual";
  if (/\b(training|training\s*program)\b/.test(n)) return "training-program";
  if (/\b(qcm|quality\s*control|qc\s*manual)\b/.test(n)) return "qcm";
  if (/\b(gmm|general\s*maintenance)\b/.test(n)) return "gmm";
  if (/\b(145|repair\s*station|rsm)\b/.test(n)) return "part-145-manual";
  if (/\b(91|part\s*91)\b/.test(n)) return "part-91-manual";
  if (/\b(mel|minimum\s*equipment)\b/.test(n)) return "mel";
  return "other";
}

function getRequiredDocTypes(framework: string, subtypeId?: string): string[] {
  if (framework === "isbao") {
    return ["isbao-standards", "sms-manual", "training-program", "part-91-manual", "ops-specs", "qcm"];
  }
  if (framework === "faa-part-145") {
    return ["part-145-manual", "gmm", "qcm", "training-program", "ops-specs", "ipm", "tool-calibration"];
  }
  if (framework === "easa-part-145") {
    return ["part-145-manual", "gmm", "qcm", "training-program", "ipm"];
  }
  if (framework === "as9100") {
    return ["qcm", "training-program", "gmm", "ipm", "tool-calibration"];
  }
  if (subtypeId?.includes("stage")) {
    return ["isbao-standards", "sms-manual", "training-program"];
  }
  return ["gmm", "qcm", "training-program", "sms-manual", "other"];
}

function toSeverityFromSentence(sentence: string): Severity {
  const s = sentence.toLowerCase();
  if (/\b(immediate|critical|prohibited|must not)\b/.test(s)) return "critical";
  if (/\b(must|shall|required)\b/.test(s)) return "major";
  if (/\b(should|recommended)\b/.test(s)) return "minor";
  return "observation";
}

function splitIntoCandidateSentences(text: string): string[] {
  const flattened = text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!flattened) return [];

  const raw = flattened
    .split(/(?<=[.!?;])\s+|\n/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return raw.filter((sentence) => sentence.length >= 40 && sentence.length <= MAX_SENTENCE_LENGTH);
}

function isLikelyNoise(sentence: string): boolean {
  const s = sentence.toLowerCase().trim();
  if (!s) return true;
  if (/^(table of contents|contents|index|revision history|copyright)/i.test(s)) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(s)) return true;
  if (/^\d+(\.\d+)*\s*$/.test(s)) return true;
  if ((s.match(/\d+/g) || []).length > 8 && s.length < 140) return true;
  if (s.split(" ").length < 7) return true;
  return false;
}

function extractRequirementRef(sentence: string): string | undefined {
  const explicitRef = sentence.match(
    /\b(section|clause|para(?:graph)?|appendix|chapter|part)\s+([a-z0-9]+(?:[.\-][a-z0-9]+)*)/i
  );
  if (explicitRef) {
    return `${explicitRef[1]} ${explicitRef[2]}`;
  }
  const numberedBullet = sentence.match(/^(\d+(?:\.\d+){1,4}|[a-z]\)|\([a-z0-9]+\))\s+/i);
  if (numberedBullet) {
    return numberedBullet[1];
  }
  return undefined;
}

function cleanSentence(sentence: string): string {
  return sentence
    .replace(/^[\s\-*•]+/, "")
    .replace(/^\(?\d+(?:\.\d+){0,4}\)?[\]\).:-]?\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRequirementsFromText(text: string): Array<{ title: string; description?: string; requirementRef?: string; severity: Severity; }> {
  const candidates = splitIntoCandidateSentences(text)
    .filter((sentence) => !isLikelyNoise(sentence));

  const dedup = new Set<string>();
  const extracted: Array<{ title: string; description?: string; requirementRef?: string; severity: Severity; }> = [];
  for (const sentence of candidates) {
    if (extracted.length >= MAX_REQUIREMENTS_PER_DOC) break;
    const clean = cleanSentence(sentence);
    const normalized = normalizeText(clean);
    if (!normalized || dedup.has(normalized)) continue;
    dedup.add(normalized);

    const requirementRef = extractRequirementRef(clean);
    const title = clean.length > 145 ? `${clean.slice(0, 142).trimEnd()}...` : clean;
    extracted.push({
      title,
      description: clean.length > 145 ? clean : undefined,
      requirementRef,
      severity: toSeverityFromSentence(clean),
    });
  }
  return extracted;
}

async function generateCarNumber(ctx: any, projectId: string): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await ctx.db
    .query("entityIssues")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .collect();
  const yearPrefix = `CAR-${year}-`;
  const nums = existing
    .map((i: any) => i.carNumber)
    .filter((n: string | undefined) => n && n.startsWith(yearPrefix))
    .map((n: string) => parseInt(n.slice(yearPrefix.length), 10))
    .filter((n: number) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${yearPrefix}${String(next).padStart(3, "0")}`;
}

export const listRunsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("auditChecklistRuns")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listItemsByRun = query({
  args: { checklistRunId: v.id("auditChecklistRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    await requireProjectOwner(ctx, run.projectId);
    return await ctx.db
      .query("auditChecklistItems")
      .withIndex("by_checklistRunId", (q) => q.eq("checklistRunId", args.checklistRunId))
      .collect();
  },
});

export const createRunFromTemplate = mutation({
  args: {
    projectId: v.id("projects"),
    profileId: v.optional(v.id("entityProfiles")),
    name: v.optional(v.string()),
    framework: v.string(),
    frameworkLabel: v.string(),
    subtypeId: v.optional(v.string()),
    subtypeLabel: v.optional(v.string()),
    generatedFromTemplateVersion: v.string(),
    notes: v.optional(v.string()),
    items: v.array(checklistItemInputValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const runId = await ctx.db.insert("auditChecklistRuns", {
      projectId: args.projectId,
      userId,
      profileId: args.profileId,
      name: args.name,
      framework: args.framework,
      frameworkLabel: args.frameworkLabel,
      subtypeId: args.subtypeId,
      subtypeLabel: args.subtypeLabel,
      status: "active",
      generatedFromTemplateVersion: args.generatedFromTemplateVersion,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await ctx.db.insert("auditChecklistItems", {
        projectId: args.projectId,
        userId,
        checklistRunId: runId,
        framework: args.framework,
        subtypeId: args.subtypeId,
        section: item.section,
        title: item.title,
        description: item.description,
        requirementRef: item.requirementRef,
        evidenceHint: item.evidenceHint,
        severity: item.severity,
        status: "not_started",
        owner: item.owner,
        dueDate: item.dueDate,
        notes: item.notes,
        sourceType: "template",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return runId;
  },
});

export const listCustomTemplateItems = query({
  args: {
    projectId: v.id("projects"),
    framework: v.string(),
    subtypeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const template = await ctx.db
      .query("checklistCustomTemplates")
      .withIndex("by_project_framework_subtype", (q) =>
        q.eq("projectId", args.projectId).eq("framework", args.framework).eq("subtypeId", args.subtypeId)
      )
      .first();
    return template?.items ?? [];
  },
});

export const saveCustomTemplateItems = mutation({
  args: {
    projectId: v.id("projects"),
    framework: v.string(),
    subtypeId: v.optional(v.string()),
    subtypeLabel: v.optional(v.string()),
    items: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      severity: severityValidator,
      requirementRef: v.optional(v.string()),
      evidenceHint: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("checklistCustomTemplates")
      .withIndex("by_project_framework_subtype", (q) =>
        q.eq("projectId", args.projectId).eq("framework", args.framework).eq("subtypeId", args.subtypeId)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        subtypeLabel: args.subtypeLabel,
        items: args.items,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("checklistCustomTemplates", {
      projectId: args.projectId,
      userId,
      framework: args.framework,
      subtypeId: args.subtypeId,
      subtypeLabel: args.subtypeLabel,
      items: args.items,
      createdAt: now,
      updatedAt: now,
    });
  },
});

const createRunFromTemplateAndLibraryArgs = {
  projectId: v.id("projects"),
  profileId: v.optional(v.id("entityProfiles")),
  name: v.optional(v.string()),
  framework: v.string(),
  frameworkLabel: v.string(),
  subtypeId: v.optional(v.string()),
  subtypeLabel: v.optional(v.string()),
  generatedFromTemplateVersion: v.string(),
  notes: v.optional(v.string()),
  items: v.array(checklistItemInputValidator),
  selectedProjectDocumentIds: v.optional(v.array(v.id("documents"))),
  selectedSharedReferenceDocumentIds: v.optional(v.array(v.id("sharedReferenceDocuments"))),
};

const handleCreateRunFromTemplateAndLibrary = async (ctx: any, args: any) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const requiredDocTypes = new Set(getRequiredDocTypes(args.framework, args.subtypeId));

    const hasProjectSelection = Boolean(args.selectedProjectDocumentIds && args.selectedProjectDocumentIds.length > 0);
    const hasSharedSelection = Boolean(args.selectedSharedReferenceDocumentIds && args.selectedSharedReferenceDocumentIds.length > 0);
    let usableProjectDocs: any[] = [];
    let usableSharedDocs: any[] = [];

    if (hasProjectSelection || hasSharedSelection) {
      const selectedProjectIds = new Set(args.selectedProjectDocumentIds ?? []);
      const selectedSharedIds = new Set(args.selectedSharedReferenceDocumentIds ?? []);

      if (selectedProjectIds.size > 0) {
        const projectDocs = await ctx.db
          .query("documents")
          .withIndex("by_projectId", (q: any) => q.eq("projectId", args.projectId))
          .collect();
        usableProjectDocs = projectDocs
          .filter((doc: any) => selectedProjectIds.has(doc._id))
          .filter((doc: any) => DOC_CATEGORIES_FOR_CHECKLISTS.has(doc.category))
          .filter((doc: any) => Boolean(doc.extractedText?.trim()));
      }

      if (selectedSharedIds.size > 0) {
        const sharedDocs = await ctx.db.query("sharedReferenceDocuments").collect();
        usableSharedDocs = sharedDocs
          .filter((doc: any) => selectedSharedIds.has(doc._id))
          .filter((doc: any) => Boolean(doc.extractedText?.trim()));
      }
    } else {
      const projectDocs = await ctx.db
        .query("documents")
        .withIndex("by_projectId", (q: any) => q.eq("projectId", args.projectId))
        .collect();
      usableProjectDocs = projectDocs
        .filter((doc: any) => DOC_CATEGORIES_FOR_CHECKLISTS.has(doc.category))
        .filter((doc: any) => Boolean(doc.extractedText?.trim()))
        .filter((doc: any) => requiredDocTypes.has(inferDocType(doc.name, doc.category)) || requiredDocTypes.has("other"))
        .slice(0, MAX_DOCS_PER_RUN);

      const sharedDocs = await ctx.db.query("sharedReferenceDocuments").collect();
      usableSharedDocs = sharedDocs
        .filter((doc: any) => Boolean(doc.extractedText?.trim()))
        .filter((doc: any) => requiredDocTypes.has(doc.documentType))
        .slice(0, MAX_DOCS_PER_RUN);
    }

    const savedCustomTemplate = await ctx.db
      .query("checklistCustomTemplates")
      .withIndex("by_project_framework_subtype", (q: any) =>
        q.eq("projectId", args.projectId).eq("framework", args.framework).eq("subtypeId", args.subtypeId)
      )
      .first();

    const runId = await ctx.db.insert("auditChecklistRuns", {
      projectId: args.projectId,
      userId,
      profileId: args.profileId,
      name: args.name,
      framework: args.framework,
      frameworkLabel: args.frameworkLabel,
      subtypeId: args.subtypeId,
      subtypeLabel: args.subtypeLabel,
      status: "active",
      generatedFromTemplateVersion: args.generatedFromTemplateVersion,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    const titleDedup = new Set<string>();
    const insertItem = async (item: {
      section: string;
      title: string;
      description?: string;
      requirementRef?: string;
      evidenceHint?: string;
      severity: Severity;
      owner?: string;
      dueDate?: string;
      notes?: string;
      sourceType: "template" | "document" | "custom";
      sourceDocumentId?: any;
      sourceDocumentName?: string;
    }) => {
      const titleKey = normalizeText(item.title);
      if (!titleKey || titleDedup.has(titleKey)) return;
      titleDedup.add(titleKey);
      await ctx.db.insert("auditChecklistItems", {
        projectId: args.projectId,
        userId,
        checklistRunId: runId,
        framework: args.framework,
        subtypeId: args.subtypeId,
        section: item.section,
        title: item.title,
        description: item.description,
        requirementRef: item.requirementRef,
        evidenceHint: item.evidenceHint,
        severity: item.severity,
        status: "not_started",
        owner: item.owner,
        dueDate: item.dueDate,
        notes: item.notes,
        sourceType: item.sourceType,
        sourceDocumentId: item.sourceDocumentId,
        sourceDocumentName: item.sourceDocumentName,
        createdAt: now,
        updatedAt: now,
      });
    };

    for (const item of args.items) {
      await insertItem({
        section: item.section,
        title: item.title,
        description: item.description,
        requirementRef: item.requirementRef,
        evidenceHint: item.evidenceHint,
        severity: item.severity as Severity,
        owner: item.owner,
        dueDate: item.dueDate,
        notes: item.notes,
        sourceType: "template",
      });
    }
    for (const doc of usableProjectDocs) {
      const extracted = extractRequirementsFromText(doc.extractedText ?? "");
      for (const req of extracted) {
        await insertItem({
          section: "Library Requirements",
          title: req.title,
          description: req.description,
          requirementRef: req.requirementRef,
          severity: req.severity,
          sourceType: "document",
          sourceDocumentId: doc._id,
          sourceDocumentName: doc.name,
        });
      }
    }
    for (const doc of usableSharedDocs) {
      const extracted = extractRequirementsFromText(doc.extractedText ?? "");
      for (const req of extracted) {
        await insertItem({
          section: "Library Requirements",
          title: req.title,
          description: req.description,
          requirementRef: req.requirementRef,
          severity: req.severity,
          sourceType: "document",
          sourceDocumentId: doc._id,
          sourceDocumentName: doc.name,
        });
      }
    }
    for (const item of savedCustomTemplate?.items ?? []) {
      await insertItem({
        section: "Custom Items",
        title: item.title,
        description: item.description,
        requirementRef: item.requirementRef,
        evidenceHint: item.evidenceHint,
        severity: item.severity as Severity,
        notes: item.notes,
        sourceType: "custom",
      });
    }

    await ctx.db.patch(args.projectId, { updatedAt: now });
    return runId;
};

export const createRunFromTemplateAndLibrary = mutation({
  args: createRunFromTemplateAndLibraryArgs,
  handler: handleCreateRunFromTemplateAndLibrary,
});

export const createRunFromSelectedDocuments = mutation({
  args: createRunFromTemplateAndLibraryArgs,
  handler: handleCreateRunFromTemplateAndLibrary,
});

export const updateRun = mutation({
  args: {
    checklistRunId: v.id("auditChecklistRuns"),
    status: v.optional(runStatusValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    await requireProjectOwner(ctx, run.projectId);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status === "completed") patch.completedAt = new Date().toISOString();
    await ctx.db.patch(args.checklistRunId, patch);
    await ctx.db.patch(run.projectId, { updatedAt: new Date().toISOString() });
    return args.checklistRunId;
  },
});

export const deleteRun = mutation({
  args: {
    checklistRunId: v.id("auditChecklistRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    await requireProjectOwner(ctx, run.projectId);

    const items = await ctx.db
      .query("auditChecklistItems")
      .withIndex("by_checklistRunId", (q) => q.eq("checklistRunId", args.checklistRunId))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    await ctx.db.delete(args.checklistRunId);
    await ctx.db.patch(run.projectId, { updatedAt: new Date().toISOString() });
    return args.checklistRunId;
  },
});

export const updateItem = mutation({
  args: {
    checklistItemId: v.id("auditChecklistItems"),
    status: v.optional(itemStatusValidator),
    severity: v.optional(severityValidator),
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) throw new Error("Checklist item not found");
    await requireProjectOwner(ctx, item.projectId);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.severity !== undefined) patch.severity = args.severity;
    if (args.owner !== undefined) patch.owner = args.owner;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status === "complete") {
      patch.completedAt = new Date().toISOString();
    }
    await ctx.db.patch(args.checklistItemId, patch);
    await ctx.db.patch(item.checklistRunId, { updatedAt: new Date().toISOString() });
    await ctx.db.patch(item.projectId, { updatedAt: new Date().toISOString() });
    return args.checklistItemId;
  },
});

export const deleteItem = mutation({
  args: {
    checklistItemId: v.id("auditChecklistItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) throw new Error("Checklist item not found");
    await requireProjectOwner(ctx, item.projectId);
    await ctx.db.delete(args.checklistItemId);
    const now = new Date().toISOString();
    await ctx.db.patch(item.checklistRunId, { updatedAt: now });
    await ctx.db.patch(item.projectId, { updatedAt: now });
    return args.checklistItemId;
  },
});

export const addManualItem = mutation({
  args: {
    checklistRunId: v.id("auditChecklistRuns"),
    section: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    requirementRef: v.optional(v.string()),
    evidenceHint: v.optional(v.string()),
    severity: severityValidator,
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    const userId = await requireProjectOwner(ctx, run.projectId);
    const now = new Date().toISOString();
    const itemId = await ctx.db.insert("auditChecklistItems", {
      projectId: run.projectId,
      userId,
      checklistRunId: args.checklistRunId,
      framework: run.framework,
      subtypeId: run.subtypeId,
      section: args.section,
      title: args.title,
      description: args.description,
      requirementRef: args.requirementRef,
      evidenceHint: args.evidenceHint,
      severity: args.severity,
      status: "not_started",
      owner: args.owner,
      dueDate: args.dueDate,
      notes: args.notes,
      sourceType: "manual",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(run._id, { updatedAt: now });
    await ctx.db.patch(run.projectId, { updatedAt: now });
    return itemId;
  },
});

export const escalateItemToIssue = mutation({
  args: {
    checklistItemId: v.id("auditChecklistItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) throw new Error("Checklist item not found");
    await requireProjectOwner(ctx, item.projectId);
    if (item.linkedIssueId) return item.linkedIssueId;

    const carNumber = await generateCarNumber(ctx, item.projectId);
    const now = new Date().toISOString();
    const issueId = await ctx.db.insert("entityIssues", {
      projectId: item.projectId,
      userId: item.userId,
      source: "manual",
      sourceId: String(item._id),
      severity: item.severity,
      title: item.title,
      description: item.description ?? item.notes ?? "Checklist item escalated to CAR/Issue",
      regulationRef: item.requirementRef,
      createdAt: now,
      status: "open",
      carNumber,
      owner: item.owner,
      dueDate: item.dueDate,
    });
    await ctx.db.patch(args.checklistItemId, {
      linkedIssueId: issueId,
      status: item.status === "complete" ? item.status : "blocked",
      updatedAt: now,
    });
    await ctx.db.patch(item.checklistRunId, { updatedAt: now });
    await ctx.db.patch(item.projectId, { updatedAt: now });
    return issueId;
  },
});
