/**
 * Hooks around the persistent Entry Review history backed by the
 * `logbookEntryReviews` Convex table. These are project-less by design —
 * history is scoped to the signed-in Clerk user.
 */

import { useCallback } from 'react';
import { useMutation } from 'convex/react';
import { useQuery } from './useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';

// NOTE: Using `string` instead of `Id<'logbookEntryReviews'>` because Convex
// generated types won't include the new table until `convex dev` runs.

export type LogbookEntryReviewRow = {
  _id: string;
  _creationTime: number;
  userId: string;
  projectId?: string;
  aircraftId?: string;
  title: string;
  sourceKind: string;
  sourceFileName?: string;
  rawText: string;
  parsedEntries?: unknown;
  reviewResults: unknown;
  engineFindings?: unknown;
  operatorType?: string;
  framework: string;
  mode: string;
  createdAt: number;
  updatedAt: number;
};

/** Paginated-ish list for the inline History panel (newest first). */
export function useLogbookEntryReviews(limit: number = 50): LogbookEntryReviewRow[] | undefined {
  const rows = useQuery(
    (api as any).logbookEntryReviews.listForUser,
    { limit },
  );
  return rows as LogbookEntryReviewRow[] | undefined;
}

/** Single review lookup — returns null if not found or not owned by caller. */
export function useLogbookEntryReview(reviewId: string | undefined) {
  return useQuery(
    (api as any).logbookEntryReviews.getById,
    reviewId ? { reviewId } : 'skip',
  ) as LogbookEntryReviewRow | null | undefined;
}

export interface CreateReviewArgs {
  title: string;
  sourceKind: 'paste' | 'upload' | 'image' | 'capture';
  sourceFileName?: string;
  rawText: string;
  parsedEntries?: unknown;
  reviewResults: unknown;
  engineFindings?: unknown;
  operatorType?: string;
  framework: 'FAA' | 'EASA';
  mode: 'quick' | 'structured';
  projectId?: string;
  aircraftId?: string;
}

/**
 * Returns stable callbacks for create/update/remove plus a `save` helper
 * that swallows errors so the page can fire-and-forget after a review.
 */
export function useLogbookEntryReviewMutations() {
  const createMut = useMutation(
    (api as unknown as { logbookEntryReviews: { create: unknown } }).logbookEntryReviews.create as never,
  );
  const updateMut = useMutation(
    (api as unknown as { logbookEntryReviews: { update: unknown } }).logbookEntryReviews.update as never,
  );
  const removeMut = useMutation(
    (api as unknown as { logbookEntryReviews: { remove: unknown } }).logbookEntryReviews.remove as never,
  );

  const saveQuiet = useCallback(
    async (args: CreateReviewArgs): Promise<string | null> => {
      try {
        const id = (await (createMut as unknown as (args: CreateReviewArgs) => Promise<string>)(args));
        return id;
      } catch (err) {
        // Fire-and-forget from the page: log but never throw through the UI.
        // eslint-disable-next-line no-console
        console.warn('[useLogbookEntryReviews] save failed', err);
        return null;
      }
    },
    [createMut],
  );

  return { create: createMut, update: updateMut, remove: removeMut, saveQuiet };
}
