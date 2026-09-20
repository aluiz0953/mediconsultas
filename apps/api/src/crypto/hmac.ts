import { createHmac } from 'node:crypto';

// PRD §16.1/§28.2: HMAC-SHA256 with a server-held secret, used to check
// uniqueness of CPF/license numbers without ever storing them in the clear.
export function hmacSha256Hex(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}
