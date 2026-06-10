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
}

/** Validate the form for generation, returning friendly inline messages. */
export function validateForm337ForGenerate(
  form: Form337Input,
): Form337ValidationResult {
  const result = form337GenerateSchema.safeParse(form);
  if (result.success) {
    return { ok: true, messages: [] };
  }
  const messages = Array.from(
    new Set(result.error.issues.map((issue) => issue.message)),
  );
  return { ok: false, messages };
}
