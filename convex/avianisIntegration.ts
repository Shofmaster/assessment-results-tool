import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAuth, requireProjectAccess } from "./_helpers";

// ---------------------------------------------------------------------------
// Avianis endpoint paths.
//
// Confirmed against api.avianis.io swagger (v1/v2 "/connect" routes) and the
// Avianis "Getting Started with API" KB article. There is no username/password
// login endpoint — username+password auth is OAuth2 client_credentials with
// the username as client_id and password as client_secret.
// ---------------------------------------------------------------------------
const AVIANIS_PATHS = {
  oauthToken: "/oauth/token",
  testPing: "/connect/v2/Aircraft?$top=1",
  listAircraft: "/connect/v2/Aircraft",
  // TODO confirm the actual discrepancy/squawk endpoint with Avianis support.
  // Until confirmed, the per-aircraft fetch in syncAll will 404 and be skipped
  // by the existing `if (!drRes.ok) continue;` check, so aircraft sync still
  // succeeds.
  listDiscrepanciesForAircraft: (aircraftId: string) =>
    `/connect/v2/Aircraft/${encodeURIComponent(aircraftId)}/discrepancies`,
} as const;

type AvianisSettings = Doc<"userSettings">;

type AvianisFetchInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

interface AvianisAircraftPayload {
  id: string;
  tailNumber?: string;
  registration?: string;
  make?: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  serialNumber?: string;
  operator?: string;
  year?: number;
  currentTotalTime?: number;
  totalTime?: number;
  hobbs?: number;
  currentTotalCycles?: number;
  totalCycles?: number;
  currentTotalLandings?: number;
  totalLandings?: number;
  asOfDate?: string;
  lastUpdated?: string;
}

interface AvianisDiscrepancyPayload {
  id: string;
  status?: string;
  category?: string;
  type?: string;
  ataChapter?: string;
  ataCode?: string;
  melItem?: string;
  description?: string;
  squawk?: string;
  text?: string;
  location?: string;
  partNumbers?: string[];
  parts?: Array<{ partNumber?: string } | string>;
  discoveredAt?: string;
  reportedAt?: string;
  reportedOn?: string;
  discoveredAtTotalTime?: number;
  totalTimeWhenReported?: number;
  deferralCategory?: string;
  deferralExpiresAt?: string;
}

// ---------------------------------------------------------------------------
// Settings helpers (internal).
// ---------------------------------------------------------------------------

export const _getSettingsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const _setSyncMetadata = internalMutation({
  args: {
    userId: v.string(),
    syncedAt: v.optional(v.number()),
    errorMessage: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!settings) return;
    const patch: Record<string, unknown> = {};
    if (args.syncedAt !== undefined) patch.avianisLastSyncedAt = args.syncedAt;
    if (args.errorMessage !== undefined) {
      patch.avianisLastSyncError = args.errorMessage === null ? undefined : args.errorMessage;
    }
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(settings._id, patch);
  },
});

export const _setCachedToken = internalMutation({
  args: {
    userId: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!settings) return;
    await ctx.db.patch(settings._id, {
      avianisCachedToken: args.token,
      avianisCachedTokenExpiresAt: args.expiresAt,
    });
  },
});

// ---------------------------------------------------------------------------
// Upsert mutations (internal) used by sync actions.
// ---------------------------------------------------------------------------

