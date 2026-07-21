import { describe, expect, it, vi } from 'vitest';
import { auditSimGapsToItems, dctPrereqsToItems } from '../adapters';
import { hasBlockingGaps, type ReadinessItem } from '../ReadinessChecklist';
import { getTraceabilityPrereqs } from '../../../utils/dctTraceabilityPrereqs';
import type { SimulationDataSummary } from '../../../types/auditSimulation';

function makeSummary(overrides: Partial<SimulationDataSummary> = {}): SimulationDataSummary {
  return {
    hasAssessment: true,
    assessmentName: 'Acme Aviation',
    entityDocsWithText: 2,
    smsDocsWithText: 1,
    uploadedDocsWithText: 3,
    paperworkReviewsIncluded: 1,
    agentLibraryCounts: { 'faa-inspector': 4 },
    gaps: [],
    ...overrides,
  };
}

const CTX = {
  selectedAgents: ['faa-inspector'],
  agentNames: { 'faa-inspector': 'FAA Inspector' },
  completedReviewsAvailable: 2,
};

describe('auditSimGapsToItems', () => {
  it('reports all-ready items when everything is provided', () => {
    const items = auditSimGapsToItems(makeSummary(), CTX);
    expect(items.every((i) => i.status === 'ready')).toBe(true);
    expect(items.find((i) => i.id === 'assessment')?.detail).toBe('Acme Aviation');
    expect(items.find((i) => i.id === 'agent-kb')?.label).toMatch(/All selected auditors/);
    // Soft gaps only — nothing here may ever block the Start button.
    expect(hasBlockingGaps(items)).toBe(false);
  });

  it('flags missing assessment and empty doc categories as warnings with Library links', () => {
    const items = auditSimGapsToItems(
      makeSummary({
        hasAssessment: false,
        assessmentName: 'None (generic context)',
        entityDocsWithText: 0,
        smsDocsWithText: 0,
        uploadedDocsWithText: 0,
      }),
      CTX,
    );
    expect(items.find((i) => i.id === 'assessment')?.status).toBe('warning');
    for (const id of ['entity-docs', 'sms-docs', 'uploaded-docs']) {
      const item = items.find((i) => i.id === id);
      expect(item?.status).toBe('warning');
      expect(item?.action).toEqual({ kind: 'link', label: 'Open Library', to: '/library' });
    }
    expect(hasBlockingGaps(items)).toBe(false);
  });

  it('lists selected agents without library documents by display name', () => {
    const items = auditSimGapsToItems(
      makeSummary({ agentLibraryCounts: { 'faa-inspector': 0 } }),
      CTX,
    );
    const agentItem = items.find((i) => i.id === 'agent-kb');
    expect(agentItem?.status).toBe('warning');
    expect(agentItem?.detail).toBe('FAA Inspector');
  });

  it('only warns about unselected paperwork reviews when completed reviews exist', () => {
    const withReviews = auditSimGapsToItems(
      makeSummary({ paperworkReviewsIncluded: 0 }),
      CTX,
    );
    expect(withReviews.find((i) => i.id === 'paperwork-reviews')?.status).toBe('warning');

    const noneAvailable = auditSimGapsToItems(
      makeSummary({ paperworkReviewsIncluded: 0 }),
      { ...CTX, completedReviewsAvailable: 0 },
    );
    expect(noneAvailable.find((i) => i.id === 'paperwork-reviews')).toBeUndefined();

    const included = auditSimGapsToItems(makeSummary({ paperworkReviewsIncluded: 1 }), CTX);
    expect(included.find((i) => i.id === 'paperwork-reviews')).toBeUndefined();
  });
});

