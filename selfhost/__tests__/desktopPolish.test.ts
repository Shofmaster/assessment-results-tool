import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The details that separate "a web app in a frame" from a program.
 *
 * Individually trivial; collectively they are what a user judges the product by
 * in the first ten seconds. The window-position logic in particular has a
 * failure mode worth guarding: a window restored onto a monitor that has since
 * been unplugged is running, listed in the taskbar, and invisible - which reads
 * as a crash.
 */
const require_ = createRequire(import.meta.url);
const windowState = require_('../desktop/windowState.cjs');

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, '..', 'desktop');

let userData: string;

/** A typical single 1920x1080 desktop. */
const ONE_DISPLAY = [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }];

/** Laptop plus a monitor to its left, which is where negative x comes from. */
const TWO_DISPLAYS = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { workArea: { x: -1920, y: 0, width: 1920, height: 1040 } },
];

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'aerogap-win-'));
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('window position', () => {
  it('uses sensible defaults on a first run', () => {
    const restored = windowState.restore(userData, ONE_DISPLAY);
    expect(restored.width).toBe(windowState.DEFAULTS.width);
    expect(restored.maximized).toBe(false);
    // No coordinates: let the OS centre it rather than guessing.
    expect(restored.x).toBeUndefined();
  });

  it('round-trips a saved position', () => {
    writeFileSync(
      windowState.stateFile(userData),
      JSON.stringify({ x: 100, y: 80, width: 1200, height: 800, maximized: false }),
      'utf8',
    );
    expect(windowState.restore(userData, ONE_DISPLAY)).toMatchObject({
      x: 100,
      y: 80,
      width: 1200,
      height: 800,
    });
  });

  it('DISCARDS a position on a monitor that is no longer connected', () => {
    // The docked-laptop case. Without this the app opens at x=2400 on a 1920
    // display: running, in the taskbar, and nowhere on screen.
    writeFileSync(
      windowState.stateFile(userData),
      JSON.stringify({ x: 2400, y: 300, width: 1200, height: 800 }),
      'utf8',
    );
    const restored = windowState.restore(userData, ONE_DISPLAY);
    expect(restored.x).toBeUndefined();
    // The SIZE is still honoured - only the position was unusable.
    expect(restored.width).toBe(1200);
  });

  it('keeps a position on a second monitor that IS connected', () => {
    writeFileSync(
      windowState.stateFile(userData),
      JSON.stringify({ x: -1800, y: 100, width: 1200, height: 800 }),
      'utf8',
    );
    expect(windowState.restore(userData, TWO_DISPLAYS).x).toBe(-1800);
  });

  it('rejects a window only barely overlapping a display', () => {
    // Ten pixels of title bar is not "on screen" in any useful sense.
    const bounds = { x: 1910, y: 500, width: 1200, height: 800 };
    expect(windowState.isOnScreen(bounds, ONE_DISPLAY)).toBe(false);
  });

  it('never restores something smaller than the minimum usable size', () => {
    writeFileSync(
      windowState.stateFile(userData),
      JSON.stringify({ x: 0, y: 0, width: 200, height: 150 }),
      'utf8',
    );
    const restored = windowState.restore(userData, ONE_DISPLAY);
    expect(restored.width).toBeGreaterThanOrEqual(windowState.MINIMUM.width);
    expect(restored.height).toBeGreaterThanOrEqual(windowState.MINIMUM.height);
  });

  it('survives a corrupt state file', () => {
    writeFileSync(windowState.stateFile(userData), 'not json at all', 'utf8');
    expect(() => windowState.restore(userData, ONE_DISPLAY)).not.toThrow();
    expect(windowState.restore(userData, ONE_DISPLAY).width).toBe(windowState.DEFAULTS.width);
  });

  it('never throws when saving is impossible', () => {
    // Losing a window position must not interrupt anyone.
    expect(() => windowState.save(userData, null)).not.toThrow();
    expect(() => windowState.save(userData, { isDestroyed: () => true })).not.toThrow();
  });
});

