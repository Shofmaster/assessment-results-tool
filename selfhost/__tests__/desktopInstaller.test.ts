import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The desktop installer is defined by what it does NOT do.
 *
 * Every property below is one the server installer has and this one deliberately
 * drops: elevation, services, firewall rules, and four pages of questions. Each
 * could be reintroduced by a plausible-looking edit - copying a block across
 * from the server .iss, or "fixing" the install by adding install.ps1 back to
 * [Run] - and the result would still compile and still install. It would just
 * quietly stop being a desktop product.
 */
const here = dirname(fileURLToPath(import.meta.url));
const windowsDir = join(here, '..', 'windows');

/**
 * Strip comments before asserting.
 *
 * These files explain at length what they deliberately do NOT do, so the prose
 * legitimately contains the very strings the tests below look for. Matching raw
 * text would make every explanatory comment a test failure - and the fix for
 * that would be to delete the explanation, which is exactly backwards.
 *
 * Inno has two comment forms: a leading ';' line, and Pascal braces in [Code].
 *
 * Braces are also Inno's CONSTANT syntax ({app}, {localappdata}), which the
 * assertions below depend on, so the two cannot simply be stripped together.
 * They are told apart by the whitespace: a Pascal comment opens '{ ', a
 * constant never does.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\{\s[\s\S]*?\}/g, ' ')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(';'))
    .join('\n');
}

const desktopIssRaw = readFileSync(join(windowsDir, 'aerogap-desktop.iss'), 'utf8');
const serverIssRaw = readFileSync(join(windowsDir, 'aerogap-server.iss'), 'utf8');
const desktopIss = codeOnly(desktopIssRaw);
const serverIss = codeOnly(serverIssRaw);
const buildStaging = readFileSync(join(windowsDir, 'build-staging.ps1'), 'utf8');

describe('the desktop install asks nothing and needs no elevation', () => {
  it('runs with the lowest privileges', () => {
    expect(desktopIss).toMatch(/PrivilegesRequired\s*=\s*lowest/);
    expect(desktopIss).not.toMatch(/PrivilegesRequired\s*=\s*admin/);
  });

  it('installs inside the user profile, not Program Files', () => {
    expect(desktopIss).toMatch(/DefaultDirName\s*=\s*\{localappdata\}/);
    expect(desktopIss).not.toMatch(/DefaultDirName\s*=\s*\{autopf\}/);
  });

  it('creates no wizard input pages', () => {
    // The server installer builds four. Any of these appearing here means a
    // question came back.
    for (const constructor of ['CreateInputQueryPage', 'CreateInputOptionPage']) {
      expect(desktopIss).not.toContain(constructor);
    }
  });

  it('disables the remaining pages that could stop the flow', () => {
    expect(desktopIss).toMatch(/DisableDirPage\s*=\s*yes/);
    expect(desktopIss).toMatch(/DisableReadyPage\s*=\s*yes/);
    expect(desktopIss).toMatch(/DisableProgramGroupPage\s*=\s*yes/);
  });

  it('never executes install.ps1 or any PowerShell', () => {
    // install.ps1 registers services, sets ACLs and opens firewall ports. It is
    // correct for server mode and wrong here, and it needs elevation this
    // installer no longer requests.
    //
    // Asserted against the [Run] and [UninstallRun] sections specifically: the
    // file legitimately NAMES install.ps1 elsewhere, in the Excludes list that
    // keeps it out of the payload entirely - the opposite of running it.
    const runSections = desktopIss
      .split(/^\[/m)
      .filter((section) => /^(Run|UninstallRun)\]/.test(section))
      .join('\n');

    expect(runSections).not.toMatch(/powershell/i);
    expect(runSections).not.toMatch(/install\.ps1/);
    // The only thing it launches is the app itself.
    expect(runSections).toMatch(/AeroGap\.exe/);

    // Server mode still does all of this, which is what makes it server mode.
    expect(serverIss).toMatch(/install\.ps1/);
  });

  it('collects no credentials, and neither does the server installer any more', () => {
    for (const iss of [desktopIss, serverIss]) {
      expect(iss).not.toMatch(/CLERKSECRET/);
      expect(iss).not.toMatch(/CLERK_SECRET_KEY=/);
    }
  });
});

describe('payload differences', () => {
  it('excludes the server-only components', () => {
    // caddy.exe and WinSW.exe are ~67 MB and exist only to front services over
    // TLS. Loopback is a secure context, so shipping them would be dead weight
    // in every download.
    const excludes = /Excludes:\s*"([^"]+)"/.exec(desktopIss);
    expect(excludes).not.toBeNull();
    for (const file of ['caddy.exe', 'WinSW.exe', 'install.ps1', 'services\\*']) {
      expect(excludes![1]).toContain(file);
    }
  });

  it('uses a different AppId from the server build', () => {
    // A machine may carry both. A shared AppId would make installing one
    // silently uninstall the other.
    const idOf = (s: string) => /AppId=\{\{([0-9A-Fa-f-]+)\}/.exec(s)?.[1];
    expect(idOf(desktopIss)).toBeDefined();
    expect(idOf(serverIss)).toBeDefined();
    expect(idOf(desktopIss)).not.toBe(idOf(serverIss));
  });

  it('stamps the mode marker as desktop', () => {
    // main.cjs DEFAULTS TO SERVER when the marker is absent, so a desktop
    // install that failed to write it would sit forever waiting on services
    // that do not exist.
    expect(desktopIss).toMatch(/aerogap-mode\.txt.*'desktop'|'desktop'.*aerogap-mode\.txt/s);
  });
});

describe('build script supports both products', () => {
  it('offers desktop, server and both', () => {
    expect(buildStaging).toMatch(/ValidateSet\('desktop',\s*'server',\s*'both'\)/);
  });

  it('stages the Convex function source', () => {
    // Without this the first-run deploy has nothing to push, and a customer gets
    // a working sign-in over a completely empty database. This was broken for
    // the entire life of the installer.
    expect(buildStaging).toMatch(/convex-src/);
    expect(buildStaging).toMatch(/convex-src\\+convex\.json/);
  });

  it('verifies the Convex deploy dependencies are staged', () => {
    // stripe and svix are imported by the Convex functions but NOT by the
    // application server, so nothing else in the build would notice them
    // missing - and the deploy that needs them first runs at a customer site.
    for (const pkg of ['convex', 'stripe', 'svix']) {
      expect(buildStaging).toContain(`'${pkg}'`);
    }
  });

  it('refuses to bake a secret into build-config.json', () => {
    expect(buildStaging).toMatch(/SECRET\|_API_KEY\|ADMIN_KEY\|TOKEN/);
  });

  it('stamps a single AppVersion through staging and both installers', () => {
    expect(buildStaging).toMatch(/\$AppVersion/);
    expect(buildStaging).toContain('app-version.txt');
    expect(desktopIss).toMatch(/AppVersion/);
    expect(serverIss).toMatch(/LicenseFile=\{#StagingDir\}\\LICENSE\.txt/);
  });
});
