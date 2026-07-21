/**
 * Saved-conversations side panel for the splash Ask-an-Expert chat.
 * Extracted verbatim from SplashPage.tsx.
 */
import { useState } from 'react';
import { formatRelativeTime, type StoredConversation } from './chatModel';

export default function ChatHistoryPanel({
  conversations,
  activeConversationId,
  isDarkMode,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: StoredConversation[];
  activeConversationId: string | null;
  isDarkMode: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const newBtnClass = isDarkMode
    ? 'flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky/40 bg-sky/15 px-3 py-2 text-sm font-semibold text-sky-light hover:bg-sky/25'
    : 'flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
          Chats
        </p>
        <span className={`text-[10px] ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>{conversations.length}</span>
      </div>
      <button type="button" onClick={onNew} className={`mt-2 ${newBtnClass}`}>
        <span aria-hidden="true" className="text-base leading-none">+</span> New chat
      </button>
      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        {conversations.length === 0 ? (
          <p className={`px-1 py-2 text-xs ${isDarkMode ? 'text-white/45' : 'text-slate-400'}`}>
            No past chats yet. Ask a question to start one.
          </p>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeConversationId;
            const containerClass = active
              ? isDarkMode
                ? 'border-sky/40 bg-sky/15'
                : 'border-sky-300 bg-sky-50'
              : isDarkMode
                ? 'border-transparent hover:bg-white/5'
                : 'border-transparent hover:bg-slate-100';
            const userMsgs = c.turns.filter((t) => t.role === 'user').length;
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${containerClass}`}
              >
                <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate text-sm ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>
                    {c.title || 'New chat'}
                  </span>
                  <span className={`block truncate text-[10px] ${isDarkMode ? 'text-white/45' : 'text-slate-400'}`}>
                    {formatRelativeTime(c.updatedAt)} · {userMsgs} {userMsgs === 1 ? 'message' : 'messages'}
                  </span>
                </button>
                {confirmId === c.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(c.id);
                        setConfirmId(null);
                      }}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        isDarkMode ? 'bg-rose-500/80 text-white hover:bg-rose-500' : 'bg-rose-600 text-white hover:bg-rose-700'
                      }`}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        isDarkMode ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(c.id)}
                    aria-label={`Delete chat: ${c.title || 'New chat'}`}
                    className={`shrink-0 rounded p-1 text-base leading-none opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 ${
                      isDarkMode ? 'text-white/50 hover:text-rose-300' : 'text-slate-400 hover:text-rose-600'
                    }`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
