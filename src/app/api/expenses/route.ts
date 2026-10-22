import { nanoid } from "nanoid";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { drivers, expenseShares, expenses } from "@/lib/db/schema";
import { parseCents } from "@/lib/domain/money";
import { ApiError, handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { expenseSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(expenseSchema, body);

    const db = await getDb();

    let amountCents: number;
    try {
      amountCents = parseCents(input.amount);
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Invalid amount.");
    }
    if (amountCents <= 0) {
      throw new ApiError(400, "Expense amount must be greater than zero.");
    }

    // Only household members can be selected as share recipients.
    const shareIds = Array.from(new Set(input.shareWithDriverIds ?? [])).filter(
      (id) => id !== ctx.driver.id,
    );
    let members: { id: string }[] = [];
    if (shareIds.length > 0) {
      members = await db
        .select({ id: drivers.id })
        .from(drivers)
        .where(inArray(drivers.id, shareIds));
      if (members.length !== shareIds.length) {
        throw new ApiError(400, "One of the selected drivers is not in your household.");
      }
    }

    const id = nanoid();
    await db.insert(expenses).values({
      id,
      driverId: ctx.driver.id,
      shiftId: input.shiftId ?? null,
      category: input.category,
      amountCents,
      occurredAt: input.occurredAt,
      vendor: input.vendor ?? null,
      note: input.note ?? null,
      odometerMiles: input.odometerMiles ?? null,
      isBusinessMile: input.isBusinessMile === false ? 0 : 1,
      createdAt: new Date().toISOString(),
    });

    if (shareIds.length > 0) {
      // Split the amount evenly, distributing the remainder so the shares sum
      // exactly to the expense total — the expense is never counted twice and
      // never partially lost.
      const count = shareIds.length + 1;
      const base = Math.floor(amountCents / count);
      let remainder = amountCents - base * count;
      const shareRows = shareIds.map((driverId) => {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        return { expenseId: id, driverId, shareCents: base + extra };
      });
      await db.insert(expenseShares).values(shareRows);
    }

    const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    return ok({ expense: rows[0], sharedWith: shareIds }, 201);
  });
}
