/**
 * Keep an OFFLINE session for the hosted account on this install.
 *
 * While the page runs the Clerk provider (online), it hands a fresh Clerk token
 * to the app server, which verifies it with the tenant's public key and sets
 * its own 30-day httpOnly session cookie for the same subject
 * (selfhost/server/src/localAuthRoutes.ts, POST /local-auth/hosted-session).
 * When the connection is later lost, the page reloads onto the local provider
 * and that cookie signs the same person in - no Clerk script, no network.
 *
 * Done on every online launch so the 30 days roll forward; a laptop that goes
 * to a hangar without Wi-Fi for a month still opens.
 */
import { hostedSessionLinkedSubject, markHostedSessionLinked } from './providerChoice';

export interface LinkHostedSessionResult {
  ok: boolean;
  subject?: string;
  /** 404: the install does not offer offline continuation (no Clerk key baked). */
  unsupported?: boolean;
}

/**
 * @param getToken  Clerk's getToken, bound to the "convex" template.
 * @param fetchImpl injectable for tests
 */
export async function linkHostedSession(
  getToken: () => Promise<string | null>,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkHostedSessionResult> {
  const token = await getToken().catch(() => null);
  if (!token) return { ok: false };

  try {
    const response = await fetchImpl('/local-auth/hosted-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token }),
    });
    if (response.status === 404) return { ok: false, unsupported: true };
    if (!response.ok) return { ok: false };
    const body = (await response.json().catch(() => null)) as { user?: { subject?: string } } | null;
    const subject = body?.user?.subject;
    if (typeof subject !== 'string' || !subject) return { ok: false };
    markHostedSessionLinked(subject);
    return { ok: true, subject };
  } catch {
    return { ok: false };
  }
}

/** Offline continuation is possible for this subject on this install. */
export function canContinueOffline(subject: string | null | undefined): boolean {
  const linked = hostedSessionLinkedSubject();
  return Boolean(linked) && (!subject || linked === subject);
}