describe('getTraceabilityPrereqs', () => {
  it('is fully met with a project, synced requirements, corpus docs, and a selection', () => {
    const prereqs = getTraceabilityPrereqs({
      hasProject: true,
      enrichedCount: 312,
      corpusDocCount: 4,
      defaultSelectionSize: 120,
    });
    expect(prereqs).toHaveLength(3);
    expect(prereqs.every((p) => p.met)).toBe(true);
    expect(prereqs[0].metLabel).toContain('312 DCT requirements');
    expect(prereqs[1].metLabel).toContain('4 manuals');
    expect(prereqs[2].metLabel).toContain('120 requirements');
  });

  it('keeps the same unmet copy as the legacy run-button toasts', () => {
    const prereqs = getTraceabilityPrereqs({
      hasProject: false,
      enrichedCount: 0,
      corpusDocCount: 0,
      defaultSelectionSize: 0,
    });
    expect(prereqs.map((p) => p.met)).toEqual([false, false, false]);
    expect(prereqs[0].message).toBe(
      'Use Sync from library to copy DCT requirements into this project first.',
    );
    expect(prereqs[1].message).toBe(
      'Add entity/regulatory manuals with extracted text to the project first.',
    );
    expect(prereqs[2].message).toBe(
      'No applicable rows. Adjust Settings or toggle "Show all DCTs".',
    );
  });

  it('treats synced requirements without a project as unmet', () => {
    const prereqs = getTraceabilityPrereqs({
      hasProject: false,
      enrichedCount: 10,
      corpusDocCount: 1,
      defaultSelectionSize: 1,
    });
    expect(prereqs.find((p) => p.id === 'requirements-synced')?.met).toBe(false);
  });
});

describe('dctPrereqsToItems', () => {
  const unmet = getTraceabilityPrereqs({
    hasProject: true,
    enrichedCount: 0,
    corpusDocCount: 0,
    defaultSelectionSize: 0,
  });

  it('maps unmet prereqs to blocking items with the right actions', () => {
    const onSync = vi.fn();
    const onOpenSettings = vi.fn();
    const items = dctPrereqsToItems(unmet, { onSync, onOpenSettings });

    expect(items.every((i) => i.status === 'missing')).toBe(true);
    expect(hasBlockingGaps(items)).toBe(true);

    const syncItem = items.find((i) => i.id === 'requirements-synced');
    expect(syncItem?.action?.kind).toBe('button');
    if (syncItem?.action?.kind === 'button') syncItem.action.onClick();
    expect(onSync).toHaveBeenCalledOnce();

    expect(items.find((i) => i.id === 'corpus-docs')?.action).toEqual({
      kind: 'link',
      label: 'Open Library',
      to: '/library',
    });

    const settingsItem = items.find((i) => i.id === 'applicable-rows');
    if (settingsItem?.action?.kind === 'button') settingsItem.action.onClick();
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('maps met prereqs to ready items without actions', () => {
    const met = getTraceabilityPrereqs({
      hasProject: true,
      enrichedCount: 5,
      corpusDocCount: 2,
      defaultSelectionSize: 3,
    });
    const items = dctPrereqsToItems(met, { onSync: vi.fn(), onOpenSettings: vi.fn() });
    expect(items.every((i) => i.status === 'ready' && i.action === undefined)).toBe(true);
    expect(hasBlockingGaps(items)).toBe(false);
  });

  it('omits button actions when handlers are not supplied', () => {
    const items = dctPrereqsToItems(unmet);
    expect(items.find((i) => i.id === 'requirements-synced')?.action).toBeUndefined();
    expect(items.find((i) => i.id === 'applicable-rows')?.action).toBeUndefined();
    // The Library link needs no handler and must survive.
    expect(items.find((i) => i.id === 'corpus-docs')?.action?.kind).toBe('link');
  });
});

describe('hasBlockingGaps', () => {
  it('only counts missing items as blocking', () => {
    const warningOnly: ReadinessItem[] = [
      { id: 'a', label: 'a', status: 'warning' },
      { id: 'b', label: 'b', status: 'ready' },
    ];
    expect(hasBlockingGaps(warningOnly)).toBe(false);
    expect(
      hasBlockingGaps([...warningOnly, { id: 'c', label: 'c', status: 'missing' }]),
    ).toBe(true);
  });
});
