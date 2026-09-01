import { describe, it, expect } from 'vitest';
import { buildClientConfig, renderConfigScript } from '../server/src/clientConfig.js';

/**
 * This module decides what gets published to every browser that loads the app.
 * A mistake here does not fail — it silently ships a secret to every user, which
 * is why the allowlist is exhaustive and these tests assert on exclusion as
 * hard as they assert on inclusion.
 */
describe('buildClientConfig', () => {
  it('publishes the public values', () => {
    const config = buildClientConfig({
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_abc',
      CONVEX_PUBLIC_URL: 'https://host:3210',
      CONVEX_SITE_URL: 'https://host:3211',
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      clerkPublishableKey: 'pk_live_abc',
      convexUrl: 'https://host:3210',
      convexSiteUrl: 'https://host:3211',
    });
  });

  it('omits values that are unset', () => {
    const config = buildClientConfig({ CONVEX_PUBLIC_URL: 'https://host:3210' } as NodeJS.ProcessEnv);
    expect(Object.keys(config)).toEqual(['convexUrl']);
  });

  it('omits values that are whitespace only', () => {
    const config = buildClientConfig({
      CONVEX_PUBLIC_URL: 'https://host:3210',
      VITE_SENTRY_DSN: '   ',
    } as NodeJS.ProcessEnv);
    expect(config).not.toHaveProperty('sentryDsn');
  });

  it('trims values', () => {
    const config = buildClientConfig({ CONVEX_PUBLIC_URL: '  https://host:3210  ' } as NodeJS.ProcessEnv);
    expect(config.convexUrl).toBe('https://host:3210');
  });

  it.each([
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'VOYAGE_API_KEY',
    'CLERK_SECRET_KEY',
    'CONVEX_INSTANCE_SECRET',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'AI_CREDENTIAL_SERVICE_TOKEN',
    'STRIPE_SECRET_KEY',
    'POSTGRES_PASSWORD',
    'SMTP_PASSWORD',
    'GOOGLE_CLIENT_SECRET',
    'OIDC_CLIENT_SECRET',
  ])('never publishes %s, even when it is set', (secretName) => {
    const config = buildClientConfig({
      [secretName]: 'super-secret-value',
      CONVEX_PUBLIC_URL: 'https://host:3210',
    } as NodeJS.ProcessEnv);

    const serialised = JSON.stringify(config);
    expect(serialised).not.toContain('super-secret-value');
    expect(serialised).not.toContain(secretName);
  });

  it('telemetry stays absent unless explicitly configured', () => {
    // Self-hosted installs must send nothing to third parties by default.
    const config = buildClientConfig({ CONVEX_PUBLIC_URL: 'https://host:3210' } as NodeJS.ProcessEnv);
    expect(config).not.toHaveProperty('sentryDsn');
    expect(config).not.toHaveProperty('posthogKey');
  });
});

describe('renderConfigScript', () => {
  it('assigns the global the SPA reads', () => {
    const js = renderConfigScript({ convexUrl: 'https://host:3210' });
    expect(js).toContain('window.__AVIATION_APP_CONFIG__ =');
    expect(js).toContain('https://host:3210');
  });

  it('escapes "<" so a value cannot break out of the script tag', () => {
    // Values come from an operator's config file - trusted, but not guaranteed
    // careful. A literal </script> in one would end the tag early and turn the
    // rest of the page into markup.
    const js = renderConfigScript({ convexUrl: '</script><img src=x onerror=alert(1)>' });
    expect(js).not.toContain('</script>');
    expect(js).toContain('\\u003c');
  });

  it('produces valid JavaScript for an empty config', () => {
    const js = renderConfigScript({});
    expect(js).toContain('window.__AVIATION_APP_CONFIG__ = {};');
  });

  it('output parses as JavaScript', () => {
    const js = renderConfigScript({ convexUrl: 'https://host:3210', clerkPublishableKey: 'pk_live_x' });
    // Function() rather than eval: compiles without executing in this scope.
    expect(() => new Function(`var window = {}; ${js}`)).not.toThrow();
  });
});
