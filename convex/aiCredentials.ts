/**
 * Bring-your-own-key AI provider credentials, scoped per company.
 *
 * Anthropic API keys cannot be created programmatically ("The Admin API can
 * only read, rename, and change the status of existing keys") and belong to an
 * organization rather than a user, so there is no such thing as a per-user key.
 * What a customer CAN do is supply their own key once; every member of their
 * company then inherits it and the customer bills their own account.
 *
 * SECURITY MODEL - the stored key never reaches a browser.
 *   - Reads go through _resolveCredential (internalQuery) or the service-token
 *     HTTP route in http.ts. Both are unreachable from a client.
 *   - The only public read is `status`, which returns a state enum plus the
 *     last four characters. Never the key.
 *   - This is the googleDriveTokens shape, and deliberately NOT the Avianis
 *     one: Avianis credentials live in userSettings, are written by a public
 *     mutation and are read straight back to the browser in plaintext.
 *
 * RESOLUTION ORDER
 *   company row -> install row -> the CALLING RUNTIME's env var -> failure.
 * The env rung is permanent, not a migration shim: it is what keeps existing
 * deployments working unchanged when no rows exist. It is also why the final
 * fallback lives in the runtime adapters rather than here - the Convex
 * deployment and the Vercel/Express process have separate environments.
 */
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";
import {
  PROVIDER_ENV_VAR,
  keyLast4,
  resolveCredentialCompany,
  type AiProvider,
  type CredentialSource,
} from "./lib/aiCredentialScope";
import { openSecret, sealSecret, type CredentialEncryption } from "./lib/aiCredentialCrypto";
import { EMBEDDING_DIMENSIONS } from "./lib/embeddingConfig";
import {
  checkIsAerogapPrivileged,
  requireAuth,
  requireCompanyRole,
  requirePlatformStaff,
} from "./_helpers";

const providerValidator = v.union(
  v.literal("anthropic"),
  v.literal("openai"),
  v.literal("voyage"),
);

const scopeValidator = v.union(v.literal("company"), v.literal("install"));

/** Thrown when nothing is configured at any scope. Prefix is matched by callers. */
export const AI_CREDENTIAL_MISSING = "AI_CREDENTIAL_MISSING";

export interface ResolvedCredential {
  apiKey: string;
  encryption: CredentialEncryption;
  source: Extract<CredentialSource, "company" | "install">;
  companyId?: Id<"companies">;
}

// ---------------------------------------------------------------------------
// Internal storage helpers
// ---------------------------------------------------------------------------

async function findCompanyRow(ctx: QueryCtx, provider: AiProvider, companyId: Id<"companies">) {
  return await ctx.db
    .query("aiCredentials")
    .withIndex("by_scope_provider_company", (q) =>
      q.eq("scope", "company").eq("provider", provider).eq("companyId", companyId),
    )
    .unique();
}

async function findInstallRow(ctx: QueryCtx, provider: AiProvider) {
  // Two-term prefix: never expresses eq("companyId", undefined).
  return await ctx.db
    .query("aiCredentials")
    .withIndex("by_scope_provider_company", (q) =>
      q.eq("scope", "install").eq("provider", provider),
    )
    .unique();
}

