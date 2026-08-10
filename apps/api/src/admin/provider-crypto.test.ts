import { describe, expect, it } from 'vitest';
import { decryptProviderSecret, encryptProviderSecret } from './provider-crypto.js';

const strongSecret = 'provider-control-plane-test-secret-with-more-than-32-characters';

describe('provider secret encryption', () => {
  it('round-trips with a versioned authenticated envelope without exposing plaintext', () => {
    const encrypted = encryptProviderSecret('sk-super-secret-value', strongSecret);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('sk-super-secret-value');
    expect(decryptProviderSecret(encrypted, strongSecret)).toBe('sk-super-secret-value');
  });

  it('rejects a modified ciphertext', () => {
    const encrypted = encryptProviderSecret('sk-super-secret-value', strongSecret);
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
    expect(() => decryptProviderSecret(tampered, strongSecret)).toThrow(/decrypt/i);
  });

  it('fails closed when the root secret is too weak', () => {
    expect(() => encryptProviderSecret('key', 'short')).toThrow(/32/);
  });
});
