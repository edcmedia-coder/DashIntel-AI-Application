import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { deliveries } from "@/lib/db/schema";
import { parseCents } from "@/lib/domain/money";
import { ApiError, handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { updateDeliverySchema } from "@/lib/validation/schemas";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const ctx = await requireDriver();
    const { id } = await params;
    const body = parseJsonBody(request);
    const input = parseBody(updateDeliverySchema, body);

    const db = await getDb();
    const existing = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    const delivery = existing[0];
    if (!delivery || delivery.driverId !== ctx.driver.id) {
      throw new ApiError(404, "Delivery not found.");
    }

    const patch: Partial<typeof deliveries.$inferInsert> = {};

    if (input.reference !== undefined) {
      const dup = await db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.driverId, ctx.driver.id),
            eq(deliveries.reference, input.reference),
          ),
        )
        .limit(2);
      if (dup.some((d) => d.id !== id)) {
        throw new ApiError(409, `Order ${input.reference} is already logged.`);
      }
      patch.reference = input.reference;
    }

    try {
      if (input.basePay !== undefined) patch.basePayCents = parseCents(input.basePay);
      if (input.tip !== undefined) patch.tipCents = parseCents(input.tip);
      if (input.bonus !== undefined) patch.bonusCents = parseCents(input.bonus);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Invalid money amount.");
    }

    if (input.merchantName !== undefined) patch.merchantName = input.merchantName;
    if (input.merchantAddress !== undefined) patch.merchantAddress = input.merchantAddress;
    if (input.dropoffAddress !== undefined) patch.dropoffAddress = input.dropoffAddress;
    if (input.customerLabel !== undefined) patch.customerLabel = input.customerLabel;
    if (input.shiftId !== undefined) patch.shiftId = input.shiftId;
    if (input.pickupAt !== undefined) patch.pickupAt = input.pickupAt;
    if (input.dropoffAt !== undefined) patch.dropoffAt = input.dropoffAt;
    if (input.distanceMiles !== undefined) patch.distanceMiles = input.distanceMiles;
    if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes;
    if (input.itemsCount !== undefined) patch.itemsCount = input.itemsCount;
    if (input.status !== undefined) patch.status = input.status;
    if (input.notes !== undefined) patch.notes = input.notes;

    await db.update(deliveries).set(patch).where(eq(deliveries.id, id));

    const rows = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    return ok({ delivery: rows[0] });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const ctx = await requireDriver();
    const { id } = await params;
    const db = await getDb();
    const existing = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    if (!existing[0] || existing[0].driverId !== ctx.driver.id) {
      throw new ApiError(404, "Delivery not found.");
    }
    await db.delete(deliveries).where(eq(deliveries.id, id));
    return ok({ deleted: true });
  });
}