/** Companies this user is a live (non-suspended) member of. */
async function liveMembershipCompanyIds(
  ctx: QueryCtx,
  userId: string,
): Promise<Id<"companies">[]> {
  const memberships = await ctx.db
    .query("companyMemberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return memberships.filter((m) => m.status !== "suspended").map((m) => m.companyId);
}

async function hasLiveMembership(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  userId: string,
): Promise<boolean> {
  const membership = await ctx.db
    .query("companyMemberships")
    .withIndex("by_companyId_userId", (q) =>
      q.eq("companyId", companyId).eq("userId", userId),
    )
    .first();
  return !!membership && membership.status !== "suspended";
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Decide which stored credential applies, and return it SEALED.
 *
 * Deliberately performs no crypto: Convex queries must stay deterministic and
 * have no crypto.subtle, so decryption happens in the calling action via
 * openSecret(). It also never reads process.env - see the module header.
 *
 * `projectId` and the user's active company are UNTRUSTED hints. Both are
 * re-authorized here against companyMemberships. An unauthorized hint is
 * DROPPED SILENTLY rather than throwing: a stale activeProjectId in a long-open
 * browser tab must degrade to the install default, not 500 the request.
 *
 * `companyId` is trusted, and is only passed by Convex-internal callers that
 * have already done their own authorization.
 */
export const _resolveCredential = internalQuery({
  args: {
    provider: providerValidator,
    userId: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<ResolvedCredential | null> => {
    let candidate: Id<"companies"> | null = args.companyId ?? null;

    if (!candidate && args.userId) {
      const userId = args.userId;

      let projectCompanyId: Id<"companies"> | null = null;
      if (args.projectId) {
        const project = await ctx.db.get(args.projectId);
        const owner = project?.companyId;
        if (owner && (await hasLiveMembership(ctx, owner, userId))) {
          projectCompanyId = owner;
        }
      }

      const settings = await ctx.db
        .query("userSettings")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      let activeCompanyId: Id<"companies"> | null = null;
      const active = settings?.activeCompanyId;
      if (active && (await hasLiveMembership(ctx, active, userId))) {
        activeCompanyId = active;
      }

      const memberCompanyIds = await liveMembershipCompanyIds(ctx, userId);

      const chosen = resolveCredentialCompany({
        projectCompanyId,
        activeCompanyId,
        memberCompanyIds,
      });
      candidate = (chosen.companyId as Id<"companies"> | null) ?? null;
    }

    if (candidate) {
      const row = await findCompanyRow(ctx, args.provider, candidate);
      if (row) {
        return {
          apiKey: row.apiKey,
          encryption: row.encryption,
          source: "company",
          companyId: candidate,
        };
      }
      // Company has no key on file: fall through to the install default rather
      // than to some other company the user happens to belong to.
    }

    const installRow = await findInstallRow(ctx, args.provider);
    if (installRow) {
      return {
        apiKey: installRow.apiKey,
        encryption: installRow.encryption,
        source: "install",
      };
    }

    return null;
  },
});

/**
 * Resolve a usable key from inside a Convex action.
 *
 * Applies the CONVEX deployment's env as the last rung - which is why this is
 * not shared with the api/ runtime, whose env is a different environment.
 */
export async function resolveAiKeyInAction(
  ctx: ActionCtx,
  provider: AiProvider,
  scope: { userId?: string; projectId?: Id<"projects">; companyId?: Id<"companies"> } = {},
): Promise<{ apiKey: string; source: CredentialSource; companyId?: Id<"companies"> }> {
  const sealed = await ctx.runQuery(internal.aiCredentials._resolveCredential, {
    provider,
    userId: scope.userId,
    projectId: scope.projectId,
    companyId: scope.companyId,
  });

  if (sealed) {
    return {
      apiKey: await openSecret(sealed),
      source: sealed.source,
      companyId: sealed.companyId,
    };
  }

  const fromEnv = (process.env[PROVIDER_ENV_VAR[provider]] || "").trim();
  if (fromEnv) return { apiKey: fromEnv, source: "env" };

  throw new Error(
    AI_CREDENTIAL_MISSING +
      ": no " +
      provider +
      " key is configured for this company. " +
      "A company admin can add one in Settings -> AI Keys.",
  );
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/**
 * Editing a company's key is spending authority over that tenant's provider
 * account, so it is company_admin only - deliberately NOT company_manager, who
 * may create projects. requireCompanyRole also early-returns for platform
 * staff, which is intended: support fixing a customer's key.
 */
export const _assertCanEditCompany = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<string> => {
    return await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
  },
});

export const _assertCanEditInstall = internalQuery({
  args: {},
  handler: async (ctx): Promise<string> => {
    return await requirePlatformStaff(ctx);
  },
});

export const _upsertCredential = internalMutation({
  args: {
    scope: scopeValidator,
    provider: providerValidator,
    companyId: v.optional(v.id("companies")),
    apiKey: v.string(),
    encryption: v.union(v.literal("none"), v.literal("aes-256-gcm-v1")),
    keyLast4: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"aiCredentials">> => {
    if (args.scope === "company" && !args.companyId) {
      throw new Error("companyId is required for a company-scoped credential");
    }
    const existing =
      args.scope === "company"
        ? await findCompanyRow(ctx, args.provider, args.companyId as Id<"companies">)
        : await findInstallRow(ctx, args.provider);

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        apiKey: args.apiKey,
        encryption: args.encryption,
        keyLast4: args.keyLast4,
        updatedAt: now,
        updatedBy: args.updatedBy,
        // A replaced key has not been verified yet.
        lastVerifiedAt: undefined,
        lastVerifyOk: undefined,
        lastVerifyMessage: undefined,
      });
      return existing._id;
    }

    return await ctx.db.insert("aiCredentials", {
      scope: args.scope,
      provider: args.provider,
      companyId: args.scope === "company" ? args.companyId : undefined,
      apiKey: args.apiKey,
      encryption: args.encryption,
      keyLast4: args.keyLast4,
      updatedAt: now,
      updatedBy: args.updatedBy,
    });
  },
});

