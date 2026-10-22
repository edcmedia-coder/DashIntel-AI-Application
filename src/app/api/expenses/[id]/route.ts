import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { expenses } from "@/lib/db/schema";
import { ApiError, handle, ok, requireDriver } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const ctx = await requireDriver();
    const { id } = await params;
    const db = await getDb();
    const existing = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    if (!existing[0] || existing[0].driverId !== ctx.driver.id) {
      throw new ApiError(404, "Expense not found.");
    }
    await db.delete(expenses).where(eq(expenses.id, id));
    return ok({ deleted: true });
  });
}
