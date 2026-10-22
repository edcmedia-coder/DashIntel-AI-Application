/**
 * Integer-cent money primitives.
 *
 * Every monetary value in DashIntel is an integer number of cents.
 * Floating point is never used to hold a currency amount; `toDollars` exists
 * only for display formatting at the edge of the UI.
 *
 * Rates (cost per mile, pay per hour) are stored as integer "milli-cents per
 * unit" so that per-mile vehicle economics keep 3 decimal places of precision
 * without floating point drift.
 */

/** Integer number of cents. */
export type Cents = number;

/** Integer milli-cents per unit (1/1000 of a cent). $0.623/mile === 623. */
export type RateMilli = number;

/** Scale factor for `RateMilli` values. */
export const RATE_SCALE = 1000;

/** A rate expressed in milli-cents per unit. */
export function milliRate(dollarsPerUnit: number): RateMilli {
  if (!Number.isFinite(dollarsPerUnit)) {
    throw new Error("milliRate: value must be finite");
  }
  return Math.round(dollarsPerUnit * RATE_SCALE);
}

/**
 * Parse a user-entered dollar string ("12", "12.5", "$12.50", "12.5") into
 * integer cents. Rejects anything with more than 2 decimal places so that
 * rounding never silently changes a driver's money.
 */
export function parseCents(input: string | number): Cents {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("parseCents: not a finite number");
    const scaled = Math.round(input * 100);
    if (Math.abs(input * 100 - scaled) > 1e-6) {
      throw new Error("parseCents: value has sub-cent precision");
    }
    return scaled;
  }

  const trimmed = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (trimmed === "" || trimmed === "-" || trimmed === ".") {
    throw new Error("parseCents: empty or malformed amount");
  }
  if (!/^-?\d*(\.\d*)?$/.test(trimmed) || trimmed === "") {
    throw new Error(`parseCents: malformed amount "${input}"`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  if (fraction.length > 2) {
    throw new Error("parseCents: more than 2 decimal places");
  }
  const cents =
    Number.parseInt(whole || "0", 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10);
  return negative ? -cents : cents;
}

/** Convert cents to a dollar number. Display only — never feed this back into math. */
export function toDollars(cents: Cents): number {
  return cents / 100;
}

/** Sum a list of cent amounts. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Divide an integer cent amount by an integer divisor, rounding half away
 * from zero. Returns `null` when the divisor is zero so callers must handle
 * the "no basis" case explicitly instead of producing Infinity.
 */
export function divideCents(cents: Cents, divisor: number): Cents | null {
  if (divisor === 0) return null;
  const q = cents / divisor;
  return q < 0 ? -Math.round(-q) : Math.round(q);
}

/**
 * Multiply cents by a milli-rate and a unit count.
 *
 * result = cents * (rate / 1000) * units, rounded half away from zero.
 * Used for per-mile costs: multiplyCents(100_00, milliRate(0.62), 10) === 620
 */
export function multiplyByRate(cents: Cents, rate: RateMilli, units: number): Cents {
  const raw = (cents * rate * units) / RATE_SCALE;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}

/**
 * Split a cent amount across weights without losing or inventing money.
 * The remainder (at most weights.length - 1 cents) is distributed one cent
 * at a time to the largest fractional remainders.
 */
export function allocateCents(cents: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    const even = Math.floor(cents / weights.length);
    const remainder = cents - even * weights.length;
    return weights.map((_, i) => even + (i < remainder ? 1 : 0));
  }

  const exact = weights.map((w) => (cents * w) / totalWeight);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = cents - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  let k = 0;
  while (remainder > 0 && order.length > 0) {
    out[order[k % order.length].i] += 1;
    remainder -= 1;
    k += 1;
  }
  return out;
}

/** Clamp a cent amount at zero (used for net profit floors). */
export function clampNonNegative(cents: Cents): Cents {
  return cents < 0 ? 0 : cents;
}

/** Format cents as a USD string. */
export function formatUSD(cents: Cents, options?: { sign?: boolean }): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-US");
  const body = `$${grouped}.${remainder}`;
  if (negative) return `-${body}`;
  if (options?.sign) return `+${body}`;
  return body;
}

/** Format cents as a compact USD string, e.g. $1.2k. */
export function formatUSDCompact(cents: Cents): string {
  const negative = cents < 0;
  const dollars = Math.abs(cents) / 100;
  const abs = Math.abs(dollars);
  let body: string;
  if (abs >= 1_000_000) body = `$${(abs / 1_000_000).toFixed(1)}m`;
  else if (abs >= 1_000) body = `$${(abs / 1_000).toFixed(1)}k`;
  else body = `$${abs.toFixed(0)}`;
  return negative ? `-${body}` : body;
}

/**
 * Format a milli-rate as a dollar-per-unit string with sensible precision.
 * milliRate(623) === "0.623"
 */
export function formatRate(rate: RateMilli, unit?: string): string {
  const value = rate / RATE_SCALE;
  const decimals = rate % 10 === 0 ? 2 : 3;
  return `$${value.toFixed(decimals)}${unit ? `/${unit}` : ""}`;
}
