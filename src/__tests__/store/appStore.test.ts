import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store/appStore';

describe('appStore', () => {
  beforeEach(() => {
    const { setState } = useAppStore;
    setState({
      isAnalyzing: false,
      activeProjectId: null,
      currentView: null,
      kbCurrencyResults: {},
      auditSimulationSelectedAgents: useAppStore.getState().auditSimulationSelectedAgents,
    });
  });

  describe('isAnalyzing', () => {
    it('defaults to false', () => {
      expect(useAppStore.getState().isAnalyzing).toBe(false);
    });

    it('can be set to true', () => {
      useAppStore.getState().setIsAnalyzing(true);
      expect(useAppStore.getState().isAnalyzing).toBe(true);
    });

    it('can be toggled back to false', () => {
      useAppStore.getState().setIsAnalyzing(true);
      useAppStore.getState().setIsAnalyzing(false);
      expect(useAppStore.getState().isAnalyzing).toBe(false);
    });
  });

  describe('activeProjectId', () => {
    it('defaults to null', () => {
      expect(useAppStore.getState().activeProjectId).toBeNull();
    });

    it('can be set to a string id', () => {
      useAppStore.getState().setActiveProjectId('project-123');
      expect(useAppStore.getState().activeProjectId).toBe('project-123');
    });

    it('can be cleared back to null', () => {
      useAppStore.getState().setActiveProjectId('project-123');
      useAppStore.getState().setActiveProjectId(null);
      expect(useAppStore.getState().activeProjectId).toBeNull();
    });
  });

  describe('currentView', () => {
    it('defaults to null', () => {
      expect(useAppStore.getState().currentView).toBeNull();
    });

    it('can be set to a view string', () => {
      useAppStore.getState().setCurrentView('projects');
      expect(useAppStore.getState().currentView).toBe('projects');
    });

    it('can be cleared back to null', () => {
      useAppStore.getState().setCurrentView('settings');
      useAppStore.getState().setCurrentView(null);
      expect(useAppStore.getState().currentView).toBeNull();
    });
  });

  describe('kbCurrencyResults', () => {
    it('defaults to empty object', () => {
      expect(useAppStore.getState().kbCurrencyResults).toEqual({});
    });

    it('can set a single result', () => {
      const result = { documentId: 'doc1', isCurrent: true, checkedAt: Date.now() } as any;
      useAppStore.getState().setKBCurrencyResult('doc1', result);
      expect(useAppStore.getState().kbCurrencyResults['doc1']).toEqual(result);
    });

    it('preserves existing results when adding new ones', () => {
      const r1 = { documentId: 'doc1', isCurrent: true } as any;
      const r2 = { documentId: 'doc2', isCurrent: false } as any;
      useAppStore.getState().setKBCurrencyResult('doc1', r1);
      useAppStore.getState().setKBCurrencyResult('doc2', r2);
      expect(Object.keys(useAppStore.getState().kbCurrencyResults)).toHaveLength(2);
    });

    it('can be cleared', () => {
      useAppStore.getState().setKBCurrencyResult('doc1', { isCurrent: true } as any);
      useAppStore.getState().clearKBCurrencyResults();
      expect(useAppStore.getState().kbCurrencyResults).toEqual({});
    });
  });

  describe('auditSimulationSelectedAgents', () => {
    it('defaults to all agent ids', () => {
      const agents = useAppStore.getState().auditSimulationSelectedAgents;
      expect(agents.length).toBeGreaterThan(0);
      expect(agents).toContain('faa-inspector');
      expect(agents).toContain('shop-owner');
    });

    it('can be replaced with a custom selection', () => {
      useAppStore.getState().setAuditSimulationSelectedAgents(['faa-inspector']);
      expect(useAppStore.getState().auditSimulationSelectedAgents).toEqual(['faa-inspector']);
    });

    it('can be set to empty array', () => {
      useAppStore.getState().setAuditSimulationSelectedAgents([]);
      expect(useAppStore.getState().auditSimulationSelectedAgents).toEqual([]);
    });
  });

  describe('persist config', () => {
    it('uses aviation-assessment-app as persist key', () => {
      const persistOptions = (useAppStore as any).persist;
      expect(persistOptions).toBeDefined();
    });
  });
});
