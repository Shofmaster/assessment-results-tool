import type { DeletionStepUp } from '../types/deletionStepUp';

/**
 * Password step-up tickets are single-use. Use this before multiple gated Convex calls in one user action.
 */
export function asRepeatingStepUp(stepUp: DeletionStepUp): DeletionStepUp {
  if (stepUp.kind === 'passwordTicket') {
    throw new Error(
      'This action performs multiple protected steps. Use your deletion PIN instead — account passwords only verify a single request at a time.',
    );
  }
  return stepUp;
}
