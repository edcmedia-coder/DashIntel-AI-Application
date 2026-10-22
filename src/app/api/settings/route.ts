import { handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { settingsSchema } from "@/lib/validation/schemas";
import { getDriverSettings, saveDriverSettings } from "@/lib/repositories/settings";

export async function GET() {
  return handle(async () => {
    const ctx = await requireDriver();
    const settings = await getDriverSettings(ctx.driver.id);
    return ok({ settings });
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(settingsSchema, body);
    const settings = await saveDriverSettings(ctx.driver.id, input);
    return ok({ settings });
  });
}
