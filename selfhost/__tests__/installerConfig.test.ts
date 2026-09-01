import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the two ways aerogap.iss silently produces a broken install.
 *
 * 1. LOOPBACK PORTS. The backends bind loopback-only *internal* ports
 *    (install.ps1: 18080 / 13210 / 13211); the *public* ports (443 / 3210 /
 *    3211) belong to Caddy, which serves TLS and is bound to APP_DOMAIN, not to
 *    127.0.0.1. Writing a public port into a loopback URL therefore points the
 *    server at something that never answers. This shipped: the installer wrote
 *    CONVEX_URL=http://127.0.0.1:3210, so api/_lib/auth.ts could not reach
 *    Convex for its approval check and verifyRequestAuth failed closed with 503
 *    on EVERY AI request - which looks exactly like a bad API key.
 *
 * 2. THE FIXED-LENGTH ARRAY. WriteConfigFile declares SetArrayLength(Lines, N)
 *    and then assigns Lines[0..N-1] by hand. Nothing cross-checks the literal
 *    against the assignments, so adding or removing a config line without
 *    bumping N drops the tail of the .env (or emits an uninitialised slot).
 *
 * Both files are read from disk and the expected ports are DERIVED from
 * install.ps1, so this suite tracks the source of truth instead of restating it.
 */
const here = dirname(fileURLToPath(import.meta.url));
const windowsDir = join(here, '..', 'windows');

const iss = readFileSync(join(windowsDir, 'aerogap-server.iss'), 'utf8');
const installPs1 = readFileSync(join(windowsDir, 'install.ps1'), 'utf8');

/** `$ConvexInternalPort = 13210` -> the ports the backends actually bind. */
function internalPorts(): Map<string, number> {
  const found = new Map<string, number>();
  for (const m of installPs1.matchAll(/^\$(\w*InternalPort)\s*=\s*(\d+)/gm)) {
    found.set(m[1], Number(m[2]));
  }
  return found;
}

/** `[int] $ConvexPort = 3210,` -> the public ports Caddy fronts with TLS. */
function publicPorts(): Map<string, number> {
  const found = new Map<string, number>();
  for (const m of installPs1.matchAll(/\[int\]\s*\$(\w+Port)\s*=\s*(\d+)/g)) {
    found.set(m[1], Number(m[2]));
  }
  return found;
}

/**
 * Every `Lines[n] := ...` statement in WriteConfigFile.
 * Matching per line rather than to the next `;` keeps Inno's `{ ... }` comments
 * out of the results - which matters, because one of them legitimately quotes
 * the bad `127.0.0.1:3210` value while explaining why it is wrong.
 */
function lineAssignments(): Array<{ index: number; value: string; lineNo: number }> {
  const out: Array<{ index: number; value: string; lineNo: number }> = [];
  const src = iss.split(/\r?\n/);
  src.forEach((text, i) => {
    const m = /^[ \t]*Lines\[(\d+)\]\s*:=\s*(.*)$/.exec(text);
    if (m) out.push({ index: Number(m[1]), value: m[2], lineNo: i + 1 });
  });
  return out;
}

describe('install.ps1 port declarations', () => {
  it('still declares the internal ports this suite derives from', () => {
    // A rename must not turn the loopback assertions into a silent no-op.
    const internal = internalPorts();
    expect([...internal.keys()].sort()).toEqual([
      'AppInternalPort',
      'ConvexInternalPort',
      'ConvexSiteInternalPort',
    ]);
  });

  it('keeps internal and public ports disjoint', () => {
    const internal = new Set(internalPorts().values());
    const overlap = [...publicPorts().values()].filter((p) => internal.has(p));
    expect(overlap).toEqual([]);
  });
});

describe('aerogap.iss WriteConfigFile', () => {
  it('finds the Lines[] assignments', () => {
    expect(lineAssignments().length).toBeGreaterThan(0);
  });

  it('never points a loopback URL at a public (Caddy/TLS) port', () => {
    const internal = new Set(internalPorts().values());
    const publics = publicPorts();
    const publicByPort = new Map([...publics].map(([name, port]) => [port, name]));

    const offenders: string[] = [];
    for (const { value, lineNo } of lineAssignments()) {
      for (const hit of value.matchAll(/(?:127\.0\.0\.1|localhost):(\d+)/g)) {
        const port = Number(hit[1]);
        if (internal.has(port)) continue;
        const owner = publicByPort.get(port);
        offenders.push(
          `aerogap.iss:${lineNo} uses loopback port ${port}` +
            (owner
              ? `, which is the PUBLIC ${owner} served by Caddy over TLS on APP_DOMAIN.`
              : ', which no backend binds.') +
            ' Use the matching *InternalPort from install.ps1.',
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it('writes the server-side Convex URL at the Convex internal port', () => {
    // The specific regression: this is what verifyRequestAuth dials.
    const expected = internalPorts().get('ConvexInternalPort');
    const assignment = lineAssignments().find((a) => a.value.includes('CONVEX_URL='));
    expect(assignment, 'no CONVEX_URL line in WriteConfigFile').toBeDefined();
    expect(assignment!.value).toContain(`127.0.0.1:${expected}`);
  });

  it('declares an array length matching its assignments, with no gaps or duplicates', () => {
    const declared = /SetArrayLength\(\s*Lines\s*,\s*(\d+)\s*\)/.exec(iss);
    expect(declared, 'no SetArrayLength(Lines, N) found').not.toBeNull();
    const n = Number(declared![1]);

    const indices = lineAssignments().map((a) => a.index);
    const unique = [...new Set(indices)].sort((a, b) => a - b);

    const duplicates = indices.filter((v, i) => indices.indexOf(v) !== i);
    expect(duplicates, 'the same Lines[i] is assigned twice').toEqual([]);
    expect(unique).toEqual(Array.from({ length: n }, (_, i) => i));
  });
});
