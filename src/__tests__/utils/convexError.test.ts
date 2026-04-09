import { describe, it, expect } from 'vitest';
import { ConvexError } from 'convex/values';
import { getConvexErrorMessage } from '../../utils/convexError';

describe('getConvexErrorMessage', () => {
  it('extracts message from ConvexError', () => {
    const err = new ConvexError({ message: 'Not authorized' });
    expect(getConvexErrorMessage(err)).toBe('Not authorized');
  });

  it('returns fallback for ConvexError without message', () => {
    const err = new ConvexError({});
    expect(getConvexErrorMessage(err)).toBe('Something went wrong');
  });

  it('returns the message from a standard Error', () => {
    expect(getConvexErrorMessage(new Error('some error'))).toBe('some error');
  });

  it('returns hint for FUNCTION_INVOCATION_FAILED errors', () => {
    const err = new Error('[CONVEX FUNCTION_INVOCATION_FAILED] Server crashed');
    const msg = getConvexErrorMessage(err);
    expect(msg).toContain('Backend call failed');
    expect(msg).toContain('FIX_SERVER_ERROR_STEPS.md');
  });

  it('returns fallback for Error with empty message', () => {
    expect(getConvexErrorMessage(new Error(''))).toBe('Something went wrong');
  });

  it('returns fallback for non-Error values', () => {
    expect(getConvexErrorMessage('string error')).toBe('Something went wrong');
    expect(getConvexErrorMessage(null)).toBe('Something went wrong');
    expect(getConvexErrorMessage(undefined)).toBe('Something went wrong');
    expect(getConvexErrorMessage(42)).toBe('Something went wrong');
  });
});