export const _upsertAircraft = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    avianisAircraftId: v.string(),
    tailNumber: v.string(),
    make: v.optional(v.string()),
    model: v.optional(v.string()),
    serial: v.optional(v.string()),
    operator: v.optional(v.string()),
    year: v.optional(v.number()),
    currentTotalTime: v.optional(v.number()),
    currentTotalCycles: v.optional(v.number()),
    currentTotalLandings: v.optional(v.number()),
    currentAsOfDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    let existing = await ctx.db
      .query("aircraftAssets")
      .withIndex("by_avianisAircraftId", (q) => q.eq("avianisAircraftId", args.avianisAircraftId))
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .first();

    if (!existing) {
      const matches = await ctx.db
        .query("aircraftAssets")
        .withIndex("by_tailNumber", (q) => q.eq("tailNumber", args.tailNumber))
        .collect();
      existing = matches.find((row) => row.projectId === args.projectId) ?? null;
    }

    const patch: Record<string, unknown> = {
      avianisAircraftId: args.avianisAircraftId,
      tailNumber: args.tailNumber,
      currentTotalTime: args.currentTotalTime,
      currentTotalCycles: args.currentTotalCycles,
      currentTotalLandings: args.currentTotalLandings,
      currentAsOfDate: args.currentAsOfDate,
      lastSyncedAt: now,
      updatedAt: nowIso,
    };
    if (args.make !== undefined) patch.make = args.make;
    if (args.model !== undefined) patch.model = args.model;
    if (args.serial !== undefined) patch.serial = args.serial;
    if (args.operator !== undefined) patch.operator = args.operator;
    if (args.year !== undefined) patch.year = args.year;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("aircraftAssets", {
      projectId: args.projectId,
      userId: args.userId,
      tailNumber: args.tailNumber,
      make: args.make,
      model: args.model,
      serial: args.serial,
      operator: args.operator,
      year: args.year,
      status: "active",
      avianisAircraftId: args.avianisAircraftId,
      currentTotalTime: args.currentTotalTime,
      currentTotalCycles: args.currentTotalCycles,
      currentTotalLandings: args.currentTotalLandings,
      currentAsOfDate: args.currentAsOfDate,
      lastSyncedAt: now,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  },
});

export const _upsertDiscrepancy = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.string(),
    aircraftId: v.id("aircraftAssets"),
    avianisExternalId: v.string(),
    status: v.string(),
    category: v.optional(v.string()),
    ataChapter: v.optional(v.string()),
    melItem: v.optional(v.string()),
    description: v.string(),
    location: v.optional(v.string()),
    partNumbers: v.optional(v.array(v.string())),
    discoveredAt: v.optional(v.string()),
    discoveredAtTotalTime: v.optional(v.number()),
    deferralCategory: v.optional(v.string()),
    deferralExpiresAt: v.optional(v.string()),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const nowIso = new Date().toISOString();
    const existing = await ctx.db
      .query("aircraftDiscrepancies")
      .withIndex("by_avianisExternalId", (q) => q.eq("avianisExternalId", args.avianisExternalId))
      .filter((q) => q.eq(q.field("projectId"), args.projectId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        aircraftId: args.aircraftId,
        status: args.status,
        category: args.category,
        ataChapter: args.ataChapter,
        melItem: args.melItem,
        description: args.description,
        location: args.location,
        partNumbers: args.partNumbers,
        discoveredAt: args.discoveredAt,
        discoveredAtTotalTime: args.discoveredAtTotalTime,
        deferralCategory: args.deferralCategory,
        deferralExpiresAt: args.deferralExpiresAt,
        raw: args.raw,
        updatedAt: nowIso,
      });
      return existing._id;
    }

    return await ctx.db.insert("aircraftDiscrepancies", {
      projectId: args.projectId,
      userId: args.userId,
      aircraftId: args.aircraftId,
      avianisExternalId: args.avianisExternalId,
      source: "avianis",
      status: args.status,
      category: args.category,
      ataChapter: args.ataChapter,
      melItem: args.melItem,
      description: args.description,
      location: args.location,
      partNumbers: args.partNumbers,
      discoveredAt: args.discoveredAt,
      discoveredAtTotalTime: args.discoveredAtTotalTime,
      deferralCategory: args.deferralCategory,
      deferralExpiresAt: args.deferralExpiresAt,
      raw: args.raw,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  },
});

export const _softCloseDiscrepanciesNotInList = internalMutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    keepExternalIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aircraftDiscrepancies")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect();
    const keep = new Set(args.keepExternalIds);
    const nowIso = new Date().toISOString();
    for (const row of rows) {
      if (row.source !== "avianis") continue;
      if (!row.avianisExternalId) continue;
      if (keep.has(row.avianisExternalId)) continue;
      if (row.status === "closed" || row.status === "resolved") continue;
      await ctx.db.patch(row._id, { status: "closed", updatedAt: nowIso });
    }
  },
});

