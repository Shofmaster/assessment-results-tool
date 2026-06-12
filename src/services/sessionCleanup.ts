/**
 * Local-data wipe for sign-out. localStorage and IndexedDB are origin-scoped,
 * not user-scoped, so anything left behind is readable by the next person who
 * signs in on the same browser. Call this BEFORE Clerk's signOut().
 *
 * Deliberately does NOT touch persistent per-user caches (project data) —
 * only conversational history, drafts, signer autocomplete, credentials, and
 * file-system handles. Google Drive OAuth tokens need no handling here: the
 * GoogleDriveService instance is function-scoped to the import flow and its
 * token only ever lives in memory.
 */

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

  await Promise.all(IDB_DATABASES.map(deleteIdbDatabase));
}
