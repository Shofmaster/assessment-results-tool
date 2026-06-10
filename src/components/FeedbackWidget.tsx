import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { FiMessageSquare, FiAlertCircle, FiZap, FiSmile } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button, GlassModal } from './ui';
import { useAppStore } from '../store/appStore';
import { useSubmitFeedback } from '../hooks/useConvexData';
import type { Id } from '../../convex/_generated/dataModel';

type Kind = 'bug' | 'idea' | 'praise';

const KINDS: { id: Kind; label: string; icon: typeof FiAlertCircle }[] = [
  { id: 'bug', label: 'Bug', icon: FiAlertCircle },
  { id: 'idea', label: 'Idea', icon: FiZap },
  { id: 'praise', label: 'Praise', icon: FiSmile },
];

export default function FeedbackWidget() {
  const { isSignedIn, user } = useUser();
  const location = useLocation();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const submitFeedback = useSubmitFeedback();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only available to signed-in users; mounted inside the authenticated shell.
  if (!isSignedIn) return null;

  const reset = () => {
    setKind('bug');
    setMessage('');
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Please describe your feedback first.');
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback({
        kind,
        message: trimmed,
        email: user?.primaryEmailAddress?.emailAddress,
        projectId: activeProjectId ? (activeProjectId as Id<'projects'>) : undefined,
        path: location.pathname,
        userAgent: navigator.userAgent,
      });
      toast.success('Thanks — your feedback was sent.');
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/15 bg-navy-900/80 px-4 py-2.5 text-sm font-medium text-white/85 shadow-lg shadow-black/30 backdrop-blur transition-colors hover:bg-navy-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky"
        aria-label="Send feedback or report a problem"
      >
        <FiMessageSquare className="text-base" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <GlassModal
        open={open}
        title="Send feedback"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} loading={submitting}>
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50">
              Type
            </span>
            <div className="flex gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const active = kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKind(k.id)}
                    className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-sky-light/40 bg-sky/20 text-sky-lighter'
                        : 'border-white/10 text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                    aria-pressed={active}
                  >
                    <Icon className="text-base" />
                    {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="feedback-message"
              className="mb-2 block text-xs font-medium uppercase tracking-wide text-white/50"
            >
              Details
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              autoFocus
              placeholder={
                kind === 'bug'
                  ? 'What happened? What did you expect instead?'
                  : kind === 'idea'
                    ? 'What would you like to see?'
                    : 'What is working well for you?'
              }
              className="w-full resize-y rounded-lg border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-sky-light/40 focus:outline-none focus:ring-1 focus:ring-sky-light/40"
            />
          </div>

          <p className="text-[11px] text-white/40">
            Your account and current page are included to help us follow up.
          </p>
        </div>
      </GlassModal>
    </>
  );
}
