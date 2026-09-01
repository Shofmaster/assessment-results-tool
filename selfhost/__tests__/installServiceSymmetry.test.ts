import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Keeps install.ps1, uninstall.ps1 and aerogap.iss agreeing on the set of
 * Windows services and firewall rules.
 *
 * Three lists had drifted apart, and every symptom pointed somewhere else:
 *
 *   - uninstall.ps1 removed only AeroGapApp + AeroGapConvex. AeroGapProxy
 *     survived every uninstall, kept caddy.exe and AeroGapProxy.exe locked (so
 *     `Remove-Item $InstallDir` silently failed and left a stub install behind),
 *     and went on holding 443/3210/3211 - answering 502 for a product that was
 *     no longer installed.
 *   - the same omission in install.ps1's pre-copy stop list and in the .iss
 *     PrepareToInstall means an in-place UPGRADE cannot replace those binaries.
 *     With /SUPPRESSMSGBOXES the Abort/Retry/Ignore prompt defaults to Abort, so
 *     the upgrade rolls back - and Inno still exits 0.
 *   - install.ps1 creates the rule 'AeroGap Application (HTTPS)' while
 *     uninstall.ps1 deleted 'AeroGap Application', so an inbound allow rule on
 *     443 outlived the product.
 *
 * None of these fail loudly, so they are pinned here instead.
 */
const here = dirname(fileURLToPath(import.meta.url));
const windowsDir = join(here, '..', 'windows');

const installPs1 = readFileSync(join(windowsDir, 'install.ps1'), 'utf8');
const uninstallPs1 = readFileSync(join(windowsDir, 'uninstall.ps1'), 'utf8');
const iss = readFileSync(join(windowsDir, 'aerogap-server.iss'), 'utf8');

/** Single-quoted strings inside a PowerShell `@( ... )` list body. */
function quoted(listBody: string): string[] {
  return [...listBody.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Capture to end of line, not to the closing paren: a rule name may itself
 * contain parentheses ('AeroGap Application (HTTPS)'), so a `[^)]*` capture
 * would stop inside the string. quoted() then ignores the trailing `)) {`.
 */
function listAfter(src: string, pattern: RegExp): string[] {
  const m = pattern.exec(src);
  expect(m, `pattern not found: ${pattern}`).not.toBeNull();
  return quoted(m![1]);
}

const sorted = (xs: string[]) => [...xs].sort();

/** Services install.ps1 actually registers with the SCM. The source of truth. */
function registeredServices(): string[] {
  return [...installPs1.matchAll(/@\{\s*Id\s*=\s*'([^']+)'\s*;\s*Template/g)].map((m) => m[1]);
}

/** Firewall rules install.ps1 creates. */
function createdFirewallRules(): string[] {
  return [...installPs1.matchAll(/@\{\s*Name\s*=\s*'([^']+)'\s*;\s*Port/g)].map((m) => m[1]);
}

describe('service registration is the source of truth', () => {
  it('install.ps1 still declares its service table', () => {
    // A refactor must not turn every assertion below into a vacuous pass.
    expect(registeredServices().length).toBeGreaterThanOrEqual(3);
    expect(registeredServices()).toContain('AeroGapProxy');
  });
});

describe('uninstall.ps1 mirrors install.ps1', () => {
  it('removes every service that was registered', () => {
    const removed = listAfter(uninstallPs1, /\$services\s*=\s*@\((.*)$/m);
    expect(sorted(removed)).toEqual(sorted(registeredServices()));
  });

  it('removes every firewall rule that was created, by exact name', () => {
    const removed = listAfter(uninstallPs1, /foreach \(\$name in @\((.*)$/m);
    expect(sorted(removed)).toEqual(sorted(createdFirewallRules()));
  });
});

describe('upgrade paths stop every service before replacing binaries', () => {
  it('install.ps1 stops all of them before copying files', () => {
    const stopped = listAfter(installPs1, /foreach \(\$svc in @\((.*)$/m);
    expect(sorted(stopped)).toEqual(sorted(registeredServices()));
  });

  it('aerogap.iss PrepareToInstall stops all of them', () => {
    const fn = /function PrepareToInstall[\s\S]*?\bend;/.exec(iss);
    expect(fn, 'PrepareToInstall not found in aerogap.iss').not.toBeNull();
    const stopped = [...fn![0].matchAll(/StopServiceAndWait\('([^']+)'\)/g)].map((m) => m[1]);
    expect(sorted(stopped)).toEqual(sorted(registeredServices()));
  });

  it('stops the proxy before the backends it fronts', () => {
    // Draining the front door first is what keeps an upgrade from serving
    // half-replaced backends; it is also the order that releases caddy.exe.
    const stopped = listAfter(installPs1, /foreach \(\$svc in @\((.*)$/m);
    expect(stopped[0]).toBe('AeroGapProxy');
  });
});
