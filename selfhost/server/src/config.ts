/**
 * Boot-time configuration contract for a self-hosted install.
 *
 * The hosted product can tolerate a missing env var: Vercel redeploys in
 * seconds and we watch the dashboards. An on-prem install has neither, so a
 * misconfiguration must surface as a refusal to start with an actionable
 * message — not as a 503 discovered by a customer three weeks later.
 *
 * The rules here mirror the fail-closed checks already in api/_lib/auth.ts.
 * Keeping them at boot as well means the operator learns at `docker compose up`
 * rather than on the first authenticated request.
 */

export interface SelfHostConfig {
  appOrigin: string;
  /**
   * `desktop` - this process was started by the Electron shell, owns nothing
   * beyond loopback, and takes its configuration from the supervisor.
   * `server`  - the historical Windows-Service / Docker deployment.
   */
  deploymentMode: 'desktop' | 'server';
  authMode: AuthMode;
  convexUrl: string;
  hasAnthropicKey: boolean;
  embeddingProvider: string;
  docServerUpstream: string | null;
  telemetryEnabled: boolean;
  billingEnforced: boolean;
  /**
   * Non-fatal posture notes for the startup banner. A missing AI key belongs
   * here rather than in `problems`: it is now a recoverable in-app state, not a
   * misconfiguration.
   */
  warnings: string[];
}

/**
 *   clerk  the hosted product, and any install reached at a real hostname
 *   local  this install issues its own identities (see localAuth.ts)
 *   both   local accounts PLUS sign-in with a hosted AeroGap account. Desktop
 *          only in practice: the Clerk instance lists the desktop's loopback
 *          origin in its allowed_origins, and the three public Clerk values
 *          come baked into the build.
 *   oidc   the customer's own IdP. Still a declared target, not a capability.
 */
export type AuthMode = 'clerk' | 'local' | 'both' | 'oidc';

/** Does this mode issue and verify the install's own tokens? */
export function acceptsLocalTokens(mode: string | undefined): boolean {
  const m = (mode || 'clerk').trim();
  return m === 'local' || m === 'both';
}

/** Does this mode verify Clerk-issued tokens? */
export function acceptsClerkTokens(mode: string | undefined): boolean {
  const m = (mode || 'clerk').trim();
  return m === 'clerk' || m === 'both';
}

class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function requireConfig(): SelfHostConfig {
  const problems: string[] = [];

  const rawMode = env('DEPLOYMENT_MODE') || 'server';
  if (rawMode !== 'desktop' && rawMode !== 'server') {
    problems.push(`DEPLOYMENT_MODE must be "desktop" or "server", got "${rawMode}"`);
  }
  const deploymentMode = (rawMode === 'desktop' ? 'desktop' : 'server') as 'desktop' | 'server';

  const appOrigin = env('APP_ORIGIN').replace(/\/+$/, '');
  if (!appOrigin) {
    problems.push('APP_ORIGIN is not set. Set it to the URL your users will open, e.g. https://aerogap.example.internal');
  } else if (!isHttpUrl(appOrigin)) {
    problems.push(`APP_ORIGIN is not a valid http(s) URL: "${appOrigin}"`);
  } else if (appOrigin.startsWith('http://') && deploymentMode !== 'desktop') {
    // Silent in desktop mode: there the origin is always http://127.0.0.1, which
    // browsers treat as a secure context by definition — the File System Access
    // API and secure cookies work without a certificate. Warning on every launch
    // about a deliberate, correct choice trains people to ignore the log.
    //
    // Not fatal in server mode either — some internal deployments terminate TLS
    // at a hardware load balancer and speak plain HTTP to this container. But
    // an operator who did this by accident needs to hear about it loudly.
    console.warn(
      '[aerogap] WARNING: APP_ORIGIN uses http://. Browsers treat this as an insecure context, ' +
        'which disables local-folder linking and weakens session cookies. Use https:// unless TLS ' +
        'is terminated upstream and users reach the app over https.',
    );
  }

  // Server-side Convex URL. api/_lib/auth.ts reads CONVEX_URL (falling back to
  // VITE_CONVEX_URL) for its approval check and refuses the request if absent,
  // so an install missing this authenticates nobody.
  const convexUrl = env('CONVEX_URL') || env('VITE_CONVEX_URL') || env('CONVEX_PUBLIC_URL');
  if (!convexUrl) {
    problems.push('CONVEX_URL is not set. It must point at the self-hosted Convex backend in this stack.');
  } else if (!isHttpUrl(convexUrl)) {
    problems.push(`CONVEX_URL is not a valid http(s) URL: "${convexUrl}"`);
  }
  // api/_lib/auth.ts reads CONVEX_URL specifically; normalize so an operator who
  // only set CONVEX_PUBLIC_URL still gets a working approval check.
  if (convexUrl && !env('CONVEX_URL')) process.env.CONVEX_URL = convexUrl;

