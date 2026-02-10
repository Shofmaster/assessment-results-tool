import { create } from 'zustand';
import type { FileInfo, AssessmentImport, EnhancedComparisonResult } from '../types/assessment';
import type { UploadedDocument } from '../types/googleDrive';
import type { GoogleAuthState } from '../types/googleDrive';
import { hashEmail } from '../services/userStorage';
import type { Project, AgentKnowledgeBases } from '../types/project';
import type { DocumentRevision } from '../types/revisionTracking';
import type { AuditAgent, SelfReviewMode, KBDocumentCurrencyResult, SimulationResult } from '../types/auditSimulation';
import type { UserProfile } from '../types/userSession';
import {
  loadUserProjects,
  saveUserProjects,
  loadUserSettings,
  saveUserSetting,
  persistSession,
  clearPersistedSession,
  addUserToRegistry,
  migrateUnscopedData,
  saveGlobalGoogleConfig,
} from '../services/userStorage';
import { GoogleDriveService } from '../services/googleDrive';
import { SyncManager } from '../services/syncManager';
import {
  putDocumentText,
  deleteDocumentText,
  hydrateUploadedDocuments,
  hydrateAgentKnowledgeBases,
} from '../services/documentTextStore';

// Helper: save projects for the current user
function saveProjectsForUser(userHash: string | null, projects: Project[], activeProjectId: string | null) {
  if (!userHash) return;
  const sanitized = projects.map(sanitizeProjectForStorage);
  saveUserProjects(userHash, sanitized, activeProjectId);
}

function createEmptyProject(name: string, description?: string): Project {
  const now = new Date().toISOString();
  return {
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    assessments: [],
    regulatoryFiles: [],
    entityDocuments: [],
    uploadedDocuments: [],
    analyses: [],
    documentRevisions: [],
  };
}

function stripDocumentText(doc: UploadedDocument): UploadedDocument {
  const { text, ...rest } = doc;
  return rest;
}

function sanitizeAgentKnowledgeBases(bases: AgentKnowledgeBases | undefined): AgentKnowledgeBases {
  if (!bases) return {};
  const sanitized: AgentKnowledgeBases = {};
  for (const agentId of Object.keys(bases) as Array<keyof AgentKnowledgeBases>) {
    sanitized[agentId] = (bases[agentId] || []).map(stripDocumentText);
  }
  return sanitized;
}

function sanitizeProjectForStorage(project: Project): Project {
  return {
    ...project,
    uploadedDocuments: project.uploadedDocuments.map(stripDocumentText),
    agentKnowledgeBases: sanitizeAgentKnowledgeBases(project.agentKnowledgeBases),
  };
}

// Derive flat data from a project for the store
function deriveFromProject(project: Project | null): Pick<AppStore, 'regulatoryFiles' | 'entityDocuments' | 'assessments' | 'uploadedDocuments' | 'agentKnowledgeBases' | 'documentRevisions' | 'simulationResults' | 'currentAnalysis'> {
  if (!project) {
    return {
      regulatoryFiles: [],
      entityDocuments: [],
      assessments: [],
      uploadedDocuments: [],
      agentKnowledgeBases: {},
      documentRevisions: [],
      simulationResults: [],
      currentAnalysis: null,
    };
  }
  return {
    regulatoryFiles: project.regulatoryFiles,
    entityDocuments: project.entityDocuments,
    assessments: project.assessments,
    uploadedDocuments: project.uploadedDocuments,
    agentKnowledgeBases: project.agentKnowledgeBases || {},
    documentRevisions: project.documentRevisions || [],
    simulationResults: project.simulationResults || [],
    currentAnalysis: project.analyses.length > 0 ? project.analyses[project.analyses.length - 1] : null,
  };
}

type ViewType = 'dashboard' | 'library' | 'analysis' | 'audit' | 'settings' | 'projects' | 'revisions';

interface AppStore {
  // User session
  currentUser: UserProfile | null;
  isAuthChecking: boolean;
  isSyncing: boolean;

  // Auth actions
  syncClerkUser: (clerkUser: { email: string; name: string | null; picture: string | null }) => Promise<void>;
  handleSignOut: () => void;

