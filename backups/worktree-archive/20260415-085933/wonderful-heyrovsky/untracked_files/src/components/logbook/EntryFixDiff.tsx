/**
 * EntryFixDiff — shows a simple line diff between original and rewritten
 * entry text, with copy/export buttons.
 */

import { useState } from 'react';
import { FiCopy, FiCheck, FiX } from 'react-icons/fi';
import type { RewrittenEntry } from '../../services/entryFixService';

// ── Minimal LCS diff ─────────────────────────────────────────────────────────

interface DiffLine {
  type: 'same' | 'add' | 'remove';
  text: string;
}

function computeDiff(original: string, rewritten: string): DiffLine[] {
  const a = original.split('\n');
  const b = rewritten.split('\n');

  // Simple LCS-based diff
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = m, j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ type: 'same', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'add', text: b[j - 1] });
      j--;
    } else {
      stack.push({ type: 'remove', text: a[i - 1] });
      i--;
    }
  }

  while (stack.length) result.push(stack.pop()!);
  return result;
}

// ── Component ────────────────────────────────────────────────────────────────

interface EntryFixDiffProps {
  originalText: string;
  rewrite: RewrittenEntry;
  onDismiss: () => void;
}

export default function EntryFixDiff({ originalText, rewrite, onDismiss }: EntryFixDiffProps) {
  const [copied, setCopied] = useState(false);
  const diff = computeDiff(originalText.trim(), rewrite.suggestedFullEntryText.trim());

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(rewrite.suggestedFullEntryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* best effort */ }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
        <span className="text-xs font-semibold text-white/60 flex-1">Suggested Rewrite</span>
        {rewrite.changedFields.length > 0 && (
          <span className="text-[10px] text-white/30">
            Changed: {rewrite.changedFields.join(', ')}
          </span>
        )}
        <button
          type="button"
          onClick={copyToClipboard}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-white/10 transition-colors"
        >
          {copied ? <FiCheck className="text-emerald-400" /> : <FiCopy />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
        >
          <FiX />
        </button>
      </div>

      {/* Diff view */}
      <div className="max-h-[300px] overflow-y-auto">
        <pre className="px-4 py-3 text-xs font-mono leading-relaxed">
          {diff.map((line, i) => (
            <div
              key={i}
              className={
                line.type === 'add'
                  ? 'bg-emerald-500/10 text-emerald-300/80'
                  : line.type === 'remove'
                  ? 'bg-red-500/10 text-red-300/60 line-through'
                  : 'text-white/50'
              }
            >
              <span className="inline-block w-4 text-right mr-2 text-white/20 select-none">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
              </span>
              {line.text}
            </div>
          ))}
        </pre>
      </div>

      {/* Full rewritten text (collapsed) */}
      <details className="border-t border-white/5">
        <summary className="px-4 py-2 text-[11px] text-white/30 cursor-pointer hover:text-white/50">
          View full rewritten text
        </summary>
        <pre className="px-4 py-3 text-xs text-white/60 font-mono whitespace-pre-wrap border-t border-white/5">
          {rewrite.suggestedFullEntryText}
        </pre>
      </details>
    </div>
  );
}
