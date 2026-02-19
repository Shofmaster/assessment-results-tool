import { ConvexError } from 'convex/values';

const FALLBACK = 'Something went wrong';

const FUNCTION_INVOCATION_FAILED_HINT =
  'Backend call failed. Run `npm run setup` or see FIX_SERVER_ERROR_STEPS.md for step-by-step instructions. Check Convex Dashboard → Logs for the request ID.';

/**
 * Returns a user-facing error message from a caught Convex or other error.
 * Use in catch blocks when displaying Convex mutation/query failures to users.
 */
export function getConvexErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | undefined;
    return (data?.message && String(data.message).trim()) || FALLBACK;
  }
  if (error instanceof Error) {
    const msg = error.message?.trim() || '';
    if (msg.includes('FUNCTION_INVOCATION_FAILED')) {
      return FUNCTION_INVOCATION_FAILED_HINT;
    }
    return msg || FALLBACK;
  }
  return FALLBACK;
}