export const _listAircraftForProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Public queries (used by the UI).
// ---------------------------------------------------------------------------

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      configured: Boolean(settings?.avianisAuthMethod && settings?.avianisBaseUrl),
      authMethod: settings?.avianisAuthMethod ?? null,
      baseUrl: settings?.avianisBaseUrl ?? null,
      tenantId: settings?.avianisTenantId ?? null,
      lastSyncedAt: settings?.avianisLastSyncedAt ?? null,
      lastSyncError: settings?.avianisLastSyncError ?? null,
    };
  },
});

export const listAircraftForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await ctx.db
      .query("aircraftAssets")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listDiscrepanciesForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await ctx.db
      .query("aircraftDiscrepancies")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getDiscrepancy = query({
  args: { discrepancyId: v.id("aircraftDiscrepancies") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.discrepancyId);
    if (!row) return null;
    await requireProjectAccess(ctx, row.projectId);
    return row;
  },
});

export const createManualDiscrepancy = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    description: v.string(),
    ataChapter: v.optional(v.string()),
    melItem: v.optional(v.string()),
    partNumbers: v.optional(v.array(v.string())),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    const aircraft = await ctx.db.get(args.aircraftId);
    if (!aircraft || aircraft.projectId !== args.projectId) {
      throw new Error("Aircraft does not belong to this project");
    }
    const nowIso = new Date().toISOString();
    return await ctx.db.insert("aircraftDiscrepancies", {
      projectId: args.projectId,
      userId,
      aircraftId: args.aircraftId,
      source: "manual",
      status: "open",
      category: "squawk",
      ataChapter: args.ataChapter,
      melItem: args.melItem,
      description: args.description,
      location: args.location,
      partNumbers: args.partNumbers,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  },
});

