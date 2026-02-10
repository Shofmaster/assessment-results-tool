import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // In production, verify the webhook signature using Clerk's svix library
    // For now, we process the payload directly
    const body = await request.json();
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

export default http;
