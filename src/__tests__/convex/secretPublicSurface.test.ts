import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * companies.getFeaturePolicy and userSettings.get used to return stored
 * secrets to the browser. The mask helpers are covered by unit tests; these
 * guards make sure the public Convex functions actually call them, and that
 * the internal webhook reader is still unmasked.
 */
const convexDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'convex');

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

const isInternal = (k: FnKind) => k.startsWith('internal');

const companiesSrc = readFileSync(join(convexDir, 'companies.ts'), 'utf8');
const userSettingsSrc = readFileSync(join(convexDir, 'userSettings.ts'), 'utf8');
const companiesFns = convexFunctions(companiesSrc);
const userSettingsFns = convexFunctions(userSettingsSrc);

describe('companies public feature-policy reads are masked', () => {
  it.each(['getFeaturePolicy', 'getFeaturePolicyByProject'])('%s returns maskWebhookSecret(doc)', (name) => {
    const fn = companiesFns.find((f) => f.name === name);
    expect(fn, `${name} not found`).toBeDefined();
    expect(isInternal(fn!.kind)).toBe(false);
    expect(fn!.body).toMatch(/return maskWebhookSecret\(\s*doc\s*\)/);
  });

  it('getFeaturePolicyInternal stays internal and unmasked so webhooks can sign', () => {
    const fn = companiesFns.find((f) => f.name === 'getFeaturePolicyInternal');
    expect(fn, 'getFeaturePolicyInternal not found').toBeDefined();
    expect(fn!.kind).toBe('internalQuery');
    expect(fn!.body).not.toContain('maskWebhookSecret');
    expect(fn!.body).toContain('companyFeaturePolicies');
  });

  it('no public companies function returns the raw webhook secret', () => {
    const offenders: string[] = [];
    for (const fn of companiesFns.filter((f) => !isInternal(f.kind))) {
      for (const line of fn.body.split(/\r?\n/)) {
        if (!/\breturn\b/.test(line)) continue;
        if (/carLifecycleWebhookSecret(?!Configured|Last4)/.test(line)) {
          offenders.push(`${fn.name}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('userSettings public reads are masked', () => {
  it('get returns maskAvianisSecrets(doc)', () => {
    const fn = userSettingsFns.find((f) => f.name === 'get');
    expect(fn, 'get not found').toBeDefined();
    expect(fn!.kind).toBe('query');
    expect(fn!.body).toMatch(/return maskAvianisSecrets\(\s*doc\s*\)/);
  });

  it('listAllForAdmin maps every row through maskAvianisSecrets', () => {
    const fn = userSettingsFns.find((f) => f.name === 'listAllForAdmin');
    expect(fn, 'listAllForAdmin not found').toBeDefined();
    expect(fn!.kind).toBe('query');
    expect(fn!.body).toMatch(/docs\.map\(\s*\(doc\)\s*=>\s*maskAvianisSecrets\(\s*doc\s*\)\s*\)/);
  });

  it('no public userSettings function returns a raw Avianis secret', () => {
    const secretFields = [
      'avianisApiKey',
      'avianisClientSecret',
      'avianisPassword',
      'avianisCachedToken',
    ];
    const offenders: string[] = [];
    for (const fn of userSettingsFns.filter((f) => !isInternal(f.kind))) {
      for (const line of fn.body.split(/\r?\n/)) {
        if (!/\breturn\b/.test(line)) continue;
        for (const field of secretFields) {
          const re = new RegExp(`\\b${field}\\b(?!Configured|Last4)`);
          if (re.test(line)) offenders.push(`${fn.name}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
