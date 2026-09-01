import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Exclusion-style guard, modelled on selfhost/__tests__/clientConfig.test.ts.
 *
 * A stored provider key must never be reachable from a browser. That property
 * is not enforced by types - it is enforced by which Convex functions are
 * declared `internal*`, and by nothing else querying the table. Both are one
 * careless edit away from a mass key leak, and the leak would be silent.
 *
 * This is not hypothetical in this codebase: companyFeaturePolicies holds
 * carLifecycleWebhookSecret and the PUBLIC companies.getFeaturePolicy returns
 * that whole document to any company member. These tests exist so the same
 * thing cannot happen to aiCredentials.
 */
const here = dirname(fileURLToPath(import.meta.url));
const convexDir = join(here, '..', '..', '..', 'convex');
const modulePath = join(convexDir, 'aiCredentials.ts');
const source = readFileSync(modulePath, 'utf8');

type FnKind =
  | 'query'
  | 'mutation'
  | 'action'
  | 'internalQuery'
  | 'internalMutation'
  | 'internalAction';

interface ConvexFn {
  name: string;
  kind: FnKind;
  body: string;
}

/**
 * Split the module into `export const NAME = kind({ ... });` blocks.
 * The closing `});` is matched at column 0, which is where prettier puts it for
 * a top-level export and nowhere else inside one.
 */
function convexFunctions(src: string): ConvexFn[] {
  const out: ConvexFn[] = [];
  const re =
    /^export const (\w+) = (query|mutation|action|internalQuery|internalMutation|internalAction)\(\{/gm;
  for (const m of src.matchAll(re)) {
    const start = m.index ?? 0;
    const rest = src.slice(start);
    const endRel = rest.indexOf('\n});');
    out.push({
      name: m[1],
      kind: m[2] as FnKind,
      body: endRel === -1 ? rest : rest.slice(0, endRel + 4),
    });
  }
  return out;
}

const fns = convexFunctions(source);
const isInternal = (k: FnKind) => k.startsWith('internal');
const publicFns = fns.filter((f) => !isInternal(f.kind));

describe('aiCredentials module shape', () => {
  it('parses the expected set of Convex functions', () => {
    // A rename or a parser drift must not make every assertion below vacuous.
    expect(fns.length).toBeGreaterThanOrEqual(9);
    expect(fns.map((f) => f.name)).toContain('_resolveCredential');
    expect(fns.map((f) => f.name)).toContain('status');
  });

  it('declares every underscore-prefixed function as internal', () => {
    const leaked = fns
      .filter((f) => f.name.startsWith('_') && !isInternal(f.kind))
      .map((f) => `${f.name} is ${f.kind}, must be internal*`);
    expect(leaked).toEqual([]);
  });

  it.each([
    '_resolveCredential',
    '_upsertCredential',
    '_assertCanEditCompany',
    '_assertCanEditInstall',
    '_recordVerification',
  ])('%s is internal-only', (name) => {
    const fn = fns.find((f) => f.name === name);
    expect(fn, `${name} not found`).toBeDefined();
    expect(isInternal(fn!.kind)).toBe(true);
  });

  it('keeps _resolveCredential a query, so it can never do crypto', () => {
    // Decryption must happen in the calling action via openSecret(); a query has
    // no crypto.subtle and must stay deterministic.
    expect(fns.find((f) => f.name === '_resolveCredential')?.kind).toBe('internalQuery');
    expect(fns.find((f) => f.name === '_resolveCredential')?.body).not.toContain('openSecret');
  });
});

describe('no public function can return a stored key', () => {
  it('the status query never mentions apiKey at all', () => {
    // status is THE public read. It returns a state enum and keyLast4, nothing else.
    const status = fns.find((f) => f.name === 'status');
    expect(status, 'status query not found').toBeDefined();
    expect(status!.kind).toBe('query');
    expect(status!.body).not.toContain('apiKey');
  });

  it('no public function returns a resolved credential object', () => {
    // `sealed` is the decrypted-or-not record from _resolveCredential. Returning
    // it, or spreading it, would hand the key to whoever called the function.
    const offenders: string[] = [];
    for (const fn of publicFns) {
      for (const line of fn.body.split(/\r?\n/)) {
        if (!/\breturn\b/.test(line)) continue;
        if (/return\s+sealed\b/.test(line) || /\.\.\.sealed\b/.test(line)) {
          offenders.push(`${fn.name}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only exposes key material through keyLast4()', () => {
    // Any other read of a plaintext key inside a public function is suspicious.
    // keyLast4(apiKey) is allowed; `apiKey: sealed.apiKey` handed to an internal
    // mutation is allowed; a bare apiKey in a return is not.
    const offenders: string[] = [];
    for (const fn of publicFns) {
      for (const line of fn.body.split(/\r?\n/)) {
        if (!/\breturn\b/.test(line)) continue;
        const withoutLast4 = line.replace(/keyLast4\([^)]*\)/g, '');
        if (/apiKey/.test(withoutLast4)) offenders.push(`${fn.name}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the aiCredentials table is not readable from anywhere else', () => {
  function convexSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === '_generated' || entry === 'node_modules') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) convexSourceFiles(full, acc);
      else if (entry.endsWith('.ts')) acc.push(full);
    }
    return acc;
  }

  it('is referenced only by schema.ts and aiCredentials.ts', () => {
    // Confining table access to one module is what makes the assertions above a
    // complete guarantee rather than a local one. A new public query in some
    // other file could otherwise select the row and return it.
    const allowed = new Set(['schema.ts', 'aiCredentials.ts']);
    const offenders = convexSourceFiles(convexDir)
      .filter((f) => readFileSync(f, 'utf8').includes('"aiCredentials"'))
      .map((f) => relative(convexDir, f).replace(/\\/g, '/'))
      .filter((rel) => !allowed.has(rel));
    expect(offenders).toEqual([]);
  });
});

describe('user-facing provider names', () => {
  /**
   * The raw provider ids are lowercase identifiers. One of them reached a real
   * customer-facing message ("The key was rejected by anthropic.") because the
   * Anthropic SDK throws on 401 instead of returning a response, so that branch
   * always runs through the catch — which passed `provider` rather than a label.
   */
  // `modulePath` is already resolved at the top of this file.
  const source = readFileSync(modulePath, 'utf8');

  it('never passes a raw provider id into a message', () => {
    expect(source).not.toMatch(/describeProbeFailure\(\s*provider\s*,/);
  });

  it('routes every failure message through the label map', () => {
    // Lookbehind skips the function declaration itself.
    const calls = source.match(/(?<!function )describeProbeFailure\(([^,]+),/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toContain('PROVIDER_LABEL');
  });
});