/**
 * Internal counterpart to _upsertCredential. The public remove* mutations carry
 * the authorization checks; this one exists for server-side callers that have
 * already authorized (admin scripts, the future encryption backfill, and
 * cleaning up after a `npx convex run` probe).
 */
export const _removeCredential = internalMutation({
  args: {
    scope: scopeValidator,
    provider: providerValidator,
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const row =
      args.scope === "company" && args.companyId
        ? await findCompanyRow(ctx, args.provider, args.companyId)
        : await findInstallRow(ctx, args.provider);
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const _recordVerification = internalMutation({
  args: {
    scope: scopeValidator,
    provider: providerValidator,
    companyId: v.optional(v.id("companies")),
    ok: v.boolean(),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const row =
      args.scope === "company" && args.companyId
        ? await findCompanyRow(ctx, args.provider, args.companyId)
        : await findInstallRow(ctx, args.provider);
    if (!row) return;
    await ctx.db.patch(row._id, {
      lastVerifiedAt: Date.now(),
      lastVerifyOk: args.ok,
      lastVerifyMessage: args.message,
    });
  },
});

/**
 * Reject obvious mistakes without being brittle about vendor prefixes, which
 * change. Length is the only hard rule; shape is advisory.
 */
function normalizeApiKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new Error("The key is empty.");
  if (trimmed.length < 20) {
    throw new Error("That does not look like an API key - it is too short.");
  }
  if (/\s/.test(trimmed)) {
    throw new Error("The key contains whitespace. Copy it again without line breaks.");
  }
  return trimmed;
}

/**
 * An action rather than a mutation so encryption can be added later without
 * changing this signature: sealSecret() will need crypto.subtle, which exists
 * in the action runtime but not in mutations.
 */
export const setCompanyCredential = action({
  args: { companyId: v.id("companies"), provider: providerValidator, apiKey: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; last4: string }> => {
    const updatedBy: string = await ctx.runQuery(
      internal.aiCredentials._assertCanEditCompany,
      { companyId: args.companyId },
    );
    const apiKey = normalizeApiKey(args.apiKey);
    const sealed = await sealSecret(apiKey);
    await ctx.runMutation(internal.aiCredentials._upsertCredential, {
      scope: "company",
      provider: args.provider,
      companyId: args.companyId,
      apiKey: sealed.apiKey,
      encryption: sealed.encryption,
      keyLast4: keyLast4(apiKey),
      updatedBy,
    });
    return { ok: true, last4: keyLast4(apiKey) };
  },
});

export const setInstallCredential = action({
  args: { provider: providerValidator, apiKey: v.string() },
  handler: async (ctx, args): Promise<{ ok: true; last4: string }> => {
    const updatedBy: string = await ctx.runQuery(
      internal.aiCredentials._assertCanEditInstall,
      {},
    );
    const apiKey = normalizeApiKey(args.apiKey);
    const sealed = await sealSecret(apiKey);
    await ctx.runMutation(internal.aiCredentials._upsertCredential, {
      scope: "install",
      provider: args.provider,
      apiKey: sealed.apiKey,
      encryption: sealed.encryption,
      keyLast4: keyLast4(apiKey),
      updatedBy,
    });
    return { ok: true, last4: keyLast4(apiKey) };
  },
});

export const removeCompanyCredential = mutation({
  args: { companyId: v.id("companies"), provider: providerValidator },
  handler: async (ctx, args): Promise<void> => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const row = await findCompanyRow(ctx, args.provider, args.companyId);
    if (row) await ctx.db.delete(row._id);
  },
});

export const removeInstallCredential = mutation({
  args: { provider: providerValidator },
  handler: async (ctx, args): Promise<void> => {
    await requirePlatformStaff(ctx);
    const row = await findInstallRow(ctx, args.provider);
    if (row) await ctx.db.delete(row._id);
  },
});

// ---------------------------------------------------------------------------
// Status (the only public read - never returns a key)
// ---------------------------------------------------------------------------

export type ProviderState = "company" | "install" | "none";

export interface ProviderStatus {
  state: ProviderState;
  last4?: string;
  updatedAt?: number;
  updatedByEmail?: string;
  lastVerifiedAt?: number;
  lastVerifyOk?: boolean;
  lastVerifyMessage?: string;
  /**
   * Whether the CONVEX deployment env has a key for this provider.
   *
   * Known imprecision: the api/ runtime has its own environment, and in cloud
   * the two are configured separately, so this can report a fallback that
   * /api/claude does not actually have. Word UI copy as "the deployment's
   * built-in key" rather than promising it works.
   */
  deploymentFallbackConfigured: boolean;
}

async function emailFor(
  ctx: QueryCtx,
  clerkUserId: string | undefined,
): Promise<string | undefined> {
  if (!clerkUserId) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
  return user?.email;
}

export const status = query({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const isPlatformStaff = await checkIsAerogapPrivileged(ctx, userId);

    // Only report on a company the caller can actually see.
    let companyId: Id<"companies"> | undefined;
    if (args.companyId) {
      const allowed =
        isPlatformStaff || (await hasLiveMembership(ctx, args.companyId, userId));
      if (allowed) companyId = args.companyId;
    }

    let canEdit = false;
    if (companyId) {
      if (isPlatformStaff) {
        canEdit = true;
      } else {
        const membership = await ctx.db
          .query("companyMemberships")
          .withIndex("by_companyId_userId", (q) =>
            q.eq("companyId", companyId as Id<"companies">).eq("userId", userId),
          )
          .first();
        canEdit = membership?.role === "company_admin" && membership?.status !== "suspended";
      }
    }

    const providers = {} as Record<AiProvider, ProviderStatus>;
    for (const provider of ["anthropic", "openai", "voyage"] as const) {
      const companyRow = companyId ? await findCompanyRow(ctx, provider, companyId) : null;
      const installRow = await findInstallRow(ctx, provider);
      const row = companyRow ?? installRow;
      const state: ProviderState = companyRow ? "company" : installRow ? "install" : "none";
      providers[provider] = {
        state,
        last4: row?.keyLast4,
        updatedAt: row?.updatedAt,
        updatedByEmail: await emailFor(ctx, row?.updatedBy),
        lastVerifiedAt: row?.lastVerifiedAt,
        lastVerifyOk: row?.lastVerifyOk,
        lastVerifyMessage: row?.lastVerifyMessage,
        deploymentFallbackConfigured:
          (process.env[PROVIDER_ENV_VAR[provider]] || "").trim().length > 0,
      };
    }

    const company = companyId ? await ctx.db.get(companyId) : null;

    return {
      /**
       * Deployment-wide, not per company: EMBEDDING_DIMENSIONS is baked into
       * the vector index, so mixing providers would put different embedding
       * spaces in one index. Only the KEY is per-company.
       */
      embeddingProvider:
        (process.env.EMBEDDING_PROVIDER || "voyage").toLowerCase() === "openai"
          ? ("openai" as const)
          : ("voyage" as const),
      scope: companyId
        ? { kind: "company" as const, companyId, companyName: company?.name }
        : { kind: "none" as const },
      canEdit,
      canEditInstall: isPlatformStaff,
      providers,
    };
  },
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Display names for user-facing text. The raw provider ids are lowercase
 * identifiers ("anthropic"), which read as a bug when they reach a customer -
 * and they DO reach one: the Anthropic SDK throws on 401 rather than returning
 * a response, so that path always runs through the catch below.
 */
const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  voyage: "Voyage",
};

/**
 * Map a provider failure to something a customer can act on.
 * The provider's raw body is never surfaced - it can echo a key fragment.
 */
function describeProbeFailure(providerLabel: string, status: number | null): string {
  if (status === 401 || status === 403) {
    return `The key was rejected by ${providerLabel}. Check for a typo, or a key that has been revoked.`;
  }
  if (status === 429) {
    return `${providerLabel} rate-limited the check. The key looks valid; try again shortly.`;
  }
  if (status === null) {
    return `Could not reach ${providerLabel}. Check this server's outbound network access.`;
  }
  return `${providerLabel} returned an unexpected error (HTTP ${status}).`;
}

async function probeProvider(
  provider: AiProvider,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === "anthropic") {
      // models.list spends no tokens.
      await new Anthropic({ apiKey }).models.list({ limit: 1 });
      return { ok: true, message: "Key accepted by Anthropic." };
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok
        ? { ok: true, message: "Key accepted by OpenAI." }
        : { ok: false, message: describeProbeFailure(PROVIDER_LABEL.openai, res.status) };
    }

    // Voyage has no free auth probe; a one-token embed is the cheapest check.
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: ["ping"],
        model: process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3.5-lite",
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });
    return res.ok
      ? { ok: true, message: "Key accepted by Voyage." }
      : { ok: false, message: describeProbeFailure(PROVIDER_LABEL.voyage, res.status) };
  } catch (err: unknown) {
    const raw = (err as { status?: unknown })?.status;
    const status = typeof raw === "number" ? raw : null;
    // Deliberately not logging `err`: provider SDK errors can carry the key.
    return { ok: false, message: describeProbeFailure(PROVIDER_LABEL[provider], status) };
  }
}

