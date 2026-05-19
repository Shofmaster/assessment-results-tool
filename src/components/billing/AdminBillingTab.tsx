import { useState } from 'react';
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'sonner';
import { useBillingAdminSummary, useSyncBillingFromStripe } from '../../hooks/useConvexData';
import { Button, GlassCard } from '../ui';

export default function AdminBillingTab() {
  const summary = useBillingAdminSummary();
  const syncStripe = useSyncBillingFromStripe();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSync = async (ownerType: 'user' | 'company', ownerId: string) => {
    const key = `${ownerType}:${ownerId}`;
    setSyncingId(key);
    try {
      await syncStripe({ ownerType, ownerId });
      toast.success('Reconciled from Stripe');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  if (summary === undefined) {
    return <p className="text-white/60 text-sm p-4">Loading billing operations…</p>;
  }

  const { stats, subscriptions, recentEvents } = summary;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-4 gap-3">
        {[
          { label: 'Customers', value: stats.totalCustomers },
          { label: 'Active subs', value: stats.activeSubscriptions },
          { label: 'Past due', value: stats.pastDue },
          { label: 'Webhook failures', value: stats.failedWebhooks },
        ].map((s) => (
          <GlassCard key={s.label} border rounded="xl" className="p-4">
            <p className="text-xs text-white/55">{s.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard border rounded="xl" className="overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-display font-bold text-white">Subscriptions</h3>
          <p className="text-xs text-white/60 mt-1">Stripe-backed recurring subscriptions by owner.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="p-3">Owner</th>
                <th className="p-3">Plan</th>
                <th className="p-3">Status</th>
                <th className="p-3">Dunning</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub: {
                _id: string;
                ownerType: 'user' | 'company';
                ownerId: string;
                planName: string;
                status: string;
                dunningStatus?: string;
                customer?: { email?: string } | null;
              }) => (
                <tr key={sub._id} className="border-b border-white/5 text-white/85">
                  <td className="p-3">
                    <span className="capitalize text-white/50 text-xs">{sub.ownerType}</span>
                    <br />
                    {sub.customer?.email ?? sub.ownerId}
                  </td>
                  <td className="p-3">{sub.planName}</td>
                  <td className="p-3 capitalize">{sub.status}</td>
                  <td className="p-3 capitalize">{sub.dunningStatus ?? 'none'}</td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={syncingId === `${sub.ownerType}:${sub.ownerId}`}
                      onClick={() => handleSync(sub.ownerType, sub.ownerId)}
                    >
                      <FiRefreshCw className="inline mr-1" />
                      Sync
                    </Button>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-white/50">
                    No subscriptions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard border rounded="xl" className="overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <FiAlertCircle className="text-amber-300" />
          <h3 className="text-lg font-display font-bold text-white">Recent webhook events</h3>
        </div>
        <ul className="divide-y divide-white/10 text-sm max-h-80 overflow-y-auto">
          {recentEvents.map((ev: {
            _id: string;
            eventType: string;
            status: string;
            errorMessage?: string;
          }) => (
            <li key={ev._id} className="p-3 flex flex-wrap justify-between gap-2">
              <span className="text-white/80">{ev.eventType}</span>
              <span
                className={
                  ev.status === 'failed'
                    ? 'text-red-300'
                    : ev.status === 'skipped'
                      ? 'text-white/45'
                      : 'text-emerald-300'
                }
              >
                {ev.status}
              </span>
              {ev.errorMessage && (
                <span className="w-full text-xs text-red-200/80">{ev.errorMessage}</span>
              )}
            </li>
          ))}
          {recentEvents.length === 0 && (
            <li className="p-6 text-center text-white/50">No webhook events recorded.</li>
          )}
        </ul>
      </GlassCard>
    </div>
  );
}
