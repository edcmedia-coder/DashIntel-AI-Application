import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** scrypt work factors. N=2^15 keeps verification ~80ms on modern server CPUs. */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

const PREFIX = "scrypt";

/**
 * Hash a password. Format: `scrypt$N$r$p$<salt-b64>$<hash-b64>`.
 * Uses only Node's built-in crypto — no native addon, no third-party secret.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAXMEM,
  });
  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** Verify a password against a stored hash. Never throws on malformed input. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const N = Number.parseInt(parts[1] ?? "", 10);
  const r = Number.parseInt(parts[2] ?? "", 10);
  const p = Number.parseInt(parts[3] ?? "", 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (N < 2 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4] ?? "", "base64");
    expected = Buffer.from(parts[5] ?? "", "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Minimum viable password strength. */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 10) issues.push("Use at least 10 characters.");
  if (!/[a-z]/.test(password)) issues.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) issues.push("Add an uppercase letter.");
  if (!/[0-9]/.test(password)) issues.push("Add a number.");
  return issues;
}
