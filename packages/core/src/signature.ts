import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 over the parts joined with "|", hex encoded. Used for click URLs and postbacks. */
export function sign(secret: string, parts: ReadonlyArray<string | number | bigint>): string {
  return createHmac('sha256', secret).update(parts.map(String).join('|')).digest('hex');
}

export function verify(secret: string, parts: ReadonlyArray<string | number | bigint>, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(sign(secret, parts), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
