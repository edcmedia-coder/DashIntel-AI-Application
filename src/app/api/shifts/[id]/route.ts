import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { shifts } from "@/lib/db/schema";
import { ApiError, handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { updateShiftSchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const ctx = await requireDriver();
    const { id } = await params;
    const body = parseJsonBody(request);
    const input = parseBody(updateShiftSchema, body);

    const db = await getDb();
    const existing = await db
      .select()
      .from(shifts)
      .where(eq(shifts.id, id))
      .limit(1);
    const shift = existing[0];

    if (!shift || shift.driverId !== ctx.driver.id) {
      throw new ApiError(404, "Shift not found.");
    }

    const endedAt = input.endedAt ?? (input.status === "closed" ? new Date().toISOString() : undefined);

    if (endedAt && shift.startedAt && new Date(endedAt) < new Date(shift.startedAt)) {
      throw new ApiError(400, "The shift cannot end before it started.");
    }

    await db
      .update(shifts)
      .set({
        ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
        ...(endedAt !== undefined && input.endedAt === undefined ? { endedAt } : {}),
        ...(input.endOdometerMiles !== undefined
          ? { endOdometerMiles: input.endOdometerMiles }
          : {}),
        ...(input.startOdometerMiles !== undefined
          ? { startOdometerMiles: input.startOdometerMiles }
          : {}),
        ...(input.idleMinutes !== undefined ? { idleMinutes: input.idleMinutes } : {}),
        ...(input.personalMiles !== undefined ? { personalMiles: input.personalMiles } : {}),
        ...(input.baseLocation !== undefined ? { baseLocation: input.baseLocation } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      .where(eq(shifts.id, id));

    const rows = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    return ok({ shift: rows[0] });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const ctx = await requireDriver();
    const { id } = await params;
    const db = await getDb();
    const existing = await db.select().from(shifts).where(eq(shifts.id, id)).limit(1);
    if (!existing[0] || existing[0].driverId !== ctx.driver.id) {
      throw new ApiError(404, "Shift not found.");
    }
    await db.delete(shifts).where(eq(shifts.id, id));
    return ok({ deleted: true });
  });
}