  // FOUR modes, and three are implemented. See the AuthMode type.
  const rawAuthMode = env('AUTH_MODE') || 'clerk';
  const KNOWN_AUTH_MODES = ['clerk', 'local', 'both', 'oidc'];
  if (!KNOWN_AUTH_MODES.includes(rawAuthMode)) {
    problems.push(
      `AUTH_MODE must be one of ${KNOWN_AUTH_MODES.join(', ')}, got "${rawAuthMode}"`,
    );
  }
  // Defaults to clerk on an unrecognised value so an existing install cannot be
  // switched to a different identity system by a typo.
  let authMode = (
    rawAuthMode === 'local' || rawAuthMode === 'both' || rawAuthMode === 'oidc' ? rawAuthMode : 'clerk'
  ) as AuthMode;

  const warnings: string[] = [];

  // Desktop installs always have local accounts: an offline machine must still
  // be able to sign in, and identity staying on the machine is the baseline
  // promise. The hosted-account option is additive ('both'), never a
  // replacement - so 'clerk' alone and 'oidc' are corrected here.
  if (deploymentMode === 'desktop' && authMode !== 'local' && authMode !== 'both') {
    warnings.push(
      `AUTH_MODE=${rawAuthMode} is not supported in desktop mode; using local authentication instead.`,
    );
    authMode = 'local';
    process.env.AUTH_MODE = 'local';
  }

  // 'both' without the Clerk values is just 'local' with a misleading label.
  // Downgrade rather than refuse to start: the local accounts still work, and a
  // sign-in screen that offers a button that cannot work is the worse outcome.
  if (authMode === 'both') {
    const missing = [
      ['CLERK_JWT_ISSUER_DOMAIN', env('CLERK_JWT_ISSUER_DOMAIN')],
      ['VITE_CLERK_PUBLISHABLE_KEY', env('VITE_CLERK_PUBLISHABLE_KEY')],
      ['CLERK_JWT_KEY or CLERK_SECRET_KEY', env('CLERK_JWT_KEY') || env('CLERK_SECRET_KEY')],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      warnings.push(
        `AUTH_MODE=both but ${missing.join(', ')} not set; hosted-account sign-in is unavailable on this install (local accounts still work).`,
      );
      authMode = 'local';
      process.env.AUTH_MODE = 'local';
    }
  }

  if (authMode === 'both') {
    // Validated as the union of the two modes below, minus what is already
    // guaranteed present by the downgrade check above.
    if (!appOrigin) {
      problems.push(
        'APP_ORIGIN is required when AUTH_MODE=both: the local token issuer URL is derived from it.',
      );
    }
  } else if (authMode === 'clerk') {
    // Token verification is the one leg that must never be optional: without a
    // way to check a signature, api/_lib/auth.ts cannot authenticate anybody and
    // fails every request closed. EITHER credential satisfies it —
    // CLERK_JWT_KEY (the public PEM, verified networklessly) is preferred, and
    // is what a desktop build ships because it is not a secret.
    if (!env('CLERK_JWT_KEY') && !env('CLERK_SECRET_KEY')) {
      problems.push(
        'No Clerk token-verification credential. Set CLERK_JWT_KEY (the JWT verification public key, ' +
          'preferred — it is public and can be shipped) or CLERK_SECRET_KEY. Without one, every API ' +
          'request is rejected 503.',
      );
    }

    // The remaining two are compiled into the desktop build, so their absence
    // from the environment there is expected rather than a misconfiguration.
    // In server mode they are still per-site values that must be supplied.
    if (deploymentMode === 'desktop') {
      if (!env('CLERK_JWT_ISSUER_DOMAIN')) {
        warnings.push('CLERK_JWT_ISSUER_DOMAIN not in the environment — using the value compiled into this build.');
      }
      if (!env('VITE_CLERK_PUBLISHABLE_KEY')) {
        warnings.push('VITE_CLERK_PUBLISHABLE_KEY not in the environment — the frontend will use the value compiled into its bundle.');
      }
    } else {
      if (!env('CLERK_JWT_ISSUER_DOMAIN')) {
        problems.push('CLERK_JWT_ISSUER_DOMAIN is required when AUTH_MODE=clerk (the Convex backend needs it to trust your tokens).');
      }
      if (!env('VITE_CLERK_PUBLISHABLE_KEY')) {
        problems.push('VITE_CLERK_PUBLISHABLE_KEY is required when AUTH_MODE=clerk — the frontend cannot render a sign-in without it.');
      }
    }
  } else if (authMode === 'local') {
    // This install signs its own tokens, so it needs NO Clerk configuration at
    // all - that is the point. What it does need is a well-formed APP_ORIGIN,
    // because the issuer is derived from it and stamped into every token, and
    // the same value is pushed to Convex as the issuer to trust. If those two
    // disagree, every sign-in fails with nothing useful in the logs.
    //
    // APP_ORIGIN is already validated above; this only catches the case where
    // it is absent, which would silently produce the issuer "/local-auth".
    if (!appOrigin) {
      problems.push(
        'APP_ORIGIN is required when AUTH_MODE=local: the token issuer URL is derived from it, ' +
          'and Convex is told to trust exactly that value.',
      );
    }
    // The signing key is created on first boot rather than configured, so there
    // is deliberately nothing else to check here.
  } else {
    // AUTH_MODE=oidc is a declared target, not a shipped capability. Accepting
    // it would start an install that silently authenticates some other way -
    // worse than refusing, because the operator would believe their own IdP was
    // in the loop when it was not.
    problems.push(
      'AUTH_MODE=oidc is not implemented yet. Use AUTH_MODE=local for a self-hosted install ' +
        '(this deployment issues its own identities), or contact us before deploying if ' +
        'authenticating against your own IdP is a requirement.',
    );
  }

