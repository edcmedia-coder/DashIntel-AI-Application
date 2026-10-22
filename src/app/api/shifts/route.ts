import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { shifts } from "@/lib/db/schema";
import { handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { startShiftSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(startShiftSchema, body);

    const db = await getDb();

    const all = await db
      .select({ id: shifts.id, status: shifts.status })
      .from(shifts)
      .where(eq(shifts.driverId, ctx.driver.id));
    const active = all.find((s) => s.status === "active");

    if (active) {
      return ok({ error: "A shift is already running.", activeShiftId: active.id }, 409);
    }

    const id = nanoid();
    await db.insert(shifts).values({
      id,
      driverId: ctx.driver.id,
      vehicleId: input.vehicleId ?? null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      startOdometerMiles: input.startOdometerMiles ?? null,
      baseLocation: input.baseLocation ?? null,
      status: "active",
      personalMiles: 0,
      idleMinutes: 0,
      createdAt: new Date().toISOString(),
    });

    const rows = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    return ok({ shift: rows[0] }, 201);
  });
}
