/**
 * Map saved Form 337 records (alteration type) into draft modification records
 * for the extraction review step. Client-only seed path — nothing persists
 * until the user confirms in the review modal.
 */
import { migrateFormData, type Form337Input } from '../services/form337Service';
import type { ExtractedModification } from '../types/aircraftModification';

/** FAA STC number pattern, e.g. SA01234NM / SR09876SE / SE00123AT. */
const STC_PATTERN = /S[AERH]\d{3,5}[A-Z]{2}\b/;

export interface Form337RecordLike {
  _id: string;
  aircraftId?: string;
  title: string;
  formData: Record<string, unknown>;
}

/**
 * Build one draft modification per alteration-type 337 record.
 * Skips repair-only records and records already linked from an existing mod.
 */
export function mapForm337RecordsToDrafts(
  records: Form337RecordLike[],
  options: {
    aircraftId: string;
    /** form337RecordIds already linked from existing mods (skip these). */
    linkedRecordIds: Set<string>;
  },
): { drafts: ExtractedModification[]; skippedRepairs: number; skippedLinked: number } {
  const drafts: ExtractedModification[] = [];
  let skippedRepairs = 0;
  let skippedLinked = 0;

  for (const record of records) {
    // Only this aircraft's records (or unassigned ones the user may want anyway).
    if (record.aircraftId && record.aircraftId !== options.aircraftId) continue;
    if (options.linkedRecordIds.has(record._id)) {
      skippedLinked += 1;
      continue;
    }
    let formData: Form337Input;
    try {
      formData = migrateFormData(record.formData);
    } catch {
      continue;
    }
    if (formData.typeOfWork !== 'alteration') {
      skippedRepairs += 1;
      continue;
    }

    const workItems = formData.workItems ?? [];
    const approvedDataAll = workItems.map((w) => w.approvedData).filter(Boolean).join('; ');
    const stcMatch = approvedDataAll.match(STC_PATTERN);
    const icaTexts = workItems
      .map((w) => w.continuedAirworthiness?.trim())
      .filter((t): t is string => Boolean(t));
    const weightTexts = workItems
      .map((w) => w.weightChange?.trim())
      .filter((t): t is string => Boolean(t) && !/^no change/i.test(t as string));
    const description = workItems
      .map((w) => [w.location, w.description].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('\n');

    drafts.push({
      modType: stcMatch ? 'stc' : 'field_approval_337',
      title: record.title || 'Form 337 alteration',
      approvalRef: stcMatch ? stcMatch[0] : approvedDataAll || undefined,
      holder: formData.agency?.nameAndAddress?.split('\n')[0] || undefined,
      dateInstalled: formData.agency?.completionDate || undefined,
      description: description || undefined,
      status: 'installed',
      icaRequirements: icaTexts.length
        ? icaTexts.map((text) => ({ description: text, reference: `Form 337 — ${record.title}` }))
        : undefined,
      weightBalance: weightTexts.length ? { notes: weightTexts.join('; ') } : undefined,
      form337RecordId: record._id,
      confidence: 0.8,
    });
  }

  return { drafts, skippedRepairs, skippedLinked };
}