describe('the application icon', () => {
  const icoPath = join(desktopDir, 'build', 'AeroGap.ico');

  it('exists', () => {
    // Electron's default icon is the loudest "this is a prototype" signal there
    // is, and it is invisible in a dev run.
    expect(existsSync(icoPath)).toBe(true);
  });

  it('is a real multi-size ICO, not a renamed PNG', () => {
    const buffer = readFileSync(icoPath);
    expect(buffer.readUInt16LE(0)).toBe(0); // reserved
    expect(buffer.readUInt16LE(2)).toBe(1); // type 1 = icon

    const count = buffer.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(4);

    const sizes = [];
    for (let i = 0; i < count; i += 1) {
      const entry = 6 + i * 16;
      // 0 in the width byte means 256.
      sizes.push(buffer.readUInt8(entry) || 256);
      expect(buffer.readUInt16LE(entry + 6)).toBe(32); // 32-bit, so it has alpha
    }

    // The sizes Windows actually asks for across its various surfaces.
    for (const required of [16, 32, 48, 256]) {
      expect(sizes).toContain(required);
    }
  });

  it('is generated from the app\'s own brand mark, not a separate drawing', () => {
    // If these ever diverge, the desktop build looks like a different product.
    const script = readFileSync(join(desktopDir, 'scripts', 'make-icon.cjs'), 'utf8');
    expect(script).toMatch(/favicon\.svg/);
  });
});

describe('shell wiring', () => {
  const main = readFileSync(join(desktopDir, 'main.cjs'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'));

  it('ships every module main.cjs requires', () => {
    // electron-builder's files list is exhaustive, so a missing entry is a
    // MODULE_NOT_FOUND at launch that `npm start` can never reproduce.
    const required = [...main.matchAll(/require\('\.\/([\w.]+\.cjs)'\)/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(3);
    for (const module of required) {
      expect(pkg.build.files).toContain(module);
    }
  });

  it('points electron-builder at the icon', () => {
    expect(pkg.build.win.icon).toBe('build/AeroGap.ico');
    expect(pkg.build.files).toContain('build/AeroGap.ico');
  });

  it('restores window geometry rather than hardcoding a rectangle', () => {
    expect(main).toMatch(/windowState\.restore/);
    expect(main).not.toMatch(/width:\s*1440,\s*\n\s*height:\s*900/);
  });

  it('recognises a project bundle on the command line', () => {
    expect(main).toMatch(/aqp\\?\.json/);
    // Both entry points: a cold launch and a launch while already running.
    expect(main).toMatch(/fileArgument\(process\.argv\)/);
    expect(main).toMatch(/fileArgument\(argv\)/);
  });

  it('offers File > Link manuals folder, on the query the Library listens for', () => {
    // The menu can only navigate; the SPA opens the prompt when it sees this
    // query. The two sides are in different packages, so pin the contract here.
    const menu = readFileSync(join(desktopDir, 'menu.cjs'), 'utf8');
    expect(menu).toMatch(/label:\s*'Link manuals folder\.\.\.'/);
    const query = menu.match(/const LINK_MANUALS_QUERY = '([^']+)'/)?.[1];
    expect(query).toBeTruthy();
    const [param, value] = String(query).split('=');
    const spa = readFileSync(join(here, '..', '..', 'src', 'utils', 'desktopShell.ts'), 'utf8');
    expect(spa).toContain(`LINK_MANUALS_PARAM = '${param}'`);
    expect(spa).toContain(`LINK_MANUALS_VALUE = '${value}'`);
  });
});

describe('installer polish', () => {
  const iss = readFileSync(join(here, '..', 'windows', 'aerogap-desktop.iss'), 'utf8');

  it('sets its own icon and the Apps & Features icon', () => {
    expect(iss).toMatch(/SetupIconFile=/);
    expect(iss).toMatch(/UninstallDisplayIcon=/);
  });

  it('registers the .aqp.json association under HKCU, not HKCR', () => {
    // A per-user install with no elevation cannot write HKCR: it would fail
    // silently on a standard account and leave a half-registered type.
    expect(iss).toMatch(/Root:\s*HKCU;\s*Subkey:\s*"Software\\Classes\\\.aqp\.json"/);
    expect(iss).not.toMatch(/Root:\s*HKCR/);
  });

  it('removes the association on uninstall', () => {
    // An association pointing at a deleted executable produces an error dialog
    // on every double-click, forever.
    const registryBlock = iss.slice(iss.indexOf('[Registry]'), iss.indexOf('[Icons]'));
    for (const line of registryBlock.split('\n').filter((l) => l.trim().startsWith('Root:'))) {
      expect(line).toMatch(/uninsdelete/);
    }
  });
});
