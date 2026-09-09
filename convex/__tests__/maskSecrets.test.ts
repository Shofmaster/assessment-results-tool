import { describe, expect, it } from 'vitest';
import { maskAvianisSecrets, maskWebhookSecret } from '../lib/maskSecrets';

describe('maskWebhookSecret', () => {
  it('returns null for a missing row', () => {
    expect(maskWebhookSecret(null)).toBeNull();
  });

  it('strips the raw secret and reports configured + last4', () => {
    const masked = maskWebhookSecret({
      _id: 'pol_1',
      carLifecycleWebhookUrl: 'https://hooks.example/car',
      carLifecycleWebhookSecret: 'whsec_live_abcd1234',
    });
    expect(masked).toEqual({
      _id: 'pol_1',
      carLifecycleWebhookUrl: 'https://hooks.example/car',
      carLifecycleWebhookSecretConfigured: true,
      carLifecycleWebhookSecretLast4: '1234',
    });
    expect(masked).not.toHaveProperty('carLifecycleWebhookSecret');
  });

  it('reports unconfigured when the secret is absent', () => {
    const masked = maskWebhookSecret({ carLifecycleWebhookUrl: 'https://hooks.example/car' });
    expect(masked.carLifecycleWebhookSecretConfigured).toBe(false);
    expect(masked.carLifecycleWebhookSecretLast4).toBeUndefined();
    expect(masked).not.toHaveProperty('carLifecycleWebhookSecret');
  });
});

describe('maskAvianisSecrets', () => {
  it('returns null for a missing row', () => {
    expect(maskAvianisSecrets(null)).toBeNull();
  });

  it('strips every Avianis credential and keeps identifiers', () => {
    const masked = maskAvianisSecrets({
      userId: 'user_1',
      avianisUsername: 'shop.tech',
      avianisClientId: 'client-public',
      avianisApiKey: 'ak_live_xxxx9999',
      avianisClientSecret: 'cs_live_yyyy8888',
      avianisPassword: 'hunter2-pass',
      avianisCachedToken: 'tok_zzzz7777',
    });
    expect(masked).toEqual({
      userId: 'user_1',
      avianisUsername: 'shop.tech',
      avianisClientId: 'client-public',
      avianisApiKeyConfigured: true,
      avianisApiKeyLast4: '9999',
      avianisClientSecretConfigured: true,
      avianisClientSecretLast4: '8888',
      avianisPasswordConfigured: true,
      avianisPasswordLast4: 'pass',
      avianisCachedTokenConfigured: true,
    });
    expect(masked).not.toHaveProperty('avianisApiKey');
    expect(masked).not.toHaveProperty('avianisClientSecret');
    expect(masked).not.toHaveProperty('avianisPassword');
    expect(masked).not.toHaveProperty('avianisCachedToken');
  });
});
