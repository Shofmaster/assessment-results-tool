import { useMemo, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { FiCreditCard, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'sonner';
import type { BillingPlanId } from '../../config/billingPlans';
import { BILLING_PLAN_OPTIONS } from '../../config/billingPlans';
import {
  useBillingOverview,
  useBillingPlans,
  useCancelSubscription,
  useChangeSubscriptionPlan,
  useCreateSubscriptionPayment,
  useMyAdminCompanies,
  useReactivateSubscription,
  useSyncBillingFromStripe,
} from '../../hooks/useConvexData';
import { Button } from '../ui';
import StripePaymentForm from './StripePaymentForm';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

type OwnerType = 'user' | 'company';

export default function BillingSection() {
  const { user } = useUser();
  const plans = useBillingPlans();
  const myAdminCompanies = useMyAdminCompanies() as { _id: string; name: string }[] | undefined;

  const [ownerType, setOwnerType] = useState<OwnerType>('user');
  const [companyId, setCompanyId] = useState<string>('');
  const [selectedPlan, setSelectedPlan] = useState<BillingPlanId>('pro');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentMode, setIntentMode] = useState<'payment' | 'setup'>('payment');
  const [trialDays, setTrialDays] = useState(0);
  const [busy, setBusy] = useState(false);

  const ownerId =
    ownerType === 'user' ? user?.id ?? '' : companyId || (myAdminCompanies?.[0]?._id ?? '');

  const overview = useBillingOverview(ownerType, ownerId || undefined);
  const createPayment = useCreateSubscriptionPayment();
  const changePlan = useChangeSubscriptionPlan();
  const cancelSub = useCancelSubscription();
  const reactivateSub = useReactivateSubscription();
  const syncStripe = useSyncBillingFromStripe();

  const subscription = overview?.subscription;
  const hasActiveSub = subscription?.grantsAccess === true;

  const planCards = useMemo(() => {
    const catalog = plans ?? [];
    return BILLING_PLAN_OPTIONS.map((opt) => {
      const meta = catalog.find((p: { id: string }) => p.id === opt.id);
      return { ...opt, featureCount: meta?.featureCount };
    });
  }, [plans]);

  const startSubscribe = async () => {
    if (!ownerId || !user?.primaryEmailAddress?.emailAddress) {
      toast.error('Sign in with an email address to subscribe.');
      return;
    }
    if (!stripePromise) {
      toast.error('Stripe publishable key is not configured (VITE_STRIPE_PUBLISHABLE_KEY).');
      return;
    }
    setBusy(true);
    try {
      const result = await createPayment({
        ownerType,
        ownerId,
        planId: selectedPlan,
        email: user.primaryEmailAddress.emailAddress,
        name: user.fullName ?? undefined,
      });
      setClientSecret(result.clientSecret);
      setIntentMode(result.intentMode ?? 'payment');
      setTrialDays(result.trialPeriodDays ?? 0);
      toast.message(
        result.trialPeriodDays
          ? `Start your ${result.trialPeriodDays}-day free trial of ${result.planName}`
          : `Complete payment for ${result.planName}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start subscription');
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setClientSecret(null);
    try {
      await syncStripe({ ownerType, ownerId });
      toast.success('Subscription activated');
    } catch {
      toast.message('Payment received — syncing subscription status…');
    }
  };

  const handleChangePlan = async (planId: BillingPlanId) => {
    if (!ownerId) return;
    setBusy(true);
    try {
      await changePlan({ ownerType, ownerId, planId });
      await syncStripe({ ownerType, ownerId });
      toast.success('Plan updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Plan change failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (immediate?: boolean) => {
    if (!ownerId) return;
    setBusy(true);
    try {
      await cancelSub({ ownerType, ownerId, cancelAtPeriodEnd: !immediate });
      await syncStripe({ ownerType, ownerId });
      toast.success(immediate ? 'Subscription canceled' : 'Subscription will cancel at period end');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    if (!ownerId) return;
    setBusy(true);
    try {
      await reactivateSub({ ownerType, ownerId });
      await syncStripe({ ownerType, ownerId });
      toast.success('Subscription reactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reactivate failed');
    } finally {
      setBusy(false);
    }
  };

  if (!stripePromise) {
    return (
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-display font-bold mb-2">Billing</h2>
        <p className="text-sm text-white/65">
          Add <code className="text-white">VITE_STRIPE_PUBLISHABLE_KEY</code> to enable subscription
          checkout. Configure Stripe secrets in Convex (see docs/billing-setup.md).
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <FiCreditCard className="text-white" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold">Billing & subscriptions</h2>
          <p className="text-sm text-white/60">Manage personal or company recurring plans.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <label className="text-sm text-white/70 flex items-center gap-2">
          Bill to
          <select
            value={ownerType}
            onChange={(e) => {
              setOwnerType(e.target.value as OwnerType);
              setClientSecret(null);
            }}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
          >
            <option value="user" className="bg-navy">
              My account
            </option>
            <option value="company" className="bg-navy" disabled={!myAdminCompanies?.length}>
              Company workspace
            </option>
          </select>
        </label>
        {ownerType === 'company' && myAdminCompanies && myAdminCompanies.length > 0 && (
          <select
            value={companyId || myAdminCompanies[0]._id}
            onChange={(e) => setCompanyId(e.target.value)}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm"
          >
            {myAdminCompanies.map((c) => (
              <option key={c._id} value={c._id} className="bg-navy">
                {c.name}
              </option>
            ))}
          </select>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || !ownerId}
          onClick={async () => {
            if (!ownerId) return;
            setBusy(true);
            try {
              await syncStripe({ ownerType, ownerId });
              toast.success('Synced from Stripe');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Sync failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          <FiRefreshCw className="inline mr-1" />
          Sync
        </Button>
      </div>

      {subscription && (
        <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="text-sm text-white/55">Current plan</p>
              <p className="text-lg font-semibold text-white">{subscription.planName}</p>
              <p className="text-sm text-white/60 capitalize">Status: {subscription.status}</p>
              {subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-amber-200/90 mt-1">Cancels at end of billing period</p>
              )}
              {subscription.status === 'past_due' && (
                <p className="text-sm text-red-300 mt-1">
                  Payment failed — update your payment method to restore access.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-start">
              {subscription.cancelAtPeriodEnd ? (
                <Button size="sm" onClick={handleReactivate} disabled={busy}>
                  Keep subscription
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => handleCancel(false)} disabled={busy}>
                  Cancel at period end
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {!hasActiveSub && !clientSecret && (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            {planCards.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  selectedPlan === plan.id
                    ? 'border-sky-light/50 bg-sky/15'
                    : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <p className="font-semibold text-white">{plan.name}</p>
                <p className="text-xs text-white/60 mt-1">{plan.description}</p>
                {plan.featureCount != null && (
                  <p className="text-xs text-sky-lighter/80 mt-2">{plan.featureCount} modules</p>
                )}
              </button>
            ))}
          </div>
          <Button onClick={startSubscribe} disabled={busy || !ownerId}>
            Subscribe to {BILLING_PLAN_OPTIONS.find((p) => p.id === selectedPlan)?.name}
          </Button>
        </>
      )}

      {hasActiveSub && (
        <div className="mb-4">
          <p className="text-sm text-white/65 mb-2">Change plan</p>
          <div className="flex flex-wrap gap-2">
            {BILLING_PLAN_OPTIONS.filter((p) => p.id !== subscription?.planId).map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => handleChangePlan(p.id)}
              >
                Switch to {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {clientSecret && stripePromise && (
        <div className="mt-4 p-4 rounded-xl bg-black/30 border border-white/10">
          <p className="text-sm text-white/70 mb-3">
            {trialDays > 0
              ? `Add a card to start your ${trialDays}-day free trial. You won't be charged until the trial ends.`
              : 'Enter payment details'}
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <StripePaymentForm
              submitLabel={trialDays > 0 ? 'Start free trial' : 'Subscribe'}
              intentMode={intentMode}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setClientSecret(null)}
            />
          </Elements>
        </div>
      )}

      {overview?.recentInvoices && overview.recentInvoices.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-white/80 mb-2">Recent invoices</h3>
          <ul className="space-y-2 text-sm">
            {overview.recentInvoices.map((inv: {
              _id: string;
              status: string;
              amountPaid: number;
              currency: string;
              hostedInvoiceUrl?: string;
            }) => (
              <li
                key={inv._id}
                className="flex flex-wrap justify-between gap-2 py-2 border-b border-white/10"
              >
                <span className="text-white/70 capitalize">{inv.status}</span>
                <span className="text-white/90">
                  {(inv.amountPaid / 100).toFixed(2)} {inv.currency.toUpperCase()}
                </span>
                {inv.hostedInvoiceUrl && (
                  <a
                    href={inv.hostedInvoiceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-lighter hover:underline text-xs"
                  >
                    View
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
