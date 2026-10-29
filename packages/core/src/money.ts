/**
 * Money is stored as integer micro-units (1 USD = 1_000_000 micros) in bigint.
 * Floats are never used for amounts; conversions from decimal strings are exact.
 */
export type Micros = bigint;

export const MICROS_PER_UNIT = 1_000_000n;

/** Parses a decimal string such as "12.5" or "0.000001" into micros. Rejects more than 6 decimals. */
export function parseMicros(value: string): Micros {
  const match = /^(-)?(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid money amount: "${value}"`);
  const [, sign, whole, frac = ''] = match;
  const micros = BigInt(whole!) * MICROS_PER_UNIT + BigInt(frac.padEnd(6, '0'));
  return sign ? -micros : micros;
}

/** Formats micros as a decimal string with up to 6 decimals and at least 2 ("1.50", "0.123456"). */
export function formatMicros(micros: Micros): string {
  const negative = micros < 0n;
  const abs = negative ? -micros : micros;
  const whole = abs / MICROS_PER_UNIT;
  let frac = (abs % MICROS_PER_UNIT).toString().padStart(6, '0').replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

/** Applies a share in basis points (10_000 = 100%), rounding down so the network never over-pays. */
export function applyBps(micros: Micros, bps: number): Micros {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error(`Invalid basis points: ${bps}`);
  return (micros * BigInt(bps)) / 10_000n;
}

/**
 * Converts a USD amount into a publisher's virtual currency.
 * `pointsPerUsd` is the placement exchange rate as a decimal string (e.g. "1000" or "2.5");
 * the result is rounded down to whole points.
 */
export function toPoints(micros: Micros, pointsPerUsd: string): bigint {
  const rateMicros = parseMicros(pointsPerUsd);
  return (micros * rateMicros) / (MICROS_PER_UNIT * MICROS_PER_UNIT);
}
