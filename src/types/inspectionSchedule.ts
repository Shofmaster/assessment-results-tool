/** Extracted recurring inspection item from document (before saving). */
export interface ExtractedInspectionItem {
  title: string;
  description?: string;
  category?: InspectionCategory;
  intervalType: 'calendar' | 'hours' | 'cycles';
  intervalMonths?: number;
  intervalDays?: number;
  intervalValue?: number;
  regulationRef?: string;
  isRegulatory?: boolean;
  lastPerformedAt?: string | null;
  documentExcerpt?: string;
  confidence: 'high' | 'medium' | 'low';
}

/** Category for grouping schedule items. */
export type InspectionCategory =
  | 'calibration'
  | 'audit'
  | 'training'
  | 'surveillance'
  | 'facility'
  | 'ad_compliance'
  | 'other';

/** Item stored in Convex. */
export interface InspectionScheduleItem {
  _id: string;
  projectId: string;
  userId: string;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  title: string;
  description?: string;
  category?: string;
  intervalType: string;
  intervalMonths?: number;
  intervalDays?: number;
  intervalValue?: number;
  regulationRef?: string;
  isRegulatory?: boolean;
  lastPerformedAt?: string;
  lastPerformedSource?: 'document' | 'manual';
  documentExcerpt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Compute next due date from lastPerformed + interval. Returns null if no last date. */
export function computeNextDue(item: Pick<InspectionScheduleItem, 'lastPerformedAt' | 'intervalType' | 'intervalMonths' | 'intervalDays' | 'intervalValue'>): string | null {
  if (!item.lastPerformedAt) return null;
  if (item.intervalType !== 'calendar') return null; // v1: only calendar

  const last = new Date(item.lastPerformedAt);
  const months = item.intervalMonths ?? 0;
  const days = item.intervalDays ?? 0;

  if (months > 0) {
    const next = new Date(last);
    next.setMonth(next.getMonth() + months);
    return next.toISOString().slice(0, 10);
  }
  if (days > 0) {
    const next = new Date(last);
    next.setDate(next.getDate() + days);
    return next.toISOString().slice(0, 10);
  }
  return null;
}

/** Status for display. */
export type DueStatus = 'overdue' | 'due_soon' | 'on_track' | 'no_date';

/** Get due status from next due date. */
export function getDueStatus(nextDue: string | null): DueStatus {
  if (!nextDue) return 'no_date';
  const due = new Date(nextDue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 30) return 'due_soon';
  return 'on_track';
}
