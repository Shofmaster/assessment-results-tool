import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDesktopBackendVars,
  localAuthIssuerFor,
  localAuthJwksUrlFor,
} from '../scripts/lib/backendVars.mjs';

const require_ = createRequire(import.meta.url);
const { FirstRun } = require_('../desktop/firstRun.cjs');

describe('buildDesktopBackendVars', () => {
  it('pushes local auth variables derived from the app origin', () => {
    const vars = buildDesktopBackendVars({
      appOrigin: 'http://127.0.0.1:19080',
      serviceToken: 'svc-token',
      envFileRaw: 'AI_CREDENTIAL_SERVICE_TOKEN=svc-token\nAI_CREDENTIAL_ENCRYPTION_KEY=enc-key\n',
    });

    expect(vars.AUTH_MODE).toBe('local');
    expect(vars.DEPLOYMENT_MODE).toBe('desktop');
    expect(vars.LOCAL_AUTH_ISSUER).toBe(localAuthIssuerFor('http://127.0.0.1:19080'));
    expect(vars.LOCAL_AUTH_JWKS_URL).toBe(localAuthJwksUrlFor('http://127.0.0.1:19080'));
    expect(vars.CLERK_JWT_ISSUER_DOMAIN).toBe('unused');
    expect(vars.AI_CREDENTIAL_SERVICE_TOKEN).toBe('svc-token');
    expect(vars.AI_CREDENTIAL_ENCRYPTION_KEY).toBe('enc-key');
  });
});

describe('FirstRun marker', () => {
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(join(tmpdir(), 'aerogap-firstrun-'));
    mkdirSync(join(dataRoot, 'config'), { recursive: true });
    writeFileSync(join(dataRoot, 'config', 'instance-secret'), 'a'.repeat(64), 'utf8');
    writeFileSync(
      join(dataRoot, 'config', '.env'),
      'AI_CREDENTIAL_SERVICE_TOKEN=test-token\nAI_CREDENTIAL_ENCRYPTION_KEY=enc-key\n',
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it('requires matching ports and app origin in the deployed marker', () => {
    const ports = { convex: 14210, convexSite: 14211, app: 19080 };
    const firstRun = new FirstRun({
      installDir: join(tmpdir(), 'missing-install'),
      dataRoot,
      ports,
      instanceName: 'aerogap_desktop',
    });

    writeFileSync(
      join(dataRoot, 'config', 'deployed.json'),
      JSON.stringify({
        version: firstRun.appVersion(),
        instanceName: 'aerogap_desktop',
        appOrigin: 'http://127.0.0.1:19080',
        ports,
      }),
      'utf8',
    );

    expect(firstRun.alreadyDeployed()).toBe(true);

    firstRun.ports = { ...ports, app: 19081 };
    expect(firstRun.alreadyDeployed()).toBe(false);
  });
});
