import { z } from 'zod';
import type { Form337Input } from './form337Service';

/**
 * Zod schema for the fields required before an FAA Form 337 draft can be
 * generated. Mirrors the regulatory minimums (aircraft identity, owner, and at
 * least one work item with a description + approved data basis) but, unlike the
 * old boolean gate, yields a specific message per missing field so the user can
 * see *why* generation is blocked.
 */
const workItemSchema = z.object({
  description: z.string().trim().min(1, 'Each work item needs a description'),
  approvedData: z
    .string()
    .trim()
    .min(1, 'Each work item needs an approved-data / regulatory basis'),
});

export const form337GenerateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  aircraft: z.object({
    nationalityRegistration: z
      .string()
      .trim()
      .min(1, 'Aircraft nationality & registration is required'),
    serialNumber: z.string().trim().min(1, 'Aircraft serial number is required'),
  }),
  owner: z.object({
    name: z.string().trim().min(1, 'Owner name is required'),
  }),
  workItems: z.array(workItemSchema).min(1, 'Add at least one work item'),
});

export interface Form337ValidationResult {
  ok: boolean;
  /** Deduplicated, human-readable list of what still needs filling in. */
  messages: string[];
  /** Non-blocking best-practice gaps (e.g. missing W&B statement, required on a 337). */
  warnings: string[];
}

/** Non-blocking checks: things a 337 should state but that shouldn't gate generation. */
function collectWarnings(form: Form337Input): string[] {
  const warnings: string[] = [];
  (form.workItems || []).forEach((item, idx) => {
    if (!item.weightChange?.trim()) {
      warnings.push(
        `Work item ${idx + 1}: no weight & balance statement — state the actual delta with arm, or "No change to weight or balance."`,
      );
    }
  });
  if (form.unitType !== 'airframe') {
    const unit = form.unitIdentification;
    const hasId =
      form.unitType === 'appliance'
        ? !!(unit?.applianceType?.trim() || unit?.applianceManufacturer?.trim())
        : !!(unit?.make?.trim() || unit?.serialNumber?.trim());
    if (!hasId) {
      warnings.push(
        `Unit is ${form.unitType} — Item 5 needs the unit's own make/model/serial (the airframe row only covers Item 1).`,
      );
    }
  }
  return warnings;
}

/** Validate the form for generation, returning friendly inline messages. */
export function validateForm337ForGenerate(
  form: Form337Input,
): Form337ValidationResult {
  const warnings = collectWarnings(form);
  const result = form337GenerateSchema.safeParse(form);
  if (result.success) {
    return { ok: true, messages: [], warnings };
  }
  const messages = Array.from(
    new Set(result.error.issues.map((issue) => issue.message)),
  );
  return { ok: false, messages, warnings };
}
