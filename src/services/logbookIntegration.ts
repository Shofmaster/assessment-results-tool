import type { ComplianceFinding, LogbookEntry } from '../types/logbook';
import type { InspectionScheduleItem } from '../types/inspectionSchedule';

/**
 * Convert a compliance finding into the shape expected by entityIssues.add.
 * Returns the args object ready to be passed to the mutation.
 */
export function findingToIssueArgs(
  finding: ComplianceFinding,
  projectId: string
): {
  projectId: any;
  source: 'logbook_compliance';
  sourceId: string;
  severity: 'critical' | 'major' | 'minor' | 'observation';
  title: string;
  description: string;
  regulationRef: string;
} {
  const severityMap: Record<string, 'critical' | 'major' | 'minor' | 'observation'> = {
    critical: 'critical',
    major: 'major',
    minor: 'minor',
  };

  return {
    projectId: projectId as any,
    source: 'logbook_compliance' as const,
    sourceId: finding._id,
    severity: severityMap[finding.severity] ?? 'observation',
    title: finding.title,
    description: [
      finding.description,
      finding.evidenceSnippet ? `\nEvidence: ${finding.evidenceSnippet}` : '',
    ].join(''),
    regulationRef: finding.citation,
  };
}

/**
 * Batch-convert multiple findings into issue args.
 */
export function findingsToIssueArgs(
  findings: ComplianceFinding[],
  projectId: string
) {
  return findings
    .filter((f) => f.status === 'open' && !f.convertedToIssueId)
    .map((f) => findingToIssueArgs(f, projectId));
}

/**
 * Match a logbook entry against inspection schedule items to determine
 * which items can be marked as performed based on the entry's content.
 *
 * Returns matching schedule item IDs and the entry date to use as lastPerformedAt.
 */
export function matchEntryToScheduleItems(
  entry: LogbookEntry,
  scheduleItems: InspectionScheduleItem[]
): Array<{ itemId: string; lastPerformedAt: string }> {
  if (!entry.entryDate || !entry.workPerformed) return [];

  const matches: Array<{ itemId: string; lastPerformedAt: string }> = [];
  const workLower = entry.workPerformed.toLowerCase();
  const rawLower = entry.rawText.toLowerCase();

  for (const item of scheduleItems) {
    const titleLower = item.title.toLowerCase();
    const descLower = (item.description ?? '').toLowerCase();

    const titleMatch = workLower.includes(titleLower) || rawLower.includes(titleLower);
    const descMatch = descLower && (workLower.includes(descLower) || rawLower.includes(descLower));

    const regMatch = item.regulationRef
      ? workLower.includes(item.regulationRef.toLowerCase()) || rawLower.includes(item.regulationRef.toLowerCase())
      : false;

    const adSbMatch = entry.adSbReferences?.some(
      (ref) =>
        titleLower.includes(ref.toLowerCase()) ||
        (item.regulationRef && item.regulationRef.toLowerCase().includes(ref.toLowerCase()))
    );

    if (titleMatch || descMatch || regMatch || adSbMatch) {
      matches.push({
        itemId: item._id,
        lastPerformedAt: entry.entryDate!,
      });
    }
  }

  return matches;
}

/**
 * Scan all entries against all schedule items and return schedule updates.
 * For each schedule item, returns the latest matching entry date.
 */
export function buildScheduleUpdates(
  entries: LogbookEntry[],
  scheduleItems: InspectionScheduleItem[]
): Array<{ itemId: string; lastPerformedAt: string }> {
  const latestByItem = new Map<string, string>();

  const dated = entries.filter((e) => e.entryDate).sort((a, b) => a.entryDate!.localeCompare(b.entryDate!));

  for (const entry of dated) {
    const matches = matchEntryToScheduleItems(entry, scheduleItems);
    for (const match of matches) {
      const existing = latestByItem.get(match.itemId);
      if (!existing || match.lastPerformedAt > existing) {
        latestByItem.set(match.itemId, match.lastPerformedAt);
      }
    }
  }

  return Array.from(latestByItem.entries()).map(([itemId, lastPerformedAt]) => ({
    itemId,
    lastPerformedAt,
  }));
}
