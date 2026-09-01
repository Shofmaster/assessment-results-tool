import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The desktop supervisor replaces three Windows Services with two child
 * processes. That removes the installer's questions, but it also moves several
 * things that used to be install.ps1's job into code that runs on every launch
 * - so the things install.ps1 got wrong the hard way are exactly what these
 * tests pin.
 *
 * Loaded through createRequire because supervisor.cjs is CommonJS and runs
 * inside Electron's main process, which has no ESM loader.
 */
const require_ = createRequire(import.meta.url);
const { Supervisor, PREFERRED, INSTANCE_NAME } = require_('../desktop/supervisor.cjs');

let dataRoot: string;
let blockers: Server[] = [];

function makeSupervisor() {
  return new Supervisor({ installDir: join(tmpdir(), 'aerogap-install-does-not-exist'), dataRoot });
}

/** Occupy a port so findFreePort has to skip it. */
function occupy(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      blockers.push(server);
      resolve(server);
    });
  });
}

beforeEach(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'aerogap-sup-'));
});

afterEach(async () => {
  for (const server of blockers) await new Promise((r) => server.close(r));
  blockers = [];
  rmSync(dataRoot, { recursive: true, force: true });
});

describe('port allocation', () => {
  it('fails clearly when a preferred port is already in use', async () => {
    await occupy(PREFERRED.convex);
    await expect(makeSupervisor().allocatePorts()).rejects.toThrow(/Port 14210 is already in use/);
  });

  it('uses the pinned preferred ports when they are free', async () => {
    const { convex, convexSite, app } = await makeSupervisor().allocatePorts();
    expect(convex).toBe(PREFERRED.convex);
    expect(convexSite).toBe(PREFERRED.convexSite);
    expect(app).toBe(PREFERRED.app);
  });

  it('does not use the server-mode port family', async () => {
    // A machine may carry both a server install and this desktop build. The
    // server binds 13210/13211/18080 (loopback) and 443/3210/3211 (public), so
    // reusing any of them would make whichever started second fail to bind.
    const { convex, convexSite, app } = await makeSupervisor().allocatePorts();
    expect([convex, convexSite, app]).not.toContain(13210);
    expect([convex, convexSite, app]).not.toContain(13211);
    expect([convex, convexSite, app]).not.toContain(18080);
    expect([convex, convexSite, app]).not.toContain(3210);
    expect([convex, convexSite, app]).not.toContain(443);
  });

  it('gives convex and its site proxy distinct ports', async () => {
    const { convex, convexSite } = await makeSupervisor().allocatePorts();
    expect(convexSite).not.toBe(convex);
  });
});

describe('generated configuration', () => {
  it('creates config\\.env before the server could read it', () => {
    // envFile.ts THROWS when AEROGAP_ENV_FILE names a file that does not exist.
    // The app server is always given that path, so a fresh install with no file
    // is not a soft failure - the server dies at boot.
    const supervisor = makeSupervisor();
    supervisor.ensureLayout();
    const file = supervisor.ensureEnvFile();
    expect(readFileSync(file, 'utf8')).toMatch(/AI_CREDENTIAL_SERVICE_TOKEN=\S+/);
    expect(readFileSync(file, 'utf8')).toMatch(/AI_CREDENTIAL_ENCRYPTION_KEY=\S+/);
  });

  it('reuses an existing service token rather than regenerating it', () => {
    // The same token has to exist in the app environment AND in the Convex
    // deployment. Minting a new one on each launch would break every AI request
    // after the first restart, and the symptom would be a 503 that looks like a
    // bad API key.
    const supervisor = makeSupervisor();
    supervisor.ensureLayout();
    const first = readFileSync(supervisor.ensureEnvFile(), 'utf8');
    const second = readFileSync(supervisor.ensureEnvFile(), 'utf8');
    expect(second).toBe(first);
  });

  it('preserves values a user already put in the env file', () => {
    const supervisor = makeSupervisor();
    supervisor.ensureLayout();
    const file = join(dataRoot, 'config', '.env');
    writeFileSync(file, 'ANTHROPIC_API_KEY=sk-ant-existing\n', 'utf8');

    const after = readFileSync(supervisor.ensureEnvFile(), 'utf8');
    expect(after).toMatch(/ANTHROPIC_API_KEY=sk-ant-existing/);
    expect(after).toMatch(/AI_CREDENTIAL_SERVICE_TOKEN=\S+/);
  });

  it('never regenerates the instance secret', () => {
    // Regenerating this against an existing database makes the data unreadable.
    const supervisor = makeSupervisor();
    supervisor.ensureLayout();
    expect(supervisor.instanceSecret()).toBe(supervisor.instanceSecret());
    // A fresh Supervisor over the same data root must read, not rewrite.
    expect(makeSupervisor().instanceSecret()).toBe(supervisor.instanceSecret());
  });
});

