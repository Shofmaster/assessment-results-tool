import type { Id } from '../../convex/_generated/dataModel';

/** Matches Convex `deletionShared.deletionStepUpArg` discriminated union. */
export type DeletionStepUp =
  | { kind: 'pin'; pin: string }
  | { kind: 'passwordTicket'; ticketId: Id<'stepUpTickets'> };
