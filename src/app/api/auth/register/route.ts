import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/client";
import { drivers, households } from "@/lib/db/schema";
import { hashPassword, passwordIssues } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { ApiError, handle, ok, parseBody, parseJsonBody } from "@/lib/api";
import { registerSchema } from "@/lib/validation/schemas";

const COLOR_KEYS = ["brand", "cyan", "violet", "amber", "emerald", "rose"];

export async function POST(request: Request) {
  return handle(async () => {
    const body = parseJsonBody(request);
    const input = parseBody(registerSchema, body);

    const weak = passwordIssues(input.password);
    if (weak.length > 0) {
      throw new ApiError(400, "Password is not strong enough.", weak);
    }

    const db = await getDb();

    const existing = await db
      .select({ id: drivers.id, displayName: drivers.displayName, householdId: drivers.householdId })
      .from(drivers)
      .where(eq(drivers.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      // Joining an existing household is allowed via invite code; a plain
      // signup with a taken email is not.
      if (!input.joinCode) {
        throw new ApiError(
          409,
          "That email already has an account. Sign in, or use the household invite code to join.",
        );
      }
    }

    let householdId: string;
    let role = "owner";
    let displayName = input.displayName;

    if (input.joinCode) {
      const matched = await db
        .select()
        .from(households)
        .where(eq(households.inviteCode, input.joinCode.toUpperCase()))
        .limit(1);
      const household = matched[0];
      if (!household) throw new ApiError(404, "That household invite code was not found.");
      householdId = household.id;
      role = "member";
    } else {
      const household = {
        id: nanoid(),
        name: input.householdName,
        inviteCode: nanoid(8).toUpperCase().replace(/[^A-Z0-9]/g, "X"),
        createdAt: new Date().toISOString(),
      };
      await db.insert(households).values(household);
      householdId = household.id;
    }

    const alreadyInHousehold = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.email, input.email))
      .limit(1);

    if (alreadyInHousehold.length > 0) {
      throw new ApiError(409, "That email already has an account. Sign in instead.");
    }

    const passwordHash = await hashPassword(input.password);
    const driverId = nanoid();
    const colorKey = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)] ?? "brand";

    await db.insert(drivers).values({
      id: driverId,
      householdId,
      email: input.email,
      passwordHash,
      displayName,
      role,
      colorKey,
      isActive: 1,
      createdAt: new Date().toISOString(),
    });

    const token = await createSession(driverId, {
      userAgent: request.headers.get("user-agent"),
    });
    await setSessionCookie(token);

    const householdRow = await db
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .limit(1);

    return ok(
      {
        driver: { id: driverId, displayName, email: input.email, role },
        household: householdRow[0] ?? null,
      },
      201,
    );
  });
}
