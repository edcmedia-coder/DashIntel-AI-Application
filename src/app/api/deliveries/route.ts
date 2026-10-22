import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { deliveries } from "@/lib/db/schema";
import { parseCents } from "@/lib/domain/money";
import { ApiError, handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { deliverySchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(deliverySchema, body);

    const db = await getDb();

    const existing = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(and(eq(deliveries.driverId, ctx.driver.id), eq(deliveries.reference, input.reference)))
      .limit(1);
    if (existing.length > 0) {
      throw new ApiError(409, `Order ${input.reference} is already logged.`);
    }

    let basePayCents: number;
    let tipCents: number;
    let bonusCents: number;
    try {
      basePayCents = parseCents(input.basePay);
      tipCents = parseCents(input.tip ?? "0");
      bonusCents = parseCents(input.bonus ?? "0");
    } catch (err) {
      throw new ApiError(
        400,
        err instanceof Error ? err.message : "Invalid money amount.",
      );
    }

    if (basePayCents < 0 || tipCents < 0 || bonusCents < 0) {
      throw new ApiError(400, "Pay, tip and bonus cannot be negative.");
    }

    if (input.dropoffAt && new Date(input.dropoffAt) < new Date(input.pickupAt)) {
      throw new ApiError(400, "Drop-off cannot be before pickup.");
    }

    const id = nanoid();
    await db.insert(deliveries).values({
      id,
      driverId: ctx.driver.id,
      shiftId: input.shiftId ?? null,
      reference: input.reference,
      merchantName: input.merchantName,
      merchantAddress: input.merchantAddress ?? null,
      dropoffAddress: input.dropoffAddress ?? null,
      customerLabel: input.customerLabel ?? null,
      pickupAt: input.pickupAt,
      dropoffAt: input.dropoffAt ?? null,
      basePayCents,
      tipCents,
      bonusCents,
      distanceMiles: input.distanceMiles ?? null,
      durationMinutes: input.durationMinutes ?? null,
      itemsCount: input.itemsCount ?? null,
      status: input.status ?? "completed",
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
    });

    const rows = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    return ok({ delivery: rows[0] }, 201);
  });
}
