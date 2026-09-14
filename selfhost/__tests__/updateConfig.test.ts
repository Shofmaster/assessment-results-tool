import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require_ = createRequire(import.meta.url);
const { resolveUpdateConfig } = require_('../desktop/updateConfig.cjs');

describe('resolveUpdateConfig', () => {
  it('is not configured when nothing is set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aerogap-upd-cfg-'));
    try {
      expect(resolveUpdateConfig({ installDir: dir, env: {} })).toMatchObject({
        feedUrl: '',
        configured: false,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads feed and public key from build-config.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aerogap-upd-cfg-'));
    try {
      writeFileSync(
        join(dir, 'build-config.json'),
        JSON.stringify({
          UPDATE_FEED_URL: 'https://updates.example.com/stable.json',
          UPDATE_PUBLIC_KEY_PEM: '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----',
          UPDATE_CHANNEL: 'beta',
        }),
        'utf8',
      );
      const cfg = resolveUpdateConfig({ installDir: dir, env: {} });
      expect(cfg.configured).toBe(true);
      expect(cfg.feedUrl).toBe('https://updates.example.com/stable.json');
      expect(cfg.channel).toBe('beta');
      expect(cfg.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lets env override the build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aerogap-upd-cfg-'));
    try {
      writeFileSync(
        join(dir, 'build-config.json'),
        JSON.stringify({ UPDATE_FEED_URL: 'https://build.example/feed.json' }),
        'utf8',
      );
      const cfg = resolveUpdateConfig({
        installDir: dir,
        env: {
          AEROGAP_UPDATE_FEED: 'https://env.example/feed.json',
          AEROGAP_UPDATE_PUBLIC_KEY: 'pem-from-env',
        },
      });
      expect(cfg.feedUrl).toBe('https://env.example/feed.json');
      expect(cfg.publicKeyPem).toBe('pem-from-env');
      expect(cfg.configured).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
