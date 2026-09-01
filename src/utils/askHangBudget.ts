/**
 * Ask hang SLA: single wall-clock budget from Ask start → first Claude token
 * (covers index wait + retrieval + model TTFT). Abort in-flight work and surface
 * an actionable recovery path.
 */

export const ASK_FIRST_TOKEN_BUDGET_MS = 60_000;

/** AbortSignal.reason when the hang budget fires (not a user cancel). */
export const ASK_HANG_ABORT_REASON = 'ask-hang-budget';

export const ASK_HANG_USER_MESSAGE =
  'Ask timed out before an answer started. Try again, reconnect Google Drive in Settings, or refresh the search index in Library.';

/**
 * Abort `controller` after `ms` if still in flight. Returns a disarm function —
 * call it on first token (or when the turn finishes cleanly).
 */
export function armAskHangBudget(
  controller: AbortController,
  ms: number = ASK_FIRST_TOKEN_BUDGET_MS,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const id = window.setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(ASK_HANG_ABORT_REASON);
    }
  }, ms);
  return () => {
    window.clearTimeout(id);
  };
}

export function wasAskHangAbort(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason === ASK_HANG_ABORT_REASON;
}
