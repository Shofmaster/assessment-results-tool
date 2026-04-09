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

  // KB Currency Check (transient, not persisted)
  kbCurrencyResults: Record<string, KBDocumentCurrencyResult>;
  setKBCurrencyResult: (docId: string, result: KBDocumentCurrencyResult) => void;
  clearKBCurrencyResults: () => void;

  // Audit Simulation participants (persisted so selection is remembered on navigation)
  auditSimulationSelectedAgents: string[];
  setAuditSimulationSelectedAgents: (agentIds: string[]) => void;
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

      kbCurrencyResults: {},
      setKBCurrencyResult: (docId, result) =>
        set((state) => ({
          kbCurrencyResults: { ...state.kbCurrencyResults, [docId]: result },
        })),
      clearKBCurrencyResults: () => set({ kbCurrencyResults: {} }),

      auditSimulationSelectedAgents: AUDIT_AGENTS.map((a) => a.id),
      setAuditSimulationSelectedAgents: (agentIds) =>
        set({ auditSimulationSelectedAgents: agentIds }),
    }),
    {
      name: 'aviation-assessment-app',
      partialize: (state) => ({
        auditSimulationSelectedAgents: state.auditSimulationSelectedAgents,
      }),
    }
  )
);
