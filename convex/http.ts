import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify the svix signature so only Clerk can drive user upserts.
    // Fails closed: without CLERK_WEBHOOK_SECRET every request is rejected
    // (AuthGate's authenticated upsertFromClerk still syncs users on sign-in).
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      console.error("CLERK_WEBHOOK_SECRET is not set; rejecting webhook");
      return new Response("Webhook secret not configured", { status: 503 });
    }

    const payload = await request.text();
    const svixHeaders = {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    };

    let body: any;
    try {
      body = new Webhook(secret).verify(payload, svixHeaders);
    } catch {
      return new Response("Invalid webhook signature", { status: 400 });
    }
    const eventType = body.type;

    if (eventType === "user.created" || eventType === "user.updated") {
      const { id, email_addresses, first_name, last_name, image_url } = body.data;
      const primaryEmail = email_addresses?.find(
        (e: any) => e.id === body.data.primary_email_address_id
      );

      if (primaryEmail) {
        await ctx.runMutation(internal.users.upsertFromWebhook, {
          clerkUserId: id,
          email: primaryEmail.email_address,
          name: [first_name, last_name].filter(Boolean).join(" ") || undefined,
          picture: image_url || undefined,
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }
    const body = await request.text();
    try {
      await ctx.runAction(internal.billingWebhooks.processStripeWebhook, {
        body,
        signature,
      });
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook error";
      console.error("Stripe webhook failed:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
