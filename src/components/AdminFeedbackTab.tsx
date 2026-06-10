import { useState } from 'react';
import { FiAlertCircle, FiZap, FiSmile } from 'react-icons/fi';
import { toast } from 'sonner';
import { GlassCard, Button } from './ui';
import { useFeedbackList, useSetFeedbackStatus } from '../hooks/useConvexData';

type FeedbackStatus = 'new' | 'triaged' | 'resolved';

const KIND_META: Record<string, { label: string; icon: typeof FiAlertCircle; className: string }> = {
  bug: { label: 'Bug', icon: FiAlertCircle, className: 'bg-red-500/20 text-red-300' },
  idea: { label: 'Idea', icon: FiZap, className: 'bg-sky/20 text-sky-lighter' },
  praise: { label: 'Praise', icon: FiSmile, className: 'bg-green-500/20 text-green-300' },
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  resolved: 'Resolved',
};

const NEXT_STATUS: Record<FeedbackStatus, FeedbackStatus | null> = {
  new: 'triaged',
  triaged: 'resolved',
  resolved: null,
};

export default function AdminFeedbackTab() {
  const feedback = useFeedbackList() as any[] | undefined;
  const setStatus = useSetFeedbackStatus();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | FeedbackStatus>('all');

  const advance = async (item: any) => {
    const next = NEXT_STATUS[item.status as FeedbackStatus];
    if (!next) return;
    setBusyId(item._id);
    try {
      await setStatus({ feedbackId: item._id, status: next });
      toast.success(`Marked ${STATUS_LABEL[next].toLowerCase()}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  };

  const visible = (feedback ?? []).filter(
    (f) => filter === 'all' || f.status === filter,
  );

  return (
    <GlassCard border rounded="xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-white/50">Filter</span>
        {(['all', 'new', 'triaged', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-sky/20 text-sky-lighter border border-sky-light/30'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {!feedback ? (
        <div className="p-8 text-center text-white/70">Loading feedback...</div>
      ) : visible.length === 0 ? (
        <div className="p-8 text-center text-white/70">No feedback to show.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {visible.map((item: any) => {
            const meta = KIND_META[item.kind] ?? KIND_META.idea;
            const Icon = meta.icon;
            const next = NEXT_STATUS[item.status as FeedbackStatus];
            return (
              <div key={item._id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
                      <Icon className="text-xs" />
                      {meta.label}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70">
                      {STATUS_LABEL[item.status as FeedbackStatus] ?? item.status}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-white/85">{item.message}</p>
                  <div className="mt-1.5 text-[11px] text-white/45">
                    {item.email ? <span>{item.email} · </span> : null}
                    {item.path ? <span>{item.path} · </span> : null}
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                </div>
                {next && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => advance(item)} disabled={busyId === item._id}>
                      Mark {STATUS_LABEL[next].toLowerCase()}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
