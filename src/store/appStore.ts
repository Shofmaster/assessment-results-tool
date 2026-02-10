import { create } from 'zustand';
import type { KBDocumentCurrencyResult } from '../types/auditSimulation';

export type ViewType = 'dashboard' | 'library' | 'analysis' | 'audit' | 'settings' | 'projects' | 'revisions' | 'admin';

interface AppStore {
  // UI State
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;

  // Active project ID (Convex Id<"projects"> at runtime, stored as string)
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;

  // KB Currency Check (transient, not persisted)
  kbCurrencyResults: Record<string, KBDocumentCurrencyResult>;
  setKBCurrencyResult: (docId: string, result: KBDocumentCurrencyResult) => void;
  clearKBCurrencyResults: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),

  isAnalyzing: false,
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),

  kbCurrencyResults: {},
  setKBCurrencyResult: (docId, result) =>
    set((state) => ({
      kbCurrencyResults: { ...state.kbCurrencyResults, [docId]: result },
    })),
  clearKBCurrencyResults: () => set({ kbCurrencyResults: {} }),
}));