  // Google Drive
  googleClientId: string;
  googleApiKey: string;
  setGoogleClientId: (id: string) => void;
  setGoogleApiKey: (key: string) => void;
  googleAuth: GoogleAuthState;
  setGoogleAuth: (auth: GoogleAuthState) => void;

  // Projects
  projects: Project[];
  activeProjectId: string | null;
  getActiveProject: () => Project | null;
  createProject: (name: string, description?: string) => Project;
  updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'description'>>) => void;
  deleteProject: (id: string) => void;
  setActiveProjectId: (id: string | null) => void;
  updateProjectDriveInfo: (id: string, driveFileId: string, lastSyncedAt: string) => void;
  importProject: (project: Project) => void;

  // Project-scoped data (operates on active project)
  regulatoryFiles: FileInfo[];
  entityDocuments: FileInfo[];
  assessments: AssessmentImport[];
  uploadedDocuments: UploadedDocument[];
  setRegulatoryFiles: (files: FileInfo[]) => void;
  setEntityDocuments: (files: FileInfo[]) => void;
  setAssessments: (assessments: AssessmentImport[]) => void;
  addRegulatoryFiles: (files: FileInfo[]) => void;
  addEntityDocuments: (files: FileInfo[]) => void;
  addAssessment: (assessment: AssessmentImport) => void;
  addUploadedDocument: (doc: UploadedDocument) => void;
  removeUploadedDocument: (id: string) => void;
  clearUploadedDocuments: () => void;

  // Agent Knowledge Bases (per-agent documents, scoped to active project)
  agentKnowledgeBases: AgentKnowledgeBases;
  addAgentDocument: (agentId: AuditAgent['id'], doc: UploadedDocument) => void;
  removeAgentDocument: (agentId: AuditAgent['id'], docId: string) => void;
  clearAgentDocuments: (agentId: AuditAgent['id']) => void;

  // Global Agent Knowledge Bases (shared across all projects via Google Drive)
  globalAgentKnowledgeBases: AgentKnowledgeBases;
  globalKBLoaded: boolean;
  globalKBSyncing: boolean;
  setGlobalAgentKnowledgeBases: (bases: AgentKnowledgeBases) => void;
  addGlobalAgentDocument: (agentId: AuditAgent['id'], doc: UploadedDocument) => void;
  removeGlobalAgentDocument: (agentId: AuditAgent['id'], docId: string) => void;
  clearGlobalAgentDocuments: (agentId: AuditAgent['id']) => void;
  setGlobalKBLoaded: (loaded: boolean) => void;
  setGlobalKBSyncing: (syncing: boolean) => void;

  // Document Revisions (scoped to active project)
  documentRevisions: DocumentRevision[];
  setDocumentRevisions: (revisions: DocumentRevision[]) => void;
  updateDocumentRevision: (id: string, updates: Partial<DocumentRevision>) => void;

  // Simulation Results (scoped to active project)
  simulationResults: SimulationResult[];
  addSimulationResult: (result: SimulationResult) => void;
  removeSimulationResult: (id: string) => void;

  // Current analysis (scoped to active project)
  currentAnalysis: EnhancedComparisonResult | null;
  setCurrentAnalysis: (analysis: EnhancedComparisonResult | null) => void;

  // Extended Thinking
  thinkingEnabled: boolean;
  thinkingBudget: number;
  setThinkingEnabled: (enabled: boolean) => void;
  setThinkingBudget: (budget: number) => void;

  // Self-Review Iteration
  selfReviewMode: SelfReviewMode;
  selfReviewMaxIterations: number;
  setSelfReviewMode: (mode: SelfReviewMode) => void;
  setSelfReviewMaxIterations: (max: number) => void;

  // KB Currency Check (transient, not persisted)
  kbCurrencyResults: Record<string, KBDocumentCurrencyResult>;
  setKBCurrencyResult: (docId: string, result: KBDocumentCurrencyResult) => void;
  clearKBCurrencyResults: () => void;

  // UI State
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;
}

// Singleton sync manager reference (created on sign-in)
let activeSyncManager: SyncManager | null = null;