// ---------------------------------------------------------------------------
// Avianis HTTP helpers.
// ---------------------------------------------------------------------------

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function exchangeOAuthClientCredentials(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  tenantId: string | undefined,
): Promise<{ token: string; expiresAtMs: number }> {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  if (tenantId) body.set("scope", tenantId);

  // Avianis docs specify `client_authentication: header` — pass credentials
  // via HTTP Basic Auth, not in the form body.
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(`${trimTrailingSlash(baseUrl)}${AVIANIS_PATHS.oauthToken}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Avianis OAuth token request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number; token?: string };
  const token = json.access_token ?? json.token;
  if (!token) throw new Error("Avianis OAuth response missing access_token");
  const expiresInSec = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return { token, expiresAtMs: Date.now() + Math.max(60, expiresInSec - 30) * 1000 };
}

async function resolveBearerToken(
  ctx: any,
  settings: AvianisSettings,
): Promise<string> {
  const method = settings.avianisAuthMethod;
  const baseUrl = settings.avianisBaseUrl;
  if (!method || !baseUrl) throw new Error("Avianis is not configured");

  if (method === "api_key") {
    if (!settings.avianisApiKey) throw new Error("Avianis API key missing");
    return settings.avianisApiKey;
  }

  const cached = settings.avianisCachedToken;
  const cachedExp = settings.avianisCachedTokenExpiresAt ?? 0;
  if (cached && cachedExp > Date.now()) return cached;

  if (method === "oauth2") {
    if (!settings.avianisClientId || !settings.avianisClientSecret) {
      throw new Error("Avianis OAuth client credentials missing");
    }
    const { token, expiresAtMs } = await exchangeOAuthClientCredentials(
      baseUrl,
      settings.avianisClientId,
      settings.avianisClientSecret,
      settings.avianisTenantId,
    );
    await ctx.runMutation(internal.avianisIntegration._setCachedToken, {
      userId: settings.userId,
      token,
      expiresAt: expiresAtMs,
    });
    return token;
  }

  if (method === "password") {
    if (!settings.avianisUsername || !settings.avianisPassword) {
      throw new Error("Avianis username/password missing");
    }
    // Avianis has no username/password login endpoint — the docs route normal
    // user credentials through the OAuth2 client_credentials flow, mapping
    // username -> client_id and password -> client_secret.
    const { token, expiresAtMs } = await exchangeOAuthClientCredentials(
      baseUrl,
      settings.avianisUsername,
      settings.avianisPassword,
      settings.avianisTenantId,
    );
    await ctx.runMutation(internal.avianisIntegration._setCachedToken, {
      userId: settings.userId,
      token,
      expiresAt: expiresAtMs,
    });
    return token;
  }

  throw new Error(`Unsupported Avianis auth method: ${method}`);
}

async function avianisFetch(
  ctx: any,
  settings: AvianisSettings,
  path: string,
  init: AvianisFetchInit = {},
): Promise<Response> {
  const baseUrl = settings.avianisBaseUrl;
  if (!baseUrl) throw new Error("Avianis baseUrl not set");
  const token = await resolveBearerToken(ctx, settings);

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {}),
  };
  if (settings.avianisTenantId && !headers["X-Tenant-Id"]) {
    headers["X-Tenant-Id"] = settings.avianisTenantId;
  }

  const res = await fetch(`${trimTrailingSlash(baseUrl)}${path}`, { ...init, headers });
  if (res.status === 401 && settings.avianisAuthMethod !== "api_key") {
    // Token may have expired between the cached check and the call — clear cache
    // and force a re-fetch for the next attempt.
    await ctx.runMutation(internal.avianisIntegration._setCachedToken, {
      userId: settings.userId,
      token: "",
      expiresAt: 0,
    });
  }
  return res;
}

function normalizeAircraftPayload(p: AvianisAircraftPayload) {
  return {
    avianisAircraftId: String(p.id),
    tailNumber: (p.tailNumber ?? p.registration ?? "").trim() || "UNKNOWN",
    make: p.make ?? p.manufacturer,
    model: p.model,
    serial: p.serial ?? p.serialNumber,
    operator: p.operator,
    year: p.year,
    currentTotalTime: p.currentTotalTime ?? p.totalTime ?? p.hobbs,
    currentTotalCycles: p.currentTotalCycles ?? p.totalCycles,
    currentTotalLandings: p.currentTotalLandings ?? p.totalLandings,
    currentAsOfDate: p.asOfDate ?? p.lastUpdated,
  };
}

function normalizeDiscrepancyPayload(p: AvianisDiscrepancyPayload) {
  const description = p.description ?? p.squawk ?? p.text ?? "(no description)";
  const partNumbers = Array.isArray(p.partNumbers)
    ? p.partNumbers
    : Array.isArray(p.parts)
    ? p.parts
        .map((entry) => (typeof entry === "string" ? entry : entry.partNumber ?? ""))
        .filter(Boolean)
    : undefined;
  const status = (p.status ?? "open").toLowerCase();
  const allowedStatus = ["open", "deferred", "resolved", "closed"].includes(status)
    ? status
    : "open";
  return {
    avianisExternalId: String(p.id),
    status: allowedStatus,
    category: p.category ?? p.type,
    ataChapter: p.ataChapter ?? p.ataCode,
    melItem: p.melItem,
    description,
    location: p.location,
    partNumbers,
    discoveredAt: p.discoveredAt ?? p.reportedAt ?? p.reportedOn,
    discoveredAtTotalTime: p.discoveredAtTotalTime ?? p.totalTimeWhenReported,
    deferralCategory: p.deferralCategory,
    deferralExpiresAt: p.deferralExpiresAt,
  };
}

function extractList<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object") {
    for (const key of ["data", "items", "results", "records"]) {
      const value = (json as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Actions (called from the UI and the cron).
// ---------------------------------------------------------------------------

export const testConnection = action({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; message: string }> => {
    const userId = await ctx.runQuery(api.avianisIntegration._currentUserId, {});
    const settings = (await ctx.runQuery(internal.avianisIntegration._getSettingsForUser, {
      userId,
    })) as AvianisSettings | null;
    if (!settings) return { ok: false, message: "No user settings found" };
    if (!settings.avianisAuthMethod || !settings.avianisBaseUrl) {
      return { ok: false, message: "Avianis is not configured" };
    }
    try {
      const res = await avianisFetch(ctx, settings, AVIANIS_PATHS.testPing);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, message: `Avianis ping failed (${res.status}): ${text.slice(0, 200)}` };
      }
      return { ok: true, message: "Connected to Avianis." };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  },
});

// Tiny query so actions can grab the calling user's id without re-implementing auth.
export const _currentUserId = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuth(ctx);
  },
});

export const syncAll = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args): Promise<{
    aircraftSynced: number;
    discrepanciesSynced: number;
    error: string | null;
  }> => {
    // requireProjectAccess will be enforced through the query below.
    await ctx.runQuery(api.avianisIntegration.listAircraftForProject, {
      projectId: args.projectId,
    });
    const userId = await ctx.runQuery(api.avianisIntegration._currentUserId, {});
    const settings = (await ctx.runQuery(internal.avianisIntegration._getSettingsForUser, {
      userId,
    })) as AvianisSettings | null;
    if (!settings?.avianisAuthMethod || !settings.avianisBaseUrl) {
      throw new Error("Avianis is not configured");
    }

    try {
      // 1. Aircraft list.
      const res = await avianisFetch(ctx, settings, AVIANIS_PATHS.listAircraft);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Avianis aircraft list failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const aircraftPayloads = extractList<AvianisAircraftPayload>(await res.json());
      const aircraftIds: Id<"aircraftAssets">[] = [];
      const avianisIdToAircraftId = new Map<string, Id<"aircraftAssets">>();
      for (const raw of aircraftPayloads) {
        if (!raw?.id) continue;
        const norm = normalizeAircraftPayload(raw);
        const id = (await ctx.runMutation(internal.avianisIntegration._upsertAircraft, {
          projectId: args.projectId,
          userId,
          ...norm,
        })) as Id<"aircraftAssets">;
        aircraftIds.push(id);
        avianisIdToAircraftId.set(norm.avianisAircraftId, id);
      }

      // 2. Discrepancies per aircraft.
      let discrepancyCount = 0;
      for (const [avianisId, aircraftId] of avianisIdToAircraftId.entries()) {
        try {
          const drRes = await avianisFetch(
            ctx,
            settings,
            AVIANIS_PATHS.listDiscrepanciesForAircraft(avianisId),
          );
          if (!drRes.ok) continue;
          const items = extractList<AvianisDiscrepancyPayload>(await drRes.json());
          const seenExternalIds: string[] = [];
          for (const raw of items) {
            if (!raw?.id) continue;
            const norm = normalizeDiscrepancyPayload(raw);
            seenExternalIds.push(norm.avianisExternalId);
            await ctx.runMutation(internal.avianisIntegration._upsertDiscrepancy, {
              projectId: args.projectId,
              userId,
              aircraftId,
              raw,
              ...norm,
            });
            discrepancyCount += 1;
          }
          await ctx.runMutation(internal.avianisIntegration._softCloseDiscrepanciesNotInList, {
            projectId: args.projectId,
            aircraftId,
            keepExternalIds: seenExternalIds,
          });
        } catch (err) {
          // Continue with other aircraft even if one fails.
          console.error("Avianis discrepancy fetch failed for", avianisId, err);
        }
      }

      await ctx.runMutation(internal.avianisIntegration._setSyncMetadata, {
        userId,
        syncedAt: Date.now(),
        errorMessage: null,
      });
      return {
        aircraftSynced: aircraftIds.length,
        discrepanciesSynced: discrepancyCount,
        error: null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.avianisIntegration._setSyncMetadata, {
        userId,
        syncedAt: Date.now(),
        errorMessage: msg,
      });
      throw err;
    }
  },
});

// Cron entry point: iterate over users with Avianis configured.
export const _scheduledSyncTick = internalAction({
  args: {},
  handler: async (ctx) => {
    const eligible = (await ctx.runQuery(
      internal.avianisIntegration._listUsersConfiguredForSync,
      {},
    )) as Array<{ userId: string; activeProjectId: Id<"projects"> | null }>;
    for (const row of eligible) {
      if (!row.activeProjectId) continue;
      try {
        await ctx.runAction(api.avianisIntegration.syncAll, {
          projectId: row.activeProjectId,
        });
      } catch (err) {
        console.error("Avianis scheduled sync failed for", row.userId, err);
      }
    }
  },
});

export const _listUsersConfiguredForSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("userSettings").collect();
    return all
      .filter((s) => Boolean(s.avianisAuthMethod && s.avianisBaseUrl))
      .map((s) => ({
        userId: s.userId,
        activeProjectId: s.activeProjectId ?? null,
      }));
  },
});
