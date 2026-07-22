/**
 * Splash chat data model: turn/conversation types, localStorage persistence,
 * and the defensive normalizers that guard against malformed stored data.
 * Extracted verbatim from SplashPage.tsx.
 */
import { AUDIT_AGENTS } from '../../services/auditAgents';
import type { AuditAgent } from '../../types/auditSimulation';
import type { AskSource } from '../../types/askSources';

export type AssistantTurnMeta = {
  routedAgents: Array<{ id: string; name: string }>;
  retrievedDocs: Array<{ id: string; name: string; category: string }>;
  passageCount: number;
  docCount: number;
  fallback: boolean;
  manualRouting: boolean;
};

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  meta?: AssistantTurnMeta;
  /** Tagged citation sources for this assistant turn (per-turn scope: only these validate its [S#] tags). */
  sources?: AskSource[];
};

const SPLASH_CHAT_HISTORY_MAX_TURNS = 80;

/** A document surfaced by retrieval, referenced from turn meta and context builders. */
export type RetrievedDocRef = { id: string; name: string; category: string };

const SPLASH_DRAFT_STORAGE_PREFIX = 'aerogap_splash_draft_v1:';

export function splashDraftStorageKey(userId: string): string {
  return `${SPLASH_DRAFT_STORAGE_PREFIX}${userId}`;
}

const KNOWN_SPLASH_AGENT_IDS: Set<string> = new Set(AUDIT_AGENTS.map((a) => a.id));

export function normalizeSplashPickedAgentIds(raw: unknown): AuditAgent['id'][] {
  if (!Array.isArray(raw)) return [];
  const out: AuditAgent['id'][] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !KNOWN_SPLASH_AGENT_IDS.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as AuditAgent['id']);
  }
  return out;
}

function normalizeAssistantMeta(raw: unknown): AssistantTurnMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const routedAgents = Array.isArray(obj.routedAgents)
    ? (obj.routedAgents as unknown[])
        .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : null))
        .filter((a): a is Record<string, unknown> => a !== null)
        .map((a) => ({ id: String(a.id || ''), name: String(a.name || '') }))
        .filter((a) => a.id || a.name)
    : [];
  const retrievedDocs = Array.isArray(obj.retrievedDocs)
    ? (obj.retrievedDocs as unknown[])
        .map((d) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : null))
        .filter((d): d is Record<string, unknown> => d !== null)
        .map((d) => ({
          id: String(d.id || ''),
          name: String(d.name || ''),
          category: String(d.category || ''),
        }))
        .filter((d) => d.name)
    : [];
  return {
    routedAgents,
    retrievedDocs,
    passageCount: Number.isFinite(obj.passageCount) ? Number(obj.passageCount) : 0,
    docCount: Number.isFinite(obj.docCount) ? Number(obj.docCount) : 0,
    fallback: obj.fallback === true,
    manualRouting: obj.manualRouting === true,
  };
}

export function normalizeAskSources(raw: unknown): AskSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: AskSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const tag = typeof obj.tag === 'string' ? obj.tag : '';
    if (!/^S[1-9]\d{0,2}$/.test(tag)) continue;
    if (obj.kind === 'record') {
      const recordId = String(obj.recordId || '');
      const route = String(obj.route || '');
      if (!recordId || !route.startsWith('/')) continue;
      out.push({
        tag,
        kind: 'record',
        table: String(obj.table || ''),
        recordId,
        label: String(obj.label || 'Record'),
        route,
      });
      continue;
    }
    const documentId = typeof obj.documentId === 'string' ? obj.documentId : '';
    if (!documentId) continue;
    const docName = String(obj.docName || 'Company document');
    const category = String(obj.category || '');
    if (obj.kind === 'chunk') {
      if (!Number.isFinite(obj.startChar) || !Number.isFinite(obj.endChar)) continue;
      out.push({
        tag,
        kind: 'chunk',
        documentId,
        chunkId: String(obj.chunkId || ''),
        docName,
        category,
        chunkIndex: Number.isFinite(obj.chunkIndex) ? Number(obj.chunkIndex) : 0,
        totalChunks: Number.isFinite(obj.totalChunks) ? Number(obj.totalChunks) : 0,
        startChar: Number(obj.startChar),
        endChar: Number(obj.endChar),
        score: Number.isFinite(obj.score) ? Number(obj.score) : 0,
        excerpt: String(obj.excerpt || ''),
      });
    } else if (obj.kind === 'document') {
      out.push({ tag, kind: 'document', documentId, docName, category });
    }
  }
  return out.length > 0 ? out : undefined;
}

export function normalizeChatTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    const turn: ChatTurn = { role, content: trimmed };
    if (role === 'assistant') {
      const meta = normalizeAssistantMeta((item as { meta?: unknown }).meta);
      if (meta) turn.meta = meta;
      const sources = normalizeAskSources((item as { sources?: unknown }).sources);
      if (sources) turn.sources = sources;
    }
    out.push(turn);
  }
  return out.slice(-SPLASH_CHAT_HISTORY_MAX_TURNS);
}

export type StoredConversation = {
  id: string;
  title: string;
  turns: ChatTurn[];
  createdAt: number;
  updatedAt: number;
};

const SPLASH_CHATS_STORAGE_PREFIX = 'aerogap_splash_chats_v1:';
const SPLASH_CHATS_MAX = 60;

export function splashChatsStorageKey(userId: string): string {
  return `${SPLASH_CHATS_STORAGE_PREFIX}${userId}`;
}

export function makeConversationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* randomUUID unavailable */
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveConversationTitle(turns: ChatTurn[]): string {
  const firstUser = turns.find((t) => t.role === 'user');
  const base = (firstUser?.content || turns[0]?.content || '').trim().replace(/\s+/g, ' ');
  if (!base) return 'New chat';
  return base.length > 60 ? `${base.slice(0, 59)}…` : base;
}

export function normalizeStoredConversations(raw: unknown): StoredConversation[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredConversation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const turns = normalizeChatTurns(obj.turns);
    if (turns.length === 0) continue;
    const id = typeof obj.id === 'string' && obj.id ? obj.id : makeConversationId();
    const createdAt = Number.isFinite(obj.createdAt) ? Number(obj.createdAt) : Date.now();
    const updatedAt = Number.isFinite(obj.updatedAt) ? Number(obj.updatedAt) : createdAt;
    const title =
      typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : deriveConversationTitle(turns);
    out.push({ id, title, turns, createdAt, updatedAt });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out.slice(0, SPLASH_CHATS_MAX);
}

export function readStoredConversations(userId: string): StoredConversation[] {
  try {
    const raw = localStorage.getItem(splashChatsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const normalized = normalizeStoredConversations(parsed);
    // If any conversation was missing an id, normalization minted a fresh one —
    // write the repaired list back so the ids are stable across reads (delete /
    // select operations key on them).
    const anyMissingId =
      Array.isArray(parsed) &&
      parsed.some((c) => !c || typeof c !== 'object' || typeof (c as { id?: unknown }).id !== 'string' || !(c as { id?: string }).id);
    if (anyMissingId) writeStoredConversations(userId, normalized);
    return normalized;
  } catch {
    return [];
  }
}

export function writeStoredConversations(userId: string, conversations: StoredConversation[]): void {
  try {
    const trimmed = conversations
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, SPLASH_CHATS_MAX);
    localStorage.setItem(splashChatsStorageKey(userId), JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(ts).toLocaleDateString();
}
