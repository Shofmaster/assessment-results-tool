import { describe, expect, it } from 'vitest';
import { isOpaqueSubject, personLabel, UNKNOWN_PERSON_LABEL } from '../../../convex/lib/personLabel';

describe('personLabel', () => {
  it('prefers a human name over email and the subject', () => {
    expect(
      personLabel({ name: 'Shelby N.', email: 'shelby@example.com' }, 'user_2abcDEF'),
    ).toBe('Shelby N.');
  });

  it('uses email when the stored name is a raw Clerk subject', () => {
    expect(
      personLabel({ name: 'user_2abcDEF', email: 'shelby@example.com' }, 'user_2abcDEF'),
    ).toBe('shelby@example.com');
  });

  it('uses email when there is no name', () => {
    expect(personLabel({ email: 'shelby@example.com' }, 'user_2abcDEF')).toBe('shelby@example.com');
  });

  it('uses email when the subject itself is that email', () => {
    expect(personLabel({ email: 'shelby@example.com' }, 'shelby@example.com')).toBe(
      'shelby@example.com',
    );
  });

  it('does not surface a Clerk or local subject when nothing else is known', () => {
    expect(personLabel(null, 'user_2abcDEF')).toBe(UNKNOWN_PERSON_LABEL);
    expect(personLabel(undefined, 'local|11111111-2222-3333-4444-555555555555')).toBe(
      UNKNOWN_PERSON_LABEL,
    );
    expect(isOpaqueSubject('user_2abcDEF')).toBe(true);
    expect(isOpaqueSubject('Shelby N.')).toBe(false);
  });
});
