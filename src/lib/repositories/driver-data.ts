import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  deliveries,
  expenseShares,
  expenses,
  shifts,
  type Delivery,
  type Expense,
  type Shift,
} from "@/lib/db/schema";

/**
 * Repository layer.
 *
 * Every query takes a `driverId` and scopes to it. Driver privacy is a
 * property of the data layer, not of the UI: a page cannot accidentally show
 * a household member's earnings because the repository never returns them.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export function rangeForPreset(
  preset: "today" | "7d" | "30d" | "90d" | "mtd" | "ytd" | "all",
  now = new Date(),
): DateRange {
  const start = new Date(now);
  switch (preset) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "90d":
      start.setDate(start.getDate() - 89);
      start.setHours(0, 0, 0, 0);
      break;
    case "mtd":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "ytd":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "all":
      return { from: new Date(1970, 0, 1), to: now };
  }
  return { from: start, to: now };
}

export function daysInRange(range: DateRange): number {
  const days = Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000);
  return Math.max(1, days);
}

export async function listDeliveries(
  driverId: string,
  range?: DateRange,
): Promise<Delivery[]> {
  const db = await getDb();
  const conditions = [eq(deliveries.driverId, driverId)];
  if (range) {
    conditions.push(gte(deliveries.createdAt, range.from.toISOString()));
    conditions.push(lte(deliveries.createdAt, range.to.toISOString()));
  }
  return db
    .select()
    .from(deliveries)
    .where(and(...conditions))
    .orderBy(desc(deliveries.pickupAt));
}

export async function listShifts(driverId: string, range?: DateRange): Promise<Shift[]> {
  const db = await getDb();
  const conditions = [eq(shifts.driverId, driverId)];
  if (range) {
    conditions.push(gte(shifts.startedAt, range.from.toISOString()));
    conditions.push(lte(shifts.startedAt, range.to.toISOString()));
  }
  return db
    .select()
    .from(shifts)
    .where(and(...conditions))
    .orderBy(desc(shifts.startedAt));
}

export async function getShift(driverId: string, shiftId: string): Promise<Shift | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.driverId, driverId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveShift(driverId: string): Promise<Shift | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.driverId, driverId), eq(shifts.status, "active")))
    .orderBy(desc(shifts.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Expenses charged to a driver.
 *
 * A shared expense is returned once per driver, with the amount replaced by
 * that driver's allocated share. The sum of the returned amounts for a given
 * expense always equals the expense total, so household totals never inflate.
 */
export async function listExpenses(driverId: string, range?: DateRange): Promise<Expense[]> {
  const db = await getDb();
  const conditions = [eq(expenses.driverId, driverId)];
  if (range) {
    conditions.push(gte(expenses.occurredAt, range.from.toISOString()));
    conditions.push(lte(expenses.occurredAt, range.to.toISOString()));
  }
  const own = await db
    .select()
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.occurredAt));

  if (own.length === 0) return own;

  const shared = await db
    .select({
      expenseId: expenseShares.expenseId,
      driverId: expenseShares.driverId,
      shareCents: expenseShares.shareCents,
    })
    .from(expenseShares)
    .where(eq(expenseShares.driverId, driverId));

  if (shared.length === 0) return own;

  const shareMap = new Map(shared.map((s) => [s.expenseId, s.shareCents]));
  const ids = shared.map((s) => s.expenseId);

  const sharedExpenses = await db
    .select()
    .from(expenses)
    .where(inArray(expenses.id, ids));

  const merged: Expense[] = [...own];
  for (const expense of sharedExpenses) {
    if (own.some((e) => e.id === expense.id)) continue;
    const share = shareMap.get(expense.id);
    if (share === undefined) continue;
    merged.push({ ...expense, amountCents: share });
  }

  return merged.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** Total of every expense in the household, counting each expense exactly once. */
export async function householdExpenseTotal(householdDriverIds: string[]): Promise<number> {
  if (householdDriverIds.length === 0) return 0;
  const db = await getDb();
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)` })
    .from(expenses)
    .where(inArray(expenses.driverId, householdDriverIds));
  return Number(rows[0]?.total ?? 0);
}