  // AI provider keys are NO LONGER a boot requirement. They are supplied per
  // company in the app (Settings > AI Keys) and stored in Convex, so a fresh
  // install legitimately has none — refusing to start would make the flow that
  // adds them unreachable. These env vars remain a permanent fallback for a
  // deployment that prefers one shared key, hence a warning rather than silence.
  const hasAnthropicKey = Boolean(env('ANTHROPIC_API_KEY'));
  if (!hasAnthropicKey) {
    warnings.push(
      'No built-in Anthropic key. Sign in as an administrator and add one under Settings > AI Keys before using analysis features.',
    );
  }

  const embeddingProvider = env('EMBEDDING_PROVIDER') || 'voyage';
  const embeddingKeyVar = embeddingProvider === 'openai' ? 'OPENAI_API_KEY' : 'VOYAGE_API_KEY';
  if (!env(embeddingKeyVar)) {
    warnings.push(
      `No built-in ${embeddingKeyVar}. Document search will not index until a key is added under Settings > AI Keys.`,
    );
  }

  // This one IS fatal, and replaces the checks above as the thing to be strict
  // about: without it NOTHING can resolve a key at any scope, and the failure
  // would otherwise appear as a confusing 503 on every AI request. install.ps1
  // generates it, so a normal install always has one.
  if (!env('AI_CREDENTIAL_SERVICE_TOKEN')) {
    problems.push(
      'AI_CREDENTIAL_SERVICE_TOKEN is not set. The app resolves each company\'s AI key from Convex over a ' +
        'service-token-gated route, and without this every AI request fails. Re-run install.ps1 to generate one, ' +
        'or add 32 random bytes (base64url) yourself and push the same value into Convex with bootstrap.mjs.',
    );
  }

  const docServerUpstream = env('DOC_SERVER_UPSTREAM') || null;
  if (docServerUpstream && !isHttpUrl(docServerUpstream)) {
    problems.push(`DOC_SERVER_UPSTREAM is not a valid http(s) URL: "${docServerUpstream}"`);
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }

  return {
    appOrigin,
    deploymentMode,
    authMode,
    convexUrl,
    hasAnthropicKey,
    embeddingProvider,
    docServerUpstream,
    telemetryEnabled: Boolean(env('VITE_SENTRY_DSN') || env('VITE_POSTHOG_KEY')),
    billingEnforced: env('BILLING_ENFORCEMENT_ENABLED') === 'true',
    warnings,
  };
}

/**
 * How each mode is described in the banner.
 *
 * An operator reads this line to confirm where their users' identities live,
 * which for an on-prem buyer is one of the reasons they bought the product.
 */
const AUTH_MODE_NOTE: Record<AuthMode, string> = {
  clerk: ' (identity is hosted by Clerk, not on this network)',
  local: ' (this install issues its own identities; nothing leaves this machine)',
  both: ' (local accounts on this machine; hosted AeroGap account optional, internet required for that path)',
  oidc: ' (your IdP)',
};

/**
 * Startup banner. Deliberately reports posture rather than values — an operator
 * needs to confirm "telemetry really is off" without secrets reaching the logs,
 * which on-prem are often shipped to a shared SIEM.
 */
export function describeConfig(config: SelfHostConfig): string[] {
  return [
    `mode             ${config.deploymentMode}${config.deploymentMode === 'desktop' ? ' (single user, loopback only)' : ' (shared, network-reachable)'}`,
    `origin           ${config.appOrigin}`,
    `auth             ${config.authMode}${AUTH_MODE_NOTE[config.authMode]}`,
    `convex           ${config.convexUrl}`,
    `embeddings       ${config.embeddingProvider}`,
    `doc server       ${config.docServerUpstream ? `proxied from ${config.docServerUpstream}` : 'not configured'}`,
    `telemetry        ${config.telemetryEnabled ? 'ENABLED (sending to third parties)' : 'off'}`,
    `billing          ${config.billingEnforced ? 'enforced' : 'off (site license)'}`,
    `ai keys          ${config.hasAnthropicKey ? 'built-in key present' : 'per-company (Settings > AI Keys)'}`,
    ...config.warnings.map((w) => `  ! ${w}`),
  ];
}
