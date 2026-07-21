/**
 * Pure prerequisite check for a DCT traceability run. Drives both the
 * pre-flight checklist UI (DctCompliance) and the backstop toasts in
 * useDctTraceabilityRun's `handleRunTraceability`, so the two can never
 * disagree. Kept dependency-free so it stays unit-testable.
 */

/** One hard prerequisite for starting a traceability run. */
export interface TraceabilityPrereq {
  id: 'requirements-synced' | 'corpus-docs' | 'applicable-rows';
  met: boolean;
  /** Shown when unmet (same copy as the run-button backstop toasts). */
  message: string;
  /** Shown when met. */
  metLabel: string;
}

export function getTraceabilityPrereqs(args: {
  hasProject: boolean;
  enrichedCount: number;
  corpusDocCount: number;
  defaultSelectionSize: number;
}): TraceabilityPrereq[] {
  return [
    {
      id: 'requirements-synced',
      met: args.hasProject && args.enrichedCount > 0,
      message: 'Use Sync from library to copy DCT requirements into this project first.',
      metLabel: `${args.enrichedCount} DCT requirement${args.enrichedCount === 1 ? '' : 's'} synced into this project`,
    },
    {
      id: 'corpus-docs',
      met: args.corpusDocCount > 0,
      message: 'Add entity/regulatory manuals with extracted text to the project first.',
      metLabel: `${args.corpusDocCount} manual${args.corpusDocCount === 1 ? '' : 's'} available for matching`,
    },
    {
      id: 'applicable-rows',
      met: args.defaultSelectionSize > 0,
      message: 'No applicable rows. Adjust Settings or toggle "Show all DCTs".',
      metLabel: `${args.defaultSelectionSize} requirement${args.defaultSelectionSize === 1 ? '' : 's'} selected to run`,
    },
  ];
}
