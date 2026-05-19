# Stripe billing setup

## Overview

Recurring subscriptions use **Stripe embedded Elements** with Convex actions for server-side API calls and an HTTP webhook for lifecycle updates. Billing owners:

- **User** — individual subscription (`ownerType: user`, `ownerId` = Clerk user id)
- **Company** — workspace subscription (`ownerType: company`, `ownerId` = Convex `companies` id)

## Convex environment variables

```bash
npx convex env set STRIPE_SECRET_KEY sk_test_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...
npx convex env set STRIPE_PRICE_BASIC_MONTHLY price_...
npx convex env set STRIPE_PRICE_PRO_MONTHLY price_...
npx convex env set STRIPE_PRICE_ENTERPRISE_MONTHLY price_...
# Optional: enforce paid access (default off for existing tenants)
npx convex env set BILLING_ENFORCEMENT_ENABLED false
```

Create three recurring Prices in the Stripe Dashboard (test mode first) and paste each Price ID into the variables above.

## Frontend

Add to `.env.local`:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Webhook endpoint

In Stripe Dashboard → Developers → Webhooks, add:

```
https://<your-deployment>.convex.site/stripe-webhook
```

Recommended events:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.finalized`

## Rollout checklist

1. Configure test keys and prices; complete a test subscription in **Settings → Billing**.
2. Confirm webhook events appear in **Admin → Billing** (no failed events).
3. Verify entitlements sync to company policy or user settings (`entitlementSource: billing`).
4. Enable `BILLING_ENFORCEMENT_ENABLED=true` for pilot tenants when ready.
5. Swap to live Stripe keys and production webhook secret.

## Operations

- Daily cron reconciles all Stripe customers against Convex (`billingReconcile`).
- Admin **Billing** tab shows subscriptions, dunning (`past_due`), and webhook failures.
- Manual feature toggles in Company Admin or platform Admin set `entitlementSource: manual` and override billing sync.