// Helper: update a project in the projects array and persist
function updateActiveProject(
  state: { projects: Project[]; activeProjectId: string | null; currentUser: UserProfile | null },
  updater: (project: Project) => Partial<Project>
): Partial<AppStore> {
  const { projects, activeProjectId, currentUser } = state;
  if (!activeProjectId) return {};

  const idx = projects.findIndex(p => p.id === activeProjectId);
  if (idx === -1) return {};

  const project = projects[idx];
  const changes = updater(project);
  const updated = { ...project, ...changes, updatedAt: new Date().toISOString() };
  const newProjects = [...projects];
  newProjects[idx] = updated;

  saveProjectsForUser(currentUser?.userHash || null, newProjects, activeProjectId);

  // Schedule Drive sync
  if (activeSyncManager) {
    activeSyncManager.scheduleSync(newProjects);
  }

  // Derive flat arrays from updated project
  return {
    projects: newProjects,
    regulatoryFiles: updated.regulatoryFiles,
    entityDocuments: updated.entityDocuments,
    assessments: updated.assessments,
    uploadedDocuments: updated.uploadedDocuments,
    agentKnowledgeBases: updated.agentKnowledgeBases || {},
    documentRevisions: updated.documentRevisions || [],
    simulationResults: updated.simulationResults || [],
    currentAnalysis: updated.analyses.length > 0 ? updated.analyses[updated.analyses.length - 1] : null,
  };
}

function persistGlobalAgentKnowledgeBases(bases: AgentKnowledgeBases): void {
  try {
    const sanitized = sanitizeAgentKnowledgeBases(bases);
    localStorage.setItem('aviation-global-agent-kb', JSON.stringify(sanitized));
  } catch {
    /* ignore */
  }
}

async function storeGlobalAgentTexts(bases: AgentKnowledgeBases): Promise<void> {
  try {
    for (const agentId of Object.keys(bases) as Array<keyof AgentKnowledgeBases>) {
      for (const doc of bases[agentId] || []) {
        if (doc.text && doc.text.length > 0) {
          await putDocumentText('global', null, agentId, doc.id, doc.text);
        }
      }
    }
  } catch {
    /* ignore */
  }
}

async function hydrateProjectDocuments(
  projectId: string | null,
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
): Promise<void> {
  if (!projectId) return;
  const project = get().projects.find((p) => p.id === projectId);
  if (!project) return;

  let uploadedDocuments: UploadedDocument[] = project.uploadedDocuments || [];
  let agentKnowledgeBases: AgentKnowledgeBases = project.agentKnowledgeBases || {};
  try {
    uploadedDocuments = await hydrateUploadedDocuments(projectId, uploadedDocuments);
    agentKnowledgeBases = await hydrateAgentKnowledgeBases(projectId, agentKnowledgeBases);
  } catch {
    // IndexedDB unavailable — fall back to metadata-only docs
  }

  if (get().activeProjectId !== projectId) return;
  const updatedProject = { ...project, uploadedDocuments, agentKnowledgeBases };
  const newProjects = get().projects.map((p) => (p.id === projectId ? updatedProject : p));
  set({ projects: newProjects, uploadedDocuments, agentKnowledgeBases });
}

// Helper to set up sync manager and run initial sync
async function setupSyncAndRun(
  driveService: GoogleDriveService,
  userProfile: UserProfile,
  localData: { projects: Project[]; activeProjectId: string | null },
  get: () => AppStore,
  set: (partial: Partial<AppStore>) => void,
) {
  const syncManager = new SyncManager(driveService);
  activeSyncManager = syncManager;

  syncManager.setOnSyncUpdate((updatedProjects) => {
    const state = get();
    if (state.currentUser?.userHash === userProfile.userHash) {
      saveProjectsForUser(userProfile.userHash, updatedProjects, state.activeProjectId);
      set({ projects: updatedProjects });
    }
  });

  try {
    const syncResult = await syncManager.initialSync(localData.projects);
    const synced = syncResult.mergedProjects;
    const syncActiveProject = localData.activeProjectId
      ? synced.find(p => p.id === localData.activeProjectId) || (synced.length > 0 ? synced[0] : null)
      : synced.length > 0 ? synced[0] : null;
    const syncActiveId = syncActiveProject?.id || null;

    saveProjectsForUser(userProfile.userHash, synced, syncActiveId);

    set({
      projects: synced,
      activeProjectId: syncActiveId,
      isSyncing: false,
      currentView: synced.length === 0 ? 'projects' : 'dashboard',
      ...deriveFromProject(syncActiveProject),
    });
    void hydrateProjectDocuments(syncActiveId, get, (partial) => set(partial));
  } catch {
    // Drive sync failed — fall back to localStorage data
    const { projects, activeProjectId } = localData;
    const activeProject = activeProjectId
      ? projects.find(p => p.id === activeProjectId) || null
      : null;
    set({
      projects,
      activeProjectId,
      isSyncing: false,
      currentView: projects.length === 0 ? 'projects' : 'dashboard',
      ...deriveFromProject(activeProject),
    });
    void hydrateProjectDocuments(activeProjectId, get, (partial) => set(partial));
  }
}

