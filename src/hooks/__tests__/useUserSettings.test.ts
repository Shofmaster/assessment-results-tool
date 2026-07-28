import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Guards the auth gate on useUserSettings. AuthGate calls it above its own
 * `!isSignedIn` branch, so a missing guard means every signed-out visitor fires a
 * query that can only fail -- and an over-eager guard that never releases would
 * leave settings permanently empty for signed-in users. Both directions matter.
 */

// useConvexData transitively imports pdfjs-dist (via documentExtractor), which needs
// DOMMatrix and blows up under jsdom. Nothing here touches PDF extraction.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn(), version: 'test' }));

const useConvexAuth = vi.fn();
const useQuery = vi.fn();

vi.mock('convex/react', () => ({
  useConvexAuth: () => useConvexAuth(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useAction: vi.fn(),
  useConvex: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock('../useConvexQueryNoThrow', () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

const { useUserSettings } = await import('../useConvexData');

describe('useUserSettings auth guard', () => {
  beforeEach(() => {
    useConvexAuth.mockReset();
    useQuery.mockReset();
    useQuery.mockReturnValue(undefined);
  });

  it("skips the query while signed out so it never fires and fails", () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useUserSettings();
    expect(useQuery).toHaveBeenCalledTimes(1);
    expect(useQuery.mock.calls[0][1]).toBe('skip');
  });

  it('releases the skip once Convex auth settles', () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useUserSettings();
    expect(useQuery).toHaveBeenCalledTimes(1);
    expect(useQuery.mock.calls[0][1]).toEqual({});
  });

  it('passes the query result straight through when signed in', () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({ thinkingEnabled: true });
    expect(useUserSettings()).toEqual({ thinkingEnabled: true });
  });
});
