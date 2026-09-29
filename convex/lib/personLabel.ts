/**
 * Display name for a person keyed by a Clerk subject (`user_…`) or a
 * locally issued subject (`local|<uuid>`).
 *
 * Prefer a human name, then email. Never surface the raw subject when a
 * name or email exists — including when `name` was stored as the subject
 * itself. When nothing resolvable exists, return a stable placeholder
 * instead of the id.
 */

const OPAQUE_SUBJECT = /^(user_[A-Za-z0-9]+|local\|[0-9a-fA-F-]+)$/;

export const UNKNOWN_PERSON_LABEL = 'Unknown user';

export function isOpaqueSubject(value: string | null | undefined): boolean {
  if (!value) return false;
  return OPAQUE_SUBJECT.test(value.trim());
}

export function personLabel(
  user: { name?: string | null; email?: string | null } | null | undefined,
  subject?: string | null,
): string {
  const name = (user?.name ?? '').trim();
  const email = (user?.email ?? '').trim();
  const id = (subject ?? '').trim();
  if (name && !isOpaqueSubject(name) && name !== id) return name;
  if (email && !isOpaqueSubject(email)) return email;
  return UNKNOWN_PERSON_LABEL;
}