export const useAppStore = create<AppStore>((set, get) => ({
  // User session — starts unauthenticated
  currentUser: null,
  isAuthChecking: false, // Clerk handles session loading
  isSyncing: false,

  syncClerkUser: async (clerkUser) => {
    const { email, name, picture } = clerkUser;
    const userHash = await hashEmail(email);

    // If already synced for this user, just update profile if changed
    const current = get().currentUser;
    if (current?.userHash === userHash) {
      if (current.name !== name || current.picture !== picture) {
        const updated = { ...current, name, picture };
        set({ currentUser: updated });
        persistSession(updated);
      }
      return;
    }

    const userProfile: UserProfile = { email, name, picture, userHash };

    // Migrate old unscoped data if this is the first user
    migrateUnscopedData(userProfile.userHash);

    // Persist session and update registry
    persistSession(userProfile);
    addUserToRegistry(userProfile);

    // Load user-scoped data (localStorage = cache/fallback)
    const localData = loadUserProjects(userProfile.userHash);
    const settings = loadUserSettings(userProfile.userHash);

    // Also save Google config globally for future logins
    if (settings.googleClientId && settings.googleApiKey) {
      saveGlobalGoogleConfig(settings.googleClientId, settings.googleApiKey);
    }

    // Set user profile and settings immediately, but defer project data
    set({
      currentUser: userProfile,
      isAuthChecking: false,
      isSyncing: true,
      googleClientId: settings.googleClientId,
      googleApiKey: settings.googleApiKey,
      thinkingEnabled: settings.thinkingEnabled,
      thinkingBudget: settings.thinkingBudget,
      selfReviewMode: settings.selfReviewMode as SelfReviewMode,
      selfReviewMaxIterations: settings.selfReviewMaxIterations,
    });

    // Try Drive first — it's the authoritative source
    const clientId = settings.googleClientId || get().googleClientId;
    const apiKey = settings.googleApiKey || get().googleApiKey;
    let driveLoaded = false;

    if (clientId && apiKey) {
      const driveService = new GoogleDriveService({ clientId, apiKey });
      try {
        const silentAuth = await driveService.silentSignIn();
        if (silentAuth?.isSignedIn) {
          set({ googleAuth: silentAuth });
          await setupSyncAndRun(driveService, userProfile, localData, get, (partial: Partial<AppStore>) => set(partial));
          driveLoaded = true;
        }
      } catch {
        // Silent Drive auth failed — will fall back to localStorage
      }
    }

    // Fall back to localStorage if Drive didn't load
    if (!driveLoaded) {
      const { projects, activeProjectId } = localData;
      const activeProject = activeProjectId
        ? projects.find(p => p.id === activeProjectId) || null
        : null;
      set({
        projects,
        activeProjectId,
        isSyncing: false,
        currentView: projects.length === 0 ? 'projects' : 'dashboard',
        ...deriveFromProject(activeProject),
      });
      void hydrateProjectDocuments(activeProjectId, get, (partial) => set(partial));
    }
  },

  handleSignOut: () => {
    // Cancel pending syncs
    if (activeSyncManager) {
      activeSyncManager.cancelPending();
      activeSyncManager = null;
    }

    clearPersistedSession();

    set({
      currentUser: null,
      isAuthChecking: false,
      isSyncing: false,
      googleAuth: { isSignedIn: false, userEmail: null, userName: null, userPicture: null, userHash: null },
      projects: [],
      activeProjectId: null,
      googleClientId: '',
      googleApiKey: '',
      currentView: 'projects',
      globalAgentKnowledgeBases: {},
      globalKBLoaded: false,
      globalKBSyncing: false,
      ...deriveFromProject(null),
    });
  },

  // checkPersistedSession is no longer needed — Clerk manages session persistence.
  // syncClerkUser handles loading user data when Clerk confirms auth.

  // Google Drive — scoped per user
  googleClientId: '',
  googleApiKey: '',
  setGoogleClientId: (id: string) => {
    const userHash = get().currentUser?.userHash;
    if (userHash) saveUserSetting(userHash, 'google-client-id', id);
    saveGlobalGoogleConfig(id, get().googleApiKey);
    set({ googleClientId: id });
  },
  setGoogleApiKey: (key: string) => {
    const userHash = get().currentUser?.userHash;
    if (userHash) saveUserSetting(userHash, 'google-api-key', key);
    saveGlobalGoogleConfig(get().googleClientId, key);
    set({ googleApiKey: key });
  },
  googleAuth: { isSignedIn: false, userEmail: null, userName: null, userPicture: null, userHash: null },
  setGoogleAuth: (auth: GoogleAuthState) => set({ googleAuth: auth }),

  // Projects
  projects: [],
  activeProjectId: null,

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    if (!activeProjectId) return null;
    return projects.find(p => p.id === activeProjectId) || null;
  },

  createProject: (name: string, description?: string) => {
    const project = createEmptyProject(name, description);
    const newProjects = [...get().projects, project];
    const userHash = get().currentUser?.userHash || null;
    saveProjectsForUser(userHash, newProjects, project.id);
    if (activeSyncManager) activeSyncManager.scheduleSync(newProjects);
    set({
      projects: newProjects,
      activeProjectId: project.id,
      ...deriveFromProject(project),
    });
    return project;
  },

  updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'description'>>) => {
    const { projects, activeProjectId, currentUser } = get();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return;

    const updated = { ...projects[idx], ...updates, updatedAt: new Date().toISOString() };
    const newProjects = [...projects];
    newProjects[idx] = updated;
    saveProjectsForUser(currentUser?.userHash || null, newProjects, activeProjectId);
    if (activeSyncManager) activeSyncManager.scheduleSync(newProjects);
    set({ projects: newProjects });
  },

  deleteProject: (id: string) => {
    const { projects, activeProjectId, currentUser } = get();
    const newProjects = projects.filter(p => p.id !== id);
    const newActiveId = activeProjectId === id
      ? (newProjects.length > 0 ? newProjects[0].id : null)
      : activeProjectId;
    const activeProject = newActiveId ? newProjects.find(p => p.id === newActiveId) || null : null;
    saveProjectsForUser(currentUser?.userHash || null, newProjects, newActiveId);
    if (activeSyncManager) activeSyncManager.scheduleSync(newProjects);
    set({
      projects: newProjects,
      activeProjectId: newActiveId,
      ...deriveFromProject(activeProject),
    });
  },

  setActiveProjectId: (id: string | null) => {
    const { projects, currentUser } = get();
    const project = id ? projects.find(p => p.id === id) || null : null;
    saveProjectsForUser(currentUser?.userHash || null, projects, id);
    set({
      activeProjectId: id,
      ...deriveFromProject(project),
    });
    void hydrateProjectDocuments(id, get, (partial) => set(partial));
  },

  updateProjectDriveInfo: (id: string, driveFileId: string, lastSyncedAt: string) => {
    const { projects, activeProjectId, currentUser } = get();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return;

    const updated = { ...projects[idx], driveFileId, lastSyncedAt };
    const newProjects = [...projects];
    newProjects[idx] = updated;
    saveProjectsForUser(currentUser?.userHash || null, newProjects, activeProjectId);
    set({ projects: newProjects });
  },

  importProject: (project: Project) => {
    const newProjects = [...get().projects, project];
    const userHash = get().currentUser?.userHash || null;
    saveProjectsForUser(userHash, newProjects, project.id);
    if (activeSyncManager) activeSyncManager.scheduleSync(newProjects);
    set({
      projects: newProjects,
      activeProjectId: project.id,
      ...deriveFromProject(project),
    });
    void hydrateProjectDocuments(project.id, get, (partial) => set(partial));
  },

  // Project-scoped data (derived from active project)
  ...deriveFromProject(null),

  setRegulatoryFiles: (files) =>
    set((state) => updateActiveProject(state, () => ({ regulatoryFiles: files }))),

  setEntityDocuments: (files) =>
    set((state) => updateActiveProject(state, () => ({ entityDocuments: files }))),

  setAssessments: (assessments) =>
    set((state) => updateActiveProject(state, () => ({ assessments }))),

  addRegulatoryFiles: (files) =>
    set((state) => updateActiveProject(state, (p) => ({
      regulatoryFiles: [...p.regulatoryFiles, ...files],
    }))),

  addEntityDocuments: (files) =>
    set((state) => updateActiveProject(state, (p) => ({
      entityDocuments: [...p.entityDocuments, ...files],
    }))),

  addAssessment: (assessment) =>
    set((state) => updateActiveProject(state, (p) => ({
      assessments: [...p.assessments, assessment],
    }))),

  addUploadedDocument: (doc) =>
    set((state) => {
      void putDocumentText('uploaded', state.activeProjectId, null, doc.id, doc.text || '').catch(() => {});
      return updateActiveProject(state, (p) => ({
        uploadedDocuments: [...p.uploadedDocuments, doc],
      }));
    }),

  removeUploadedDocument: (id) =>
    set((state) => {
      void deleteDocumentText('uploaded', state.activeProjectId, null, id).catch(() => {});
      return updateActiveProject(state, (p) => ({
        uploadedDocuments: p.uploadedDocuments.filter(d => d.id !== id),
      }));
    }),

  clearUploadedDocuments: () =>
    set((state) => {
      for (const doc of state.uploadedDocuments) {
        void deleteDocumentText('uploaded', state.activeProjectId, null, doc.id).catch(() => {});
      }
      return updateActiveProject(state, () => ({ uploadedDocuments: [] }));
    }),

  // Agent Knowledge Bases
  agentKnowledgeBases: {},

  addAgentDocument: (agentId, doc) =>
    set((state) => {
      void putDocumentText('agent', state.activeProjectId, agentId, doc.id, doc.text || '').catch(() => {});
      return updateActiveProject(state, (p) => {
        const bases = { ...(p.agentKnowledgeBases || {}) };
        bases[agentId] = [...(bases[agentId] || []), doc];
        return { agentKnowledgeBases: bases };
      });
    }),

  removeAgentDocument: (agentId, docId) =>
    set((state) => {
      void deleteDocumentText('agent', state.activeProjectId, agentId, docId).catch(() => {});
      return updateActiveProject(state, (p) => {
        const bases = { ...(p.agentKnowledgeBases || {}) };
        bases[agentId] = (bases[agentId] || []).filter(d => d.id !== docId);
        return { agentKnowledgeBases: bases };
      });
    }),

  clearAgentDocuments: (agentId) =>
    set((state) => {
      const docs = (state.agentKnowledgeBases[agentId] || []);
      for (const doc of docs) {
        void deleteDocumentText('agent', state.activeProjectId, agentId, doc.id).catch(() => {});
      }
      return updateActiveProject(state, (p) => {
        const bases = { ...(p.agentKnowledgeBases || {}) };
        bases[agentId] = [];
        return { agentKnowledgeBases: bases };
      });
    }),

  // Global Agent Knowledge Bases (shared via Google Drive)
  globalAgentKnowledgeBases: {},
  globalKBLoaded: false,
  globalKBSyncing: false,

  setGlobalAgentKnowledgeBases: (bases) => {
    void storeGlobalAgentTexts(bases);
    persistGlobalAgentKnowledgeBases(bases);
    set({ globalAgentKnowledgeBases: bases, globalKBLoaded: true });
  },

  addGlobalAgentDocument: (agentId, doc) =>
    set((state) => {
      const bases = { ...state.globalAgentKnowledgeBases };
      bases[agentId] = [...(bases[agentId] || []), doc];
      void putDocumentText('global', null, agentId, doc.id, doc.text || '').catch(() => {});
      persistGlobalAgentKnowledgeBases(bases);
      return { globalAgentKnowledgeBases: bases };
    }),

  removeGlobalAgentDocument: (agentId, docId) =>
    set((state) => {
      const bases = { ...state.globalAgentKnowledgeBases };
      bases[agentId] = (bases[agentId] || []).filter(d => d.id !== docId);
      void deleteDocumentText('global', null, agentId, docId).catch(() => {});
      persistGlobalAgentKnowledgeBases(bases);
      return { globalAgentKnowledgeBases: bases };
    }),

  clearGlobalAgentDocuments: (agentId) =>
    set((state) => {
      const bases = { ...state.globalAgentKnowledgeBases };
      for (const doc of bases[agentId] || []) {
        void deleteDocumentText('global', null, agentId, doc.id).catch(() => {});
      }
      bases[agentId] = [];
      persistGlobalAgentKnowledgeBases(bases);
      return { globalAgentKnowledgeBases: bases };
    }),

  setGlobalKBLoaded: (loaded) => set({ globalKBLoaded: loaded }),
  setGlobalKBSyncing: (syncing) => set({ globalKBSyncing: syncing }),

  // Document Revisions
  documentRevisions: [],

  setDocumentRevisions: (revisions) =>
    set((state) => updateActiveProject(state, () => ({ documentRevisions: revisions }))),

  updateDocumentRevision: (id, updates) =>
    set((state) => updateActiveProject(state, (p) => ({
      documentRevisions: (p.documentRevisions || []).map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }))),

  // Simulation Results
  simulationResults: [],

  addSimulationResult: (result) =>
    set((state) => updateActiveProject(state, (p) => ({
      simulationResults: [...(p.simulationResults || []), result],
    }))),

  removeSimulationResult: (id) =>
    set((state) => updateActiveProject(state, (p) => ({
      simulationResults: (p.simulationResults || []).filter(r => r.id !== id),
    }))),

  // Analysis — save to active project's analyses array
  currentAnalysis: null,
  setCurrentAnalysis: (analysis) =>
    set((state) => {
      if (!state.activeProjectId) return { currentAnalysis: analysis };

      const idx = state.projects.findIndex(p => p.id === state.activeProjectId);
      if (idx === -1) return { currentAnalysis: analysis };

      const project = state.projects[idx];
      const newAnalyses = analysis
        ? [...project.analyses, analysis]
        : project.analyses;
      const updated = { ...project, analyses: newAnalyses, updatedAt: new Date().toISOString() };
      const newProjects = [...state.projects];
      newProjects[idx] = updated;

      saveProjectsForUser(state.currentUser?.userHash || null, newProjects, state.activeProjectId);
      if (activeSyncManager) activeSyncManager.scheduleSync(newProjects);
      return { projects: newProjects, currentAnalysis: analysis };
    }),

  // Extended Thinking
  thinkingEnabled: false,
  thinkingBudget: 10000,
  setThinkingEnabled: (enabled) => {
    const userHash = get().currentUser?.userHash;
    if (userHash) saveUserSetting(userHash, 'thinking-enabled', String(enabled));
    set({ thinkingEnabled: enabled });
  },
  setThinkingBudget: (budget) => {
    const userHash = get().currentUser?.userHash;
    if (userHash) saveUserSetting(userHash, 'thinking-budget', String(budget));
    set({ thinkingBudget: budget });
  },

  // Self-Review Iteration
  selfReviewMode: 'off' as SelfReviewMode,
  selfReviewMaxIterations: 2,
  setSelfReviewMode: (mode) => {
    const userHash = get().currentUser?.userHash;
    if (userHash) saveUserSetting(userHash, 'self-review-mode', mode);
    set({ selfReviewMode: mode });
  },
  setSelfReviewMaxIterations: (max) => {
    const userHash = get().currentUser?.userHash;
    if (userHash) saveUserSetting(userHash, 'self-review-max-iterations', String(max));
    set({ selfReviewMaxIterations: max });
  },

  // KB Currency Check
  kbCurrencyResults: {},
  setKBCurrencyResult: (docId, result) =>
    set((state) => ({
      kbCurrencyResults: { ...state.kbCurrencyResults, [docId]: result },
    })),
  clearKBCurrencyResults: () => set({ kbCurrencyResults: {} }),

  // UI State
  currentView: 'projects',
  setCurrentView: (view) => set({ currentView: view }),
  isAnalyzing: false,
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
}));
