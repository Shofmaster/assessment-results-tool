/**
 * Per-user Google Drive OAuth (authorization-code flow).
 *
 * The browser never sees the refresh token: GIS returns an auth code, this
 * module exchanges it (with GOOGLE_CLIENT_SECRET) and stores the refresh
 * token in `googleDriveTokens`. Later requests call getAccessToken, which
 * refreshes a short-lived access token server-side so Drive survives reloads
 * and app sign-outs without another Google popup.
 *
 * Required Convex env (Dashboard → Settings → Environment Variables):
 *   GOOGLE_CLIENT_ID     — same OAuth web client as VITE_GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET — the client secret for that OAuth web client
 */
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth } from "./_helpers";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** GIS popup code flow uses this fixed redirect URI. */
const GIS_POPUP_REDIRECT_URI = "postmessage";

function requireGoogleOAuthEnv(): { clientId: string; clientSecret: string } {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Drive persistent auth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Convex dashboard.",
    );
  }
  return { clientId, clientSecret };
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Google token exchange failed: ${detail}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Internal storage helpers
// ---------------------------------------------------------------------------

export const _getRefreshToken = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleDriveTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    return row?.refreshToken ?? null;
  },
});

export const _storeRefreshToken = internalMutation({
  args: { userId: v.string(), refreshToken: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleDriveTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { refreshToken: args.refreshToken, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("googleDriveTokens", {
      userId: args.userId,
      refreshToken: args.refreshToken,
      updatedAt: now,
    });
  },
});

export const _clearRefreshToken = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("googleDriveTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** True when this user has a stored Drive refresh token (survives reloads). */
export const hasConnection = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const row = await ctx.db
      .query("googleDriveTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return row !== null;
  },
});

/** Drop the stored refresh token (Settings → Disconnect Google Drive). */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const existing = await ctx.db
      .query("googleDriveTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/**
 * Exchange a GIS popup authorization code for tokens. Stores the refresh
 * token server-side and returns a short-lived access token to the client.
 */
export const exchangeCode = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<{ accessToken: string; expiresIn: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const { clientId, clientSecret } = requireGoogleOAuthEnv();

    const code = args.code.trim();
    if (!code) throw new Error("Missing authorization code");

    const data = await postToken({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: GIS_POPUP_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    if (!data.access_token || !data.expires_in) {
      throw new Error("Google did not return an access token");
    }

    // Refresh tokens are only returned on first consent (or re-consent). If
    // Google omits one, keep any previously stored refresh token.
    if (data.refresh_token) {
      await ctx.runMutation(internal.googleDriveAuth._storeRefreshToken, {
        userId,
        refreshToken: data.refresh_token,
      });
    } else {
      const existing = await ctx.runQuery(internal.googleDriveAuth._getRefreshToken, { userId });
      if (!existing) {
        throw new Error(
          "Google did not return a refresh token. Disconnect Drive in Settings, then connect again and accept the consent screen.",
        );
      }
    }

    return { accessToken: data.access_token, expiresIn: data.expires_in };
  },
});

/**
 * Mint a fresh access token from the stored refresh token. Returns null when
 * the user has never connected (or revoked) — callers then fall back to GIS.
 */
export const getAccessToken = action({
  args: {},
  handler: async (ctx): Promise<{ accessToken: string; expiresIn: number } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;

    const refreshToken = await ctx.runQuery(internal.googleDriveAuth._getRefreshToken, { userId });
    if (!refreshToken) return null;

    let clientId: string;
    let clientSecret: string;
    try {
      ({ clientId, clientSecret } = requireGoogleOAuthEnv());
    } catch {
      // Env not configured yet — treat as no connection rather than hard-fail Ask.
      return null;
    }

    try {
      const data = await postToken({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      });
      if (!data.access_token || !data.expires_in) return null;

      // Google occasionally rotates the refresh token on refresh.
      if (data.refresh_token) {
        await ctx.runMutation(internal.googleDriveAuth._storeRefreshToken, {
          userId,
          refreshToken: data.refresh_token,
        });
      }

      return { accessToken: data.access_token, expiresIn: data.expires_in };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Invalid/revoked refresh — drop it so the UI shows "not connected".
      if (/invalid_grant|revoked|expired/i.test(message)) {
        await ctx.runMutation(internal.googleDriveAuth._clearRefreshToken, { userId });
      }
      return null;
    }
  },
});
