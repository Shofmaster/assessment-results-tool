/** Client-side plan metadata (Stripe price IDs are server-only). */

export type BillingPlanId = 'basic' | 'pro' | 'enterprise';

export const BILLING_PLAN_OPTIONS: {
  id: BillingPlanId;
  name: string;
  description: string;
  highlight?: boolean;
}[] = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'QM Core compliance workflow for small teams.',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'QM Core plus audit simulation, analytics, and manual tools.',
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Full platform including logbook and all modules.',
  },
];
