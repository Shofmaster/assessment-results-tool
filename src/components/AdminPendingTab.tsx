import { useState } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { GlassCard, Button } from './ui';
import { usePendingUsers, useSetApprovalStatus } from '../hooks/useConvexData';

export default function AdminPendingTab() {
  const pending = usePendingUsers() as any[] | undefined;
  const setApprovalStatus = useSetApprovalStatus();
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (user: any, status: 'approved' | 'rejected') => {
    setBusyId(user._id);
    try {
      await setApprovalStatus({ targetUserId: user._id, status });
      toast.success(
        `${status === 'approved' ? 'Approved' : 'Rejected'} ${user.name || user.email}`,
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update approval');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <GlassCard border rounded="xl">
      {!pending ? (
        <div className="p-8 text-center text-white/70">Loading pending sign-ups...</div>
      ) : pending.length === 0 ? (
        <div className="p-8 text-center text-white/70">No pending sign-ups.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {pending.map((u: any) => (
            <div
              key={u._id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                {u.picture ? (
                  <img src={u.picture} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-sky/20 flex items-center justify-center text-sm text-sky-light font-medium">
                    {(u.name || u.email)[0]}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-white">{u.name || u.email}</div>
                  <div className="text-xs text-white/70">{u.email}</div>
                  <div className="text-[11px] text-white/45">
                    Signed up {new Date(u.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => decide(u, 'approved')}
                  disabled={busyId === u._id}
                >
                  <FiCheck className="inline mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => decide(u, 'rejected')}
                  disabled={busyId === u._id}
                >
                  <FiX className="inline mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
