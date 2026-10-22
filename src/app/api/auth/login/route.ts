import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { drivers } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, pruneExpiredSessions, setSessionCookie } from "@/lib/auth/session";
import { ApiError, handle, ok, parseBody, parseJsonBody } from "@/lib/api";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  return handle(async () => {
    const body = parseJsonBody(request);
    const input = parseBody(loginSchema, body);

    const db = await getDb();
    const rows = await db
      .select()
      .from(drivers)
      .where(eq(drivers.email, input.email))
      .limit(1);

    const driver = rows[0];
    // Same message for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate accounts.
    const invalid = new ApiError(401, "Email or password is incorrect.");
    if (!driver) {
      // Spend comparable time so timing does not leak account existence.
      await verifyPassword(input.password, "scrypt$32768$8$1$AAAA$AAAA");
      throw invalid;
    }
    if (!driver.isActive) {
      throw new ApiError(403, "This account has been deactivated.");
    }

    const valid = await verifyPassword(input.password, driver.passwordHash);
    if (!valid) throw invalid;

    await pruneExpiredSessions();
    const token = await createSession(driver.id, {
      userAgent: request.headers.get("user-agent"),
    });
    await setSessionCookie(token);

    return ok({
      driver: {
        id: driver.id,
        displayName: driver.displayName,
        email: driver.email,
        role: driver.role,
      },
    });
  });
}
