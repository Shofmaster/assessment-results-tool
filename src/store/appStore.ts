import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KBDocumentCurrencyResult } from '../types/auditSimulation';
import { AUDIT_AGENTS } from '../services/auditAgents';

interface AppStore {
  // UI State
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;

  // Active project ID (Convex Id<"projects"> at runtime, stored as string)
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;

  // Navigate to a view (e.g. 'projects', 'settings'); App syncs this to react-router
  currentView: string | null;
  setCurrentView: (view: string | null) => void;

  /** Preferred standard(s) for logbook entry review (multi-select). */
  logbookReviewStandards: string[];
  setLogbookReviewStandards: (standards: string[]) => void;
  /** Deprecated — kept for migration from the single-standard version. */
  logbookReviewStandard?: string;

  // KB Currency Check (transient, not persisted)
  kbCurrencyResults: Record<string, KBDocumentCurrencyResult>;
  setKBCurrencyResult: (docId: string, result: KBDocumentCurrencyResult) => void;
  clearKBCurrencyResults: () => void;

  // Audit Simulation participants (persisted so selection is remembered on navigation)
  auditSimulationSelectedAgents: string[];
  setAuditSimulationSelectedAgents: (agentIds: string[]) => void;

  /**
   * Per-company UI state for Company Library folder filter.
   * Values: '__ALL__' (show all folders), '__ROOT__' (root-only), or a libraryFolders id string.
   */
  companyLibraryFolderByCompanyId: Record<string, string>;
  setCompanyLibraryFolderSelection: (companyId: string, folderId: string | null | undefined) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      isAnalyzing: false,
      setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

      activeProjectId: null,
      setActiveProjectId: (id) => set({ activeProjectId: id }),

      currentView: null,
      setCurrentView: (view) => set({ currentView: view }),

      logbookReviewStandards: ['part_43_general'],
      setLogbookReviewStandards: (standards) => set({ logbookReviewStandards: standards }),

      kbCurrencyResults: {},
      setKBCurrencyResult: (docId, result) =>
        set((state) => ({
          kbCurrencyResults: { ...state.kbCurrencyResults, [docId]: result },
        })),
      clearKBCurrencyResults: () => set({ kbCurrencyResults: {} }),

      auditSimulationSelectedAgents: AUDIT_AGENTS.map((a) => a.id),
      setAuditSimulationSelectedAgents: (agentIds) =>
        set({ auditSimulationSelectedAgents: agentIds }),

      companyLibraryFolderByCompanyId: {},
      setCompanyLibraryFolderSelection: (companyId, folderId) =>
        set((state) => {
          const encoded =
            folderId === undefined ? '__ALL__' : folderId === null ? '__ROOT__' : String(folderId);
          return {
            companyLibraryFolderByCompanyId: {
              ...state.companyLibraryFolderByCompanyId,
              [companyId]: encoded,
            },
          };
        }),
    }),
    {
      name: 'aviation-assessment-app',
      partialize: (state) => ({
        auditSimulationSelectedAgents: state.auditSimulationSelectedAgents,
        logbookReviewStandards: state.logbookReviewStandards,
        companyLibraryFolderByCompanyId: state.companyLibraryFolderByCompanyId,
      }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<AppStore> & { logbookReviewStandard?: string };
        if (!state.companyLibraryFolderByCompanyId || typeof state.companyLibraryFolderByCompanyId !== 'object') {
          state.companyLibraryFolderByCompanyId = {};
        }
        if (!state.logbookReviewStandards && typeof state.logbookReviewStandard === 'string') {
          state.logbookReviewStandards = [state.logbookReviewStandard];
        }
        return state as AppStore;
      },
      version: 3,
    }
  )
);
