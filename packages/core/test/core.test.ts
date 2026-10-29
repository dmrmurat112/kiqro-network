import { describe, expect, it } from 'vitest';
import { applyBps, fillMacros, formatMicros, macrosIn, parseMicros, sign, toPoints, verify } from '../src/index.ts';

describe('money', () => {
  it('parses and formats decimal strings exactly', () => {
    expect(parseMicros('12.5')).toBe(12_500_000n);
    expect(parseMicros('0.000001')).toBe(1n);
    expect(parseMicros('-3')).toBe(-3_000_000n);
    expect(formatMicros(12_500_000n)).toBe('12.50');
    expect(formatMicros(123_456n)).toBe('0.123456');
    expect(formatMicros(-1_000_000n)).toBe('-1.00');
  });

  it('rejects malformed or over-precise amounts', () => {
    expect(() => parseMicros('1.0000001')).toThrow();
    expect(() => parseMicros('abc')).toThrow();
    expect(() => parseMicros('1,5')).toThrow();
  });

  it('applies basis points rounding down', () => {
    expect(applyBps(10_000_000n, 6_500)).toBe(6_500_000n);
    expect(applyBps(1n, 5_000)).toBe(0n);
    expect(() => applyBps(1n, 10_001)).toThrow();
  });

  it('converts USD to whole points using the placement rate', () => {
    expect(toPoints(1_200_000n, '1000')).toBe(1200n);
    expect(toPoints(1_999_999n, '1')).toBe(1n);
    expect(toPoints(3_000_000n, '2.5')).toBe(7n);
  });
});

describe('signature', () => {
  it('verifies its own signatures and rejects tampering', () => {
    const sig = sign('secret', ['u1', 350, 'tx1', 1]);
    expect(verify('secret', ['u1', 350, 'tx1', 1], sig)).toBe(true);
    expect(verify('secret', ['u1', 351, 'tx1', 1], sig)).toBe(false);
    expect(verify('other', ['u1', 350, 'tx1', 1], sig)).toBe(false);
    expect(verify('secret', ['u1', 350, 'tx1', 1], undefined)).toBe(false);
    expect(verify('secret', ['u1', 350, 'tx1', 1], 'zz')).toBe(false);
  });
});

describe('macros', () => {
  it('fills known macros, encodes values and keeps unknown ones', () => {
    const url = fillMacros('https://x.io/?c={click_id}&s={sub}&q={unknown}', { click_id: 'a b', sub: null });
    expect(url).toBe('https://x.io/?c=a%20b&s=&q={unknown}');
    expect(macrosIn('a={click_id}&b={country}')).toEqual(['click_id', 'country']);
  });
});
