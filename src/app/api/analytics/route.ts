import { getSessionContext } from "@/lib/auth/session";
import { getDriverAnalytics } from "@/lib/services/analytics";
import { rangeForPreset } from "@/lib/repositories/driver-data";

export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return Response.json({ error: "You need to sign in to do that." }, { status: 401 });
  }

  const url = new URL(request.url);
  const preset = (url.searchParams.get("preset") ?? "7d") as Parameters<typeof rangeForPreset>[0];
  const range = rangeForPreset(preset);
  const analytics = await getDriverAnalytics(ctx.driver.id, ctx.household.id, range);

  // Serialize to plain JSON (Dates → ISO strings).
  return Response.json(JSON.parse(JSON.stringify(analytics)));
}
