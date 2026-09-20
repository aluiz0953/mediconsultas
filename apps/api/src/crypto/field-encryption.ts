import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

// ponytail: single static key from env (AES-256-GCM via node:crypto), not the
// full KMS-backed envelope (DEK/KEK) from PRD §28.4 — swap in a KMS once one
// exists; the encryptField/decryptField signatures don't need to change.
function loadKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error('Encryption key must decode to 32 bytes (AES-256).');
  }
  return key;
}

export function encryptField(plain: string, base64Key: string): string {
  const key = loadKey(base64Key);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64')).join('.');
}

export function decryptField(sealed: string, base64Key: string): string {
  const key = loadKey(base64Key);
  const [ivB64, tagB64, ciphertextB64] = sealed.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