/**
 * Test the SAVED credential, so the UI flow is save-then-test and what is
 * verified is exactly what requests will use.
 */
export const testCredential = action({
  args: { companyId: v.optional(v.id("companies")), provider: providerValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; message: string; source: CredentialSource }> => {
    if (args.companyId) {
      await ctx.runQuery(internal.aiCredentials._assertCanEditCompany, {
        companyId: args.companyId,
      });
    } else {
      await ctx.runQuery(internal.aiCredentials._assertCanEditInstall, {});
    }

    const sealed = await ctx.runQuery(internal.aiCredentials._resolveCredential, {
      provider: args.provider,
      companyId: args.companyId,
    });

    if (!sealed) {
      const envKey = (process.env[PROVIDER_ENV_VAR[args.provider]] || "").trim();
      return envKey
        ? {
            ok: true,
            message: "No key is stored; this deployment's built-in key would be used.",
            source: "env",
          }
        : { ok: false, message: "No key is configured at any scope.", source: "none" };
    }

    const result = await probeProvider(args.provider, await openSecret(sealed));
    await ctx.runMutation(internal.aiCredentials._recordVerification, {
      scope: sealed.source,
      provider: args.provider,
      companyId: sealed.companyId,
      ok: result.ok,
      message: result.message,
    });
    return { ...result, source: sealed.source };
  },
});
