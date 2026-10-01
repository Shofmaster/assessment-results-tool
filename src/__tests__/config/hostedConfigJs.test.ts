import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * Hosted Vercel has no application server, but index.html still requests
 * /config.js. public/config.js is what that request must receive: real
 * JavaScript that does not inject config. The SPA rewrite would otherwise
 * return index.html, which browsers refuse to run under nosniff.
 */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'config.js'),
  'utf8'
);

describe('hosted public/config.js', () => {
  it('is a script, not the SPA shell', () => {
    expect(source.trim().length).toBeGreaterThan(0);
    expect(source).not.toMatch(/<!doctype/i);
    expect(source).not.toMatch(/<html/i);
    expect(source).not.toContain('<script');
  });

  it('does not inject runtime config', () => {
    // The comment may name the global. An assignment would override the
    // build-time env the hosted app is supposed to keep.
    expect(source).not.toMatch(/__AVIATION_APP_CONFIG__\s*=/);

    const sandbox: { window: Record<string, unknown> } = { window: {} };
    expect(() => vm.runInNewContext(source, sandbox)).not.toThrow();
    expect(sandbox.window.__AVIATION_APP_CONFIG__).toBeUndefined();
  });
});
