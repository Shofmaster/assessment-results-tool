import { describe, it, expect } from 'vitest';
import { resolveUpstreamUrl } from '../server/src/docServerProxy.js';

/**
 * This resolver is the entire boundary between a request path and an outbound
 * fetch into the customer's internal network. If it can be made to resolve to
 * an attacker-chosen host or above the configured base, the doc proxy becomes
 * an SSRF pivot into a network we were trusted to sit inside. These tests are
 * the contract for that boundary.
 */
describe('resolveUpstreamUrl', () => {
  const BASE = 'http://manuals.acme.internal/docs';

  describe('legitimate paths', () => {
    it('resolves a simple file path under the base', () => {
      const url = resolveUpstreamUrl(BASE, '/amm/chapter-05.pdf');
      expect(url?.href).toBe('http://manuals.acme.internal/docs/amm/chapter-05.pdf');
    });

    it('resolves a deeply nested path', () => {
      const url = resolveUpstreamUrl(BASE, '/amm/ata/32/landing-gear.pdf');
      expect(url?.href).toBe('http://manuals.acme.internal/docs/amm/ata/32/landing-gear.pdf');
    });

    it('handles a base given with a trailing slash identically', () => {
      const url = resolveUpstreamUrl('http://manuals.acme.internal/docs/', '/amm/x.pdf');
      expect(url?.href).toBe('http://manuals.acme.internal/docs/amm/x.pdf');
    });

    it('handles a bare-host base with no path', () => {
      const url = resolveUpstreamUrl('http://manuals.acme.internal', '/x.pdf');
      expect(url?.href).toBe('http://manuals.acme.internal/x.pdf');
    });

    it('preserves spaces and unicode in filenames', () => {
      const url = resolveUpstreamUrl(BASE, '/Engine Manual (Rev 3).pdf');
      expect(url?.pathname).toContain('Engine%20Manual');
    });

    it('preserves a query string', () => {
      const url = resolveUpstreamUrl(BASE, '/x.pdf?version=2');
      expect(url?.search).toBe('?version=2');
    });
  });

  describe('rejects escaping the configured base', () => {
    it('rejects plain ../ traversal', () => {
      expect(resolveUpstreamUrl(BASE, '/../etc/passwd')).toBeNull();
    });

    it('rejects deep ../ traversal', () => {
      expect(resolveUpstreamUrl(BASE, '/amm/../../../secrets/keys.txt')).toBeNull();
    });

    it('rejects percent-encoded traversal', () => {
      // The URL constructor decodes before we compare prefixes, so %2e%2e%2f
      // cannot smuggle a climb past the check.
      expect(resolveUpstreamUrl(BASE, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    });

    it('rejects a sibling path that merely shares a prefix', () => {
      // "/docs-internal" must not pass a naive startsWith("/docs") check.
      expect(resolveUpstreamUrl(BASE, '/../docs-internal/salaries.xlsx')).toBeNull();
    });
  });

  describe('rejects host takeover (SSRF pivot)', () => {
    it('rejects a protocol-relative path pointing at another host', () => {
      expect(resolveUpstreamUrl(BASE, '//evil.example.com/payload')).toBeNull();
    });

    it('rejects a scheme-prefixed path that re-parses as an absolute URL', () => {
      // "http:/evil.example.com/x" is a valid absolute URL once the leading
      // slash is stripped, so URL resolution ignores the base entirely. The
      // origin pin is what catches this — the subtree check alone would not.
      expect(resolveUpstreamUrl(BASE, '/http:/evil.example.com/payload')).toBeNull();
      expect(resolveUpstreamUrl(BASE, '/https://evil.example.com/payload')).toBeNull();
    });

    it('rejects non-http schemes that could reach the local filesystem', () => {
      expect(resolveUpstreamUrl(BASE, '/file:///etc/passwd')).toBeNull();
    });

    it('rejects reaching the cloud metadata endpoint', () => {
      expect(resolveUpstreamUrl(BASE, '//169.254.169.254/latest/meta-data/iam/')).toBeNull();
    });

    it('rejects a backslash-prefixed host attempt', () => {
      const url = resolveUpstreamUrl(BASE, '/\\evil.example.com/x');
      // Either rejected, or kept on the pinned host — never resolved to evil.
      expect(url === null || url.hostname === 'manuals.acme.internal').toBe(true);
    });
  });

  describe('malformed input', () => {
    it('returns null for an unparseable base', () => {
      expect(resolveUpstreamUrl('not a url', '/x.pdf')).toBeNull();
    });

    it('resolves an empty path to the base itself', () => {
      const url = resolveUpstreamUrl(BASE, '');
      expect(url?.href).toBe('http://manuals.acme.internal/docs/');
    });
  });
});