describe('application environment', () => {
  it('points every Convex URL at the loopback port the backend actually binds', async () => {
    // This is the D1 defect, in the form it can recur. The installer once wrote
    // CONVEX_URL=127.0.0.1:3210 - a PUBLIC port served by Caddy over TLS and
    // bound to a hostname - so nothing answered plain http there and
    // verifyRequestAuth failed closed with 503 on every AI request, regardless
    // of the key. Here the URLs are derived from the allocated ports, and this
    // test is what keeps them derived.
    const supervisor = makeSupervisor();
    const { convex, convexSite } = await supervisor.allocatePorts();
    const env = supervisor.appEnv();

    expect(env.CONVEX_URL).toBe(`http://127.0.0.1:${convex}`);
    expect(env.CONVEX_PUBLIC_URL).toBe(`http://127.0.0.1:${convex}`);
    expect(env.CONVEX_SITE_URL).toBe(`http://127.0.0.1:${convexSite}`);
    expect(env.CONVEX_SITE_INTERNAL_URL).toBe(`http://127.0.0.1:${convexSite}`);
  });

  it('binds loopback only', async () => {
    // The Convex service once bound 0.0.0.0, putting the database backend on
    // every interface. On a laptop that means whatever network it is joined to.
    const supervisor = makeSupervisor();
    await supervisor.allocatePorts();
    expect(supervisor.appEnv().APP_BIND).toBe('127.0.0.1');
    expect(supervisor.appEnv().APP_ORIGIN).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });

  it('declares desktop mode, which is what relaxes the boot gate', async () => {
    const supervisor = makeSupervisor();
    await supervisor.allocatePorts();
    expect(supervisor.appEnv().DEPLOYMENT_MODE).toBe('desktop');
  });

  it('uses local authentication on loopback', async () => {
    const supervisor = makeSupervisor();
    const { app } = await supervisor.allocatePorts();
    const env = supervisor.appEnv();
    expect(env.AUTH_MODE).toBe('local');
    expect(env.LOCAL_AUTH_ISSUER).toBe(`http://127.0.0.1:${app}/local-auth`);
    expect(env.LOCAL_AUTH_JWKS_URL).toBe(
      `http://127.0.0.1:${app}/local-auth/.well-known/jwks.json`,
    );
  });

  it('uses an instance name distinct from server mode', () => {
    // Admin keys are derived from instance name + secret. Sharing a name with a
    // server install on the same machine would let one validate against the
    // other's database.
    expect(INSTANCE_NAME).toBe('aerogap_desktop');
    expect(INSTANCE_NAME).not.toBe('aerogap_onprem');
  });
});

describe('crash handling', () => {
  it('stops restarting a child that is failing repeatedly', () => {
    // Restarting forever would hide the reason behind an endlessly reopening
    // splash screen, which is how a misconfiguration becomes unreportable.
    const supervisor = makeSupervisor();
    const results: boolean[] = [];
    for (let i = 0; i < 7; i += 1) results.push(supervisor.withinRestartBudget('convex'));
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(results[5]).toBe(false);
  });

  it('counts each child separately', () => {
    const supervisor = makeSupervisor();
    for (let i = 0; i < 6; i += 1) supervisor.withinRestartBudget('convex');
    expect(supervisor.withinRestartBudget('app')).toBe(true);
  });
});

describe('install identity', () => {
  it('is stable across calls and across Supervisor instances', () => {
    // Everything in the connectivity layer keys off this: offering an update to
    // one site, enabling a feature for one customer, counting live trials. If
    // it changed per launch, every install would look like a new customer.
    const supervisor = makeSupervisor();
    const first = supervisor.installId();
    expect(supervisor.installId()).toBe(first);
    expect(makeSupervisor().installId()).toBe(first);
  });

  it('works before ensureLayout has run', () => {
    // appEnv() reaches it, and the ordering that makes ensureLayout come first
    // is convention rather than a guarantee. An ENOENT here would surface as a
    // failure to launch.
    expect(() => makeSupervisor().installId()).not.toThrow();
  });

  it('is a random identifier, not derived from the machine or the user', () => {
    // Deliberately says nothing about who or where. Its only meaning is "the
    // same install as last time", which is all it needs to mean.
    const id = makeSupervisor().installId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const machineFacts = [process.env.COMPUTERNAME, process.env.USERNAME, process.env.USERDOMAIN];
    for (const fact of machineFacts) {
      if (fact) expect(id.toLowerCase()).not.toContain(fact.toLowerCase());
    }
  });

  it('reaches the application server through the environment', () => {
    const supervisor = makeSupervisor();
    supervisor.ports = { convex: 1, convexSite: 2, app: 3 };
    expect(supervisor.appEnv().AEROGAP_INSTALL_ID).toBe(supervisor.installId());
  });
});
