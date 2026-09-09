/**
 * Pure policy for "whose AI API key pays for this request?"
 *
 * No Convex imports, so it is unit-testable directly, like convex/accessControl.ts.
 * The Convex layer supplies already-authorized inputs; this module only decides
 * precedence.
 */

export type AiProvider = "anthropic" | "openai" | "voyage";

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "openai", "voyage"];

/** Where a resolved key came from. Logged, and surfaced in the settings UI. */
export type CredentialSource = "company" | "install" | "env" | "none";

/**
 * The deployment-env variable each provider falls back to.
 *
 * Read in BOTH runtimes and they are separate environments: the Vercel/Express
 * process has its own env, the Convex deployment has another. A provider can be
 * configured in one and not the other, which is why the env rung is always
 * evaluated by the calling runtime rather than centrally.
 */
export const PROVIDER_ENV_VAR: Readonly<Record<AiProvider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  voyage: "VOYAGE_API_KEY",
};

export interface ScopeInputs {
  /**
   * companyId of the project the request is for.
   * MUST already be authorized: pass it only when the user has a live
   * membership in that company. An unauthorized hint must be dropped by the
   * caller before it reaches this function.
   */
  projectCompanyId?: string | null;
  /**
   * userSettings.activeCompanyId. Same rule: only when the membership is live.
   */
  activeCompanyId?: string | null;
  /** Every non-suspended membership companyId for this user. */
  memberCompanyIds: string[];
}

/** Why a company was chosen - useful in logs when spend lands unexpectedly. */
export type CompanyScopeReason = "project" | "active" | "sole" | "none";

export interface CompanyScopeResult {
  companyId: string | null;
  reason: CompanyScopeReason;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decide the ONE company whose credential should be used, or null to fall
 * through to the install-wide row and then the runtime's env.
 *
 * Precedence is most-specific-first and the winner is final - it is deliberately
 * NOT a chain that tries the next company when the winner has no key on file.
 * Consider a user in companies A and B, active company B, working in a project
 * owned by A. If A has no key, trying B next would bill B's Anthropic account
 * for A's work. Falling through to the install/env key instead is the only
 * answer that never charges the wrong tenant.
 *
 * For the same reason, a user in 2+ companies with no project hint and no
 * active company resolves to null rather than a guess.
 */
export function resolveCredentialCompany(inputs: ScopeInputs): CompanyScopeResult {
  const fromProject = clean(inputs.projectCompanyId);
  if (fromProject) return { companyId: fromProject, reason: "project" };

  const fromActive = clean(inputs.activeCompanyId);
  if (fromActive) return { companyId: fromActive, reason: "active" };

  const members = (inputs.memberCompanyIds ?? [])
    .map(clean)
    .filter((id): id is string => id !== null);
  const unique = [...new Set(members)];
  if (unique.length === 1) return { companyId: unique[0], reason: "sole" };

  return { companyId: null, reason: "none" };
}

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The only fragment of a key that may ever cross to a browser.
 * Short keys yield a shorter hint rather than throwing - validation of key
 * shape belongs on the write path, not here.
 */
export function keyLast4(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
