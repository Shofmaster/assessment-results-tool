import { afterEach, describe, expect, it } from 'vitest';
import {
  deriveConversationTitle,
  normalizeAskSources,
  normalizeChatTurns,
  normalizeSplashPickedAgentIds,
  normalizeStoredConversations,
  readStoredConversations,
  splashChatsStorageKey,
  splashDraftStorageKey,
  writeStoredConversations,
  type ChatTurn,
  type StoredConversation,
} from '../chatModel';
import { AUDIT_AGENTS } from '../../../services/auditAgents';

const USER = 'user-abc';

afterEach(() => {
  localStorage.clear();
});

describe('splash chat persistence round-trip', () => {
  it('writes and reads conversations losslessly', () => {
    const convos: StoredConversation[] = [
      {
        id: 'c1',
        title: 'First',
        turns: [
          { role: 'user', content: 'What is Part 145?' },
          { role: 'assistant', content: 'A repair station rule.' },
        ],
        createdAt: 1000,
        updatedAt: 2000,
      },
    ];
    writeStoredConversations(USER, convos);
    const read = readStoredConversations(USER);
    expect(read).toHaveLength(1);
    expect(read[0].id).toBe('c1');
    expect(read[0].title).toBe('First');
    expect(read[0].turns).toHaveLength(2);
    expect(read[0].turns[1]).toMatchObject({ role: 'assistant', content: 'A repair station rule.' });
  });

  it('is scoped per user id', () => {
    writeStoredConversations(USER, [
      { id: 'c1', title: 'Mine', turns: [{ role: 'user', content: 'hi' }], createdAt: 1, updatedAt: 1 },
    ]);
    expect(readStoredConversations('someone-else')).toEqual([]);
    expect(splashChatsStorageKey(USER)).not.toBe(splashChatsStorageKey('other'));
    expect(splashDraftStorageKey(USER)).toContain(USER);
  });

  it('returns [] for missing or corrupt storage', () => {
    expect(readStoredConversations(USER)).toEqual([]);
    localStorage.setItem(splashChatsStorageKey(USER), '{not json');
    expect(readStoredConversations(USER)).toEqual([]);
  });

  it('sorts newest-first and drops conversations with no valid turns on read', () => {
    localStorage.setItem(
      splashChatsStorageKey(USER),
      JSON.stringify([
        { id: 'old', title: 'Old', turns: [{ role: 'user', content: 'a' }], createdAt: 1, updatedAt: 10 },
        { id: 'new', title: 'New', turns: [{ role: 'user', content: 'b' }], createdAt: 1, updatedAt: 99 },
        { id: 'empty', title: 'Empty', turns: [{ role: 'system', content: 'x' }], createdAt: 1, updatedAt: 100 },
      ]),
    );
    const read = readStoredConversations(USER);
    expect(read.map((c) => c.id)).toEqual(['new', 'old']);
  });
});

describe('normalizeChatTurns', () => {
  it('drops malformed turns and blank content', () => {
    const turns = normalizeChatTurns([
      { role: 'user', content: 'keep me' },
      { role: 'system', content: 'wrong role' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant' },
      'not an object',
    ]);
    expect(turns).toEqual([{ role: 'user', content: 'keep me' }]);
  });

  it('keeps meta and sources on assistant turns only', () => {
    const [assistant] = normalizeChatTurns([
      {
        role: 'assistant',
        content: 'answer',
        meta: { routedAgents: [{ id: 'a', name: 'Agent A' }], passageCount: 3 },
        sources: [{ tag: 'S1', kind: 'document', documentId: 'd1', docName: 'Doc', category: 'entity' }],
      },
    ]);
    expect(assistant.meta?.passageCount).toBe(3);
    expect(assistant.sources?.[0].tag).toBe('S1');

    const [userTurn] = normalizeChatTurns([
      { role: 'user', content: 'q', meta: { passageCount: 9 }, sources: [{ tag: 'S1', kind: 'document', documentId: 'd', docName: 'x', category: '' }] },
    ]);
    expect(userTurn.meta).toBeUndefined();
    expect(userTurn.sources).toBeUndefined();
  });

  it('caps at the history maximum', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ role: 'user' as const, content: `q${i}` }));
    const out = normalizeChatTurns(many);
    expect(out.length).toBe(80);
    // keeps the most recent
    expect(out[out.length - 1].content).toBe('q199');
  });
});

describe('normalizeStoredConversations', () => {
  it('drops empty conversations, sorts by updatedAt desc, and backfills id/title', () => {
    const out = normalizeStoredConversations([
      { turns: [{ role: 'user', content: 'has no id or title' }], createdAt: 5, updatedAt: 5 },
      { id: 'x', title: 'Newer', turns: [{ role: 'user', content: 'b' }], createdAt: 1, updatedAt: 50 },
      { id: 'empty', title: 'Empty', turns: [] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('x'); // updatedAt 50 sorts first
    expect(out[1].id).toBeTruthy(); // backfilled
    expect(out[1].title).toBe('has no id or title'); // derived from first user turn
  });
});

describe('deriveConversationTitle', () => {
  it('uses the first user turn, truncates long titles, and falls back', () => {
    const turns: ChatTurn[] = [
      { role: 'assistant', content: 'assistant first' },
      { role: 'user', content: 'the real question' },
    ];
    expect(deriveConversationTitle(turns)).toBe('the real question');
    expect(deriveConversationTitle([])).toBe('New chat');

    const long = 'x'.repeat(100);
    const title = deriveConversationTitle([{ role: 'user', content: long }]);
    expect(title.length).toBe(60);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('normalizeAskSources', () => {
  it('validates tag format and per-kind required fields', () => {
    const ok = normalizeAskSources([
      { tag: 'S1', kind: 'document', documentId: 'd1', docName: 'Doc', category: 'entity' },
      { tag: 'S2', kind: 'chunk', documentId: 'd2', docName: 'Doc2', startChar: 0, endChar: 10 },
      { tag: 'S3', kind: 'record', recordId: 'r1', route: '/logbook', label: 'Entry', table: 'logbook' },
      { tag: 'BAD', kind: 'document', documentId: 'd3', docName: 'x', category: '' }, // bad tag
      { tag: 'S4', kind: 'chunk', documentId: 'd4', docName: 'x' }, // chunk missing offsets
      { tag: 'S5', kind: 'record', recordId: 'r2', route: 'no-slash' }, // bad route
    ]);
    expect(ok?.map((s) => s.tag)).toEqual(['S1', 'S2', 'S3']);
  });

  it('returns undefined when nothing valid', () => {
    expect(normalizeAskSources([{ tag: 'nope' }])).toBeUndefined();
    expect(normalizeAskSources('not an array')).toBeUndefined();
  });
});

describe('normalizeSplashPickedAgentIds', () => {
  it('keeps only known agent ids and dedupes', () => {
    const known = AUDIT_AGENTS[0].id;
    const out = normalizeSplashPickedAgentIds([known, known, 'not-a-real-agent', 42]);
    expect(out).toEqual([known]);
  });
});
