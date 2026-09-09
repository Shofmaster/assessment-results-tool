import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  SERVICE_TOKEN_ENV,
  SERVICE_TOKEN_HEADER,
  verifyServiceToken,
} from "./lib/serviceToken";
import { isAiProvider } from "./lib/aiCredentialScope";

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

/**
 * Server-to-server credential lookup for the api/ runtime (Vercel functions and
 * the self-hosted Express adapter), which cannot call Convex internal functions.
 *
 * WHY A ROUTE AND NOT A PUBLIC QUERY: ConvexHttpClient can only call PUBLIC
 * functions, and the browser holds the very same Clerk token the api/ layer
 * does. A public query that returns a plaintext key would therefore be readable
 * by any signed-in user. Passing a shared secret as a function ARGUMENT is no
 * better: arguments land in the Convex function-call history and in log drains.
 *
 * DUAL AUTHENTICATION - both legs are required:
 *   1. Service leg: the x-aerogap-service-token header must match this
 *      deployment's AI_CREDENTIAL_SERVICE_TOKEN, compared in constant time.
 *      This proves the caller is our server process; a browser never has it.
 *   2. User leg: ctx.auth.getUserIdentity(), populated from the forwarded
 *      Authorization: Bearer <clerk jwt>. identity.subject is authoritative and
 *      any userId in the body is IGNORED, so a leaked service token on its own
 *      still cannot mint a key for an arbitrary tenant - it can only act as a
 *      user who already had a valid session.
 *
 * No CORS headers are emitted (Convex httpAction adds none), so even a browser
 * that somehow obtained the token could not read the response cross-origin.
 *
 * "No row anywhere" is a 200 with credential: null, NOT an error - it is the
 * legitimate answer meaning "use your own environment fallback".
 */
http.route({
  path: "/internal/ai-credential",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env[SERVICE_TOKEN_ENV];
    if (!expected || expected.trim().length === 0) {
      // Fail closed, and say so distinctly: this is a misconfiguration, not a
      // bad credential, and the caller must not silently fall back to its own
      // environment key (that would route every tenant onto the platform key).
      console.error(`${SERVICE_TOKEN_ENV} is not set; rejecting credential lookup`);
      return new Response("Credential service is not configured", { status: 503 });
    }

    if (!verifyServiceToken(request.headers.get(SERVICE_TOKEN_HEADER), expected)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      // Crons and other service callers run INSIDE Convex and use
      // resolveAiKeyInAction directly, so they never reach this route. An
      // identity-less request here is not a legitimate caller.
      return new Response("Unauthorized", { status: 401 });
    }

    let body: { provider?: unknown; projectId?: unknown };
    try {
      body = await request.json();
    } catch {
      return new Response("Malformed JSON body", { status: 400 });
    }

    const provider = body.provider;
    if (!isAiProvider(provider)) {
      return new Response("Unknown provider", { status: 400 });
    }

    const projectHint =
      typeof body.projectId === "string" && body.projectId.length > 0
        ? body.projectId
        : undefined;

    // The project hint is untrusted browser input. _resolveCredential
    // re-authorizes it, but a MALFORMED id is rejected by Convex argument
    // validation before the handler runs - so retry without the hint rather
    // than turning a stale browser tab into a 500.
    const sealed = await (async () => {
      try {
        return await ctx.runQuery(internal.aiCredentials._resolveCredential, {
          provider,
          userId: identity.subject,
          projectId: projectHint as Id<"projects"> | undefined,
        });
      } catch {
        return await ctx.runQuery(internal.aiCredentials._resolveCredential, {
          provider,
          userId: identity.subject,
        });
      }
    })();

    if (!sealed) {
      return new Response(JSON.stringify({ credential: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Decryption happens here rather than in the query: queries must stay
    // deterministic and have no crypto.subtle.
    return new Response(
      JSON.stringify({
        credential: {
          apiKey: await ctx.runAction(internal.aiCredentialCryptoActions.openSealedSecret, {
            apiKey: sealed.apiKey,
            encryption: sealed.encryption,
          }),
          source: sealed.source,
          companyId: sealed.companyId ?? null,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }),
});

/**
 * Local sign-in, sign-up and password change.
 *
 * ONE authentication leg, not two - and the difference from
 * /internal/ai-credential above is deliberate and worth stating.
 *
 * That route requires BOTH a service token and a user identity, because it acts
 * on behalf of someone who is already signed in. This route CANNOT require an
 * identity: it is how an identity comes into existence. Demanding a session to
 * sign in would be circular.
 *
 * So the service token is the whole boundary here, which makes what the route
 * returns matter enormously. It returns a verdict and, on success, a subject
 * and email - never a password hash. A leaked service token therefore buys the
 * ability to ATTEMPT sign-ins, which is exactly what the login form already
 * offers the world, rather than the credential database itself.
 *
 * Rate limiting lives in the account record (failedAttempts / lockedUntil), so
 * it applies however the attempt arrives.
 */
http.route({
  path: "/internal/local-auth",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env[SERVICE_TOKEN_ENV];
    if (!expected || expected.trim().length === 0) {
      // A misconfiguration, not a bad credential - and it must not fall through
      // to "allow", which for an auth route would be catastrophic.
      console.error(`${SERVICE_TOKEN_ENV} is not set; rejecting local-auth request`);
      return new Response("Local authentication service is not configured", { status: 503 });
    }

    if (!verifyServiceToken(request.headers.get(SERVICE_TOKEN_HEADER), expected)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: {
      action?: string;
      email?: string;
      password?: string;
      name?: string;
      subject?: string;
      targetEmail?: string;
      currentPassword?: string;
      newPassword?: string;
      callerSubject?: string;
      adminAssertion?: string;
    };
    try {
      body = await request.json();
    } catch {
      return new Response("Malformed request", { status: 400 });
    }

    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    switch (body.action) {
      case "signIn": {
        const result = await ctx.runAction(internal.localAuthActions.signIn, {
          email: String(body.email || ""),
          password: String(body.password || ""),
        });
        // 200 even for a rejected attempt: the VERDICT is the payload, and the
        // app server needs the message to show. A 401 here would be about the
        // service token, not the user's password.
        return json(result);
      }

      case "createAccount": {
        const result = await ctx.runAction(internal.localAuthActions.createAccount, {
          subject: String(body.subject || ""),
          email: String(body.email || ""),
          password: String(body.password || ""),
          name: body.name ? String(body.name) : undefined,
        });
        return json(result);
      }

      case "hasAccounts": {
        return json(await ctx.runAction(internal.localAuthActions.hasAccounts, {}));
      }

      case "adminResetPassword": {
        const result = await ctx.runAction(internal.localAuthActions.adminResetPassword, {
          callerSubject: String(body.callerSubject || body.subject || ""),
          targetEmail: String(body.targetEmail || ""),
          newPassword: String(body.newPassword || ""),
          adminAssertion: String(body.adminAssertion || ""),
        });
        return json(result);
      }

      case "changePassword": {
        const result = await ctx.runAction(internal.localAuthActions.changePassword, {
          subject: String(body.subject || ""),
          currentPassword: String(body.currentPassword || ""),
          newPassword: String(body.newPassword || ""),
        });
        return json(result);
      }

      default:
        return new Response("Unknown action", { status: 400 });
    }
  }),
});

export default http;
