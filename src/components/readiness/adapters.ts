/**
 * Adapters that map feature-specific readiness data into ReadinessItem lists.
 *
 * Items are built structurally from the same fields the features gate on —
 * never by parsing human-readable gap strings — so the checklist can't drift
 * from the actual run behavior.
 */
import type { SimulationDataSummary } from '../../types/auditSimulation';
import type { ReadinessItem } from './ReadinessChecklist';
import type { TraceabilityPrereq } from '../../utils/dctTraceabilityPrereqs';

export interface AuditSimReadinessContext {
  /** Ids of the agents currently selected for the run. */
  selectedAgents: Iterable<string>;
  /** Agent id -> display name (for per-agent knowledge-base gaps). */
  agentNames: Record<string, string>;
  /** How many completed paperwork reviews exist in the project. */
  completedReviewsAvailable: number;
}

/**
 * Audit Simulation gaps are soft ('warning') — the simulation runs on whatever
 * is available, so nothing here disables Start.
 */
export function auditSimGapsToItems(
  summary: SimulationDataSummary,
  ctx: AuditSimReadinessContext,
): ReadinessItem[] {
  const items: ReadinessItem[] = [];

  items.push(
    summary.hasAssessment
      ? {
          id: 'assessment',
          label: 'Assessment selected',
          status: 'ready',
          detail: summary.assessmentName,
        }
      : {
          id: 'assessment',
          label: 'No assessment selected',
          status: 'warning',
          detail: 'Auditors will use generic context. Choose an assessment above to ground the simulation.',
        },
  );

  const docCategories: Array<{ id: string; count: number; noun: string }> = [
    { id: 'entity-docs', count: summary.entityDocsWithText, noun: 'entity document' },
    { id: 'sms-docs', count: summary.smsDocsWithText, noun: 'SMS document' },
    { id: 'uploaded-docs', count: summary.uploadedDocsWithText, noun: 'uploaded document' },
  ];
  for (const { id, count, noun } of docCategories) {
    items.push(
      count > 0
        ? {
            id,
            label: `${count} ${noun}${count === 1 ? '' : 's'} with extracted text`,
            status: 'ready',
          }
        : {
            id,
            label: `No ${noun}s with extracted text`,
            status: 'warning',
            detail: 'Documents without extracted text are not visible to the AI auditors.',
            action: { kind: 'link', label: 'Open Library', to: '/library' },
          },
    );
  }

  const agentsWithoutDocs: string[] = [];
  for (const agentId of ctx.selectedAgents) {
    if ((summary.agentLibraryCounts[agentId] ?? 0) === 0) {
      agentsWithoutDocs.push(ctx.agentNames[agentId] ?? agentId);
    }
  }
  if (agentsWithoutDocs.length > 0) {
    items.push({
      id: 'agent-kb',
      label: `${agentsWithoutDocs.length} selected auditor${agentsWithoutDocs.length === 1 ? ' has' : 's have'} no Library documents`,
      status: 'warning',
      detail: agentsWithoutDocs.join(', '),
      action: { kind: 'link', label: 'Open Library', to: '/library' },
    });
  } else {
    items.push({
      id: 'agent-kb',
      label: 'All selected auditors have Library documents',
      status: 'ready',
    });
  }

  if (ctx.completedReviewsAvailable > 0 && summary.paperworkReviewsIncluded === 0) {
    items.push({
      id: 'paperwork-reviews',
      label: 'No paperwork reviews selected',
      status: 'warning',
      detail: `${ctx.completedReviewsAvailable} completed review${ctx.completedReviewsAvailable === 1 ? ' is' : 's are'} available to include above.`,
    });
  }

  return items;
}

export interface DctPrereqHandlers {
  /** Trigger the existing "Sync from library" flow. */
  onSync?: () => void;
  /** Switch to the DCT Settings tab (applicability scoping). */
  onOpenSettings?: () => void;
}

/**
 * DCT traceability prerequisites are hard blocks ('missing' when unmet) —
 * consumers should disable Run via hasBlockingGaps().
 */
export function dctPrereqsToItems(
  prereqs: TraceabilityPrereq[],
  handlers: DctPrereqHandlers = {},
): ReadinessItem[] {
  return prereqs.map((p) => {
    const item: ReadinessItem = {
      id: p.id,
      label: p.met ? p.metLabel : p.message,
      status: p.met ? 'ready' : 'missing',
    };
    if (!p.met) {
      if (p.id === 'requirements-synced' && handlers.onSync) {
        item.action = { kind: 'button', label: 'Sync from library', onClick: handlers.onSync };
      } else if (p.id === 'corpus-docs') {
        item.action = { kind: 'link', label: 'Open Library', to: '/library' };
      } else if (p.id === 'applicable-rows' && handlers.onOpenSettings) {
        item.action = { kind: 'button', label: 'Open Settings tab', onClick: handlers.onOpenSettings };
      }
    }
    return item;
  });
}
