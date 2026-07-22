/**
 * Local-data wipe for sign-out. localStorage and IndexedDB are origin-scoped,
 * not user-scoped, so anything left behind is readable by the next person who
 * signs in on the same browser. Call this BEFORE Clerk's signOut().
 *
 * Deliberately does NOT touch persistent per-user caches (project data) —
 * only conversational history, drafts, signer autocomplete, credentials, and
 * file-system handles. The shared Google Drive service holds an in-memory OAuth
 * token across the session (manuals-reference reads reuse it), so it is reset
 * here to avoid leaking the token to the next user on this browser.
 */

import { resetSharedDriveService } from './googleDrive';
import { clearDriveSearchCaches } from './driveSearchIntegration';

/**
 * Set right before an intentional sign-out (useAppSignOut) so AuthGate's
 * signed-out transition handler can tell a deliberate logout apart from a
 * silent Clerk session drop.
 */
let intentionalSignOut = false;

export function markIntentionalSignOut(): void {
  intentionalSignOut = true;
}

/** Read-and-reset the intentional sign-out marker. */
export function consumeIntentionalSignOut(): boolean {
  const value = intentionalSignOut;
  intentionalSignOut = false;
  return value;
}

/**
 * Clerk user id that owns the in-memory session state (Drive OAuth token,
 * search caches). In-memory on purpose: a page reload drops those caches
 * anyway, so there is nothing left to protect across reloads.
 */
let sessionOwnerUserId: string | null = null;

/**
 * Record who is signed in. A silent Clerk session drop no longer wipes local
 * state (the same person is almost always still at the keyboard and signs
 * straight back in — wiping cost them their Google Drive session every time).
 * Instead, the wipe happens here, at the moment a DIFFERENT user signs in on
 * the same page session — the only case the wipe actually protected against.
 */
export function recordSessionOwner(userId: string): void {
  if (sessionOwnerUserId && sessionOwnerUserId !== userId) {
    void clearLocalSessionData();
  }
  sessionOwnerUserId = userId;
}

const LOCALSTORAGE_PREFIXES = [
  'aerogap_splash_chats_v1:',
  'aerogap_splash_draft_v1:',
  'aviation-logbook-signers-',
];

const IDB_DATABASES = [
  'aviation-server-credentials', // document-server secrets (serverCredentials.ts)
  'aviation-local-files', // FileSystemDirectoryHandle permission tokens (localFileAccess.ts)
];

function deleteIdbDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Remove session-sensitive local data. Safe to call multiple times; never throws. */
export async function clearLocalSessionData(): Promise<void> {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage unavailable (private mode quirks) — nothing to clear.
  }

  resetSharedDriveService();
  // Drive search holds per-project IO closures over the signed-in Drive service
  // plus in-memory indexes and extracted document text — all user-scoped.
  clearDriveSearchCaches();

  await Promise.all(IDB_DATABASES.map(deleteIdbDatabase));
}
