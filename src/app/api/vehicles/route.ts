import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { vehicles } from "@/lib/db/schema";
import { ApiError, handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { vehicleSchema, vehicleUpdateSchema } from "@/lib/validation/schemas";
import {
  getVehicle,
  listVehicles,
  vehicleFromInput,
} from "@/lib/repositories/vehicles";

export async function GET() {
  return handle(async () => {
    const ctx = await requireDriver();
    const rows = await listVehicles(ctx.household.id);
    return ok({ vehicles: rows });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(vehicleSchema, body);

    const db = await getDb();
    const id = nanoid();
    const values = vehicleFromInput(input, null);

    await db.insert(vehicles).values({
      id,
      householdId: ctx.household.id,
      driverId: ctx.driver.id,
      ...values,
      createdAt: new Date().toISOString(),
    });

    const row = await getVehicle(ctx.household.id, id);
    return ok({ vehicle: row }, 201);
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(vehicleUpdateSchema, body);

    const existing = await getVehicle(ctx.household.id, input.id);
    if (!existing) throw new ApiError(404, "Vehicle not found.");

    const db = await getDb();
    const values = vehicleFromInput(
      { label: input.label ?? existing.label, ...input },
      existing,
    );

    await db.update(vehicles).set(values).where(eq(vehicles.id, input.id));

    const row = await getVehicle(ctx.household.id, input.id);
    return ok({ vehicle: row });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const vehicleId = new URL(request.url).searchParams.get("id");
    if (!vehicleId) throw new ApiError(400, "Vehicle id is required.");

    const existing = await getVehicle(ctx.household.id, vehicleId);
    if (!existing) throw new ApiError(404, "Vehicle not found.");

    const db = await getDb();
    await db.delete(vehicles).where(and(eq(vehicles.id, vehicleId)));
    return ok({ deleted: true });
  });
}
