"use node";

import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured in Convex environment.");
  }
  stripeSingleton = new Stripe(secretKey);
  return stripeSingleton;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured in Convex environment.");
  }
  return secret;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
