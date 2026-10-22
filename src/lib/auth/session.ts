import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { drivers, households, sessions, type Driver, type Household } from "@/lib/db/schema";

export const SESSION_COOKIE = "di_session";
const SESSION_TTL_DAYS = 30;

/** Raw token handed to the browser. Only its SHA-256 digest is persisted. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionContext {
  driver: Driver;
  household: Household;
  sessionId: string;
}

export async function createSession(
  driverId: string,
  meta?: { userAgent?: string | null },
): Promise<string> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);

  await db.insert(sessions).values({
    id: hashToken(token),
    driverId,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    userAgent: meta?.userAgent?.slice(0, 255) ?? null,
  });

  return token;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86_400,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

/** Resolve the current session, or null when signed out / expired. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const row = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      driverId: drivers.id,
      driverEmail: drivers.email,
      driverDisplayName: drivers.displayName,
      driverRole: drivers.role,
      driverColorKey: drivers.colorKey,
      driverIsActive: drivers.isActive,
      driverCreatedAt: drivers.createdAt,
      householdId: households.id,
      householdName: households.name,
      householdInviteCode: households.inviteCode,
      householdCreatedAt: households.createdAt,
    })
    .from(sessions)
    .innerJoin(drivers, eq(sessions.driverId, drivers.id))
    .innerJoin(households, eq(drivers.householdId, households.id))
    .where(eq(sessions.id, hashToken(token)))
    .limit(1);

  const found = row[0];
  if (!found) return null;
  if (new Date(found.expiresAt).getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, found.sessionId));
    return null;
  }
  if (!found.driverIsActive) return null;

  const driver: Driver = {
    id: found.driverId,
    householdId: found.householdId,
    email: found.driverEmail,
    passwordHash: "",
    displayName: found.driverDisplayName,
    role: found.driverRole,
    colorKey: found.driverColorKey,
    isActive: found.driverIsActive,
    createdAt: found.driverCreatedAt,
  };
  const household: Household = {
    id: found.householdId,
    name: found.householdName,
    inviteCode: found.householdInviteCode,
    createdAt: found.householdCreatedAt,
  };

  return { driver, household, sessionId: found.sessionId };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  await clearSessionCookie();
}

/** Remove expired sessions. Safe to call from a cron or on login. */
export async function pruneExpiredSessions(): Promise<void> {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.delete(sessions).where(lte(sessions.expiresAt, nowIso));
}
