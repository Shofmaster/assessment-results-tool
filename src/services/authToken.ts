/**
 * Bridge so plain (non-React) service modules can attach the current Clerk
 * session token to requests hitting our serverless Claude proxy. A React
 * component registers Clerk's `getToken` via `setClerkTokenGetter`; services
 * call `getClerkToken()` to read it.
 */
type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setClerkTokenGetter(fn: TokenGetter | null): void {
  tokenGetter = fn;
}

export async function getClerkToken(): Promise<string | null> {
  if (tokenGetter) {
    try {
      return await tokenGetter();
    } catch {
      // fall through to global fallback
    }
  }
  // Fallback: Clerk attaches its instance to window when loaded.
  const clerk = (typeof window !== 'undefined' ? (window as any).Clerk : undefined);
  if (clerk?.session?.getToken) {
    try {
      return await clerk.session.getToken();
    } catch {
      return null;
    }
  }
  return null;
}

/** Build request headers with the Clerk bearer token when available. */
export async function authedJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getClerkToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
