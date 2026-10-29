import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random 160-bit TOTP secret, base32 encoded (what authenticator apps expect). */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 6238 TOTP (HMAC-SHA1, 30 s step) for the given time. */
export function totp(secret: string, time: Date, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time.getTime() / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/** Accepts the code for the current step and one step either side (clock drift). */
export function verifyTotp(secret: string, code: string, time: Date): boolean {
  const given = Buffer.from(code.replace(/\s/g, ''));
  if (!/^\d{6}$/.test(given.toString())) return false;
  return [-1, 0, 1].some((step) => {
    const expected = Buffer.from(totp(secret, new Date(time.getTime() + step * 30_000)));
    return timingSafeEqual(expected, given);
  });
}

/** otpauth:// URI for QR codes in Google Authenticator, 1Password, etc. */
export function totpUri(secret: string, account: string, issuer = 'Kiqro Network'): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
