import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const MIN_ROOT_SECRET_LENGTH = 32;
const KEY_CONTEXT = 'mindoist/provider-api-keys/v1';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(rootSecret: string) {
  if (rootSecret.length < MIN_ROOT_SECRET_LENGTH) {
    throw new Error(`Provider encryption requires a root secret of at least ${MIN_ROOT_SECRET_LENGTH} characters`);
  }
  return Buffer.from(hkdfSync('sha256', rootSecret, 'mindoist-admin-control-plane', KEY_CONTEXT, 32));
}

export function encryptProviderSecret(plaintext: string, rootSecret = process.env.JWT_SECRET || '') {
  if (!plaintext) throw new Error('Provider secret cannot be empty');
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(rootSecret), nonce);
  cipher.setAAD(Buffer.from(KEY_CONTEXT));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, nonce.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptProviderSecret(envelope: string, rootSecret = process.env.JWT_SECRET || '') {
  try {
    const [version, noncePart, tagPart, ciphertextPart, extra] = envelope.split('.');
    if (version !== VERSION || !noncePart || !tagPart || !ciphertextPart || extra) {
      throw new Error('Unsupported provider secret envelope');
    }
    const nonce = Buffer.from(noncePart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (nonce.length !== NONCE_LENGTH || tag.length !== TAG_LENGTH) throw new Error('Invalid provider secret envelope');
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(rootSecret), nonce);
    decipher.setAAD(Buffer.from(KEY_CONTEXT));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && /32 characters/.test(error.message)) throw error;
    throw new Error('Unable to decrypt provider secret');
  }
}

export function providerSecretHint(secret: string) {
  const suffix = secret.slice(-4);
  return suffix ? `••••${suffix}` : '••••';
}
