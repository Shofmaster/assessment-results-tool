import type { UploadedDocument } from '../types/googleDrive';
import type { AgentKnowledgeBases } from '../types/project';

type DocScope = 'uploaded' | 'agent' | 'global';

const DB_NAME = 'aviation-document-texts';
const STORE_NAME = 'docTexts';
const DB_VERSION = 1;

interface StoredDocText {
  key: string;
  text: string;
  updatedAt: string;
}

function buildKey(scope: DocScope, projectId: string | null, agentId: string | null, docId: string): string {
  return [scope, projectId || 'global', agentId || 'none', docId].join('::');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = run(store);
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export async function putDocumentText(
  scope: DocScope,
  projectId: string | null,
  agentId: string | null,
  docId: string,
  text: string
): Promise<void> {
  const key = buildKey(scope, projectId, agentId, docId);
  await withStore('readwrite', (store) =>
    store.put({ key, text, updatedAt: new Date().toISOString() } as StoredDocText)
  );
}

export async function getDocumentText(
  scope: DocScope,
  projectId: string | null,
  agentId: string | null,
  docId: string
): Promise<string | null> {
  const key = buildKey(scope, projectId, agentId, docId);
  const record = await withStore<StoredDocText | undefined>('readonly', (store) => store.get(key));
  return record?.text ?? null;
}

export async function deleteDocumentText(
  scope: DocScope,
  projectId: string | null,
  agentId: string | null,
  docId: string
): Promise<void> {
  const key = buildKey(scope, projectId, agentId, docId);
  await withStore('readwrite', (store) => store.delete(key));
}

export async function hydrateUploadedDocuments(
  projectId: string | null,
  docs: UploadedDocument[]
): Promise<UploadedDocument[]> {
  const hydrated: UploadedDocument[] = [];
  for (const doc of docs) {
    if (doc.text && doc.text.length > 0) {
      hydrated.push(doc);
      continue;
    }
    const text = await getDocumentText('uploaded', projectId, null, doc.id);
    hydrated.push({ ...doc, text: text || '' });
  }
  return hydrated;
}

export async function hydrateAgentKnowledgeBases(
  projectId: string | null,
  bases: AgentKnowledgeBases
): Promise<AgentKnowledgeBases> {
  const next: AgentKnowledgeBases = {};
  for (const agentId of Object.keys(bases) as Array<keyof AgentKnowledgeBases>) {
    const docs = bases[agentId] || [];
    const hydratedDocs: UploadedDocument[] = [];
    for (const doc of docs) {
      if (doc.text && doc.text.length > 0) {
        hydratedDocs.push(doc);
        continue;
      }
      const text = await getDocumentText('agent', projectId, agentId, doc.id);
      hydratedDocs.push({ ...doc, text: text || '' });
    }
    next[agentId] = hydratedDocs;
  }
  return next;
}

export async function hydrateGlobalKnowledgeBases(
  bases: AgentKnowledgeBases
): Promise<AgentKnowledgeBases> {
  const next: AgentKnowledgeBases = {};
  for (const agentId of Object.keys(bases) as Array<keyof AgentKnowledgeBases>) {
    const docs = bases[agentId] || [];
    const hydratedDocs: UploadedDocument[] = [];
    for (const doc of docs) {
      if (doc.text && doc.text.length > 0) {
        hydratedDocs.push(doc);
        continue;
      }
      const text = await getDocumentText('global', null, agentId, doc.id);
      hydratedDocs.push({ ...doc, text: text || '' });
    }
    next[agentId] = hydratedDocs;
  }
  return next;
}
