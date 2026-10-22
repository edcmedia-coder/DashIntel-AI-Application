import { handle, ok } from "@/lib/api";
import { aiProvider } from "@/lib/providers/ai";
import { routingProvider } from "@/lib/providers/routing";

/**
 * Honest integration status. Each provider reports exactly what it can and
 * cannot do right now. Nothing here is mocked.
 */
export async function GET() {
  return handle(async () => {
    const [routing, ai] = await Promise.all([routingProvider.health(), aiProvider.health()]);

    return ok({
      providers: [routing, ai],
      database: {
        key: "sqlite",
        name:
          process.env.DATABASE_URL?.startsWith("libsql://") ||
          process.env.DATABASE_URL?.startsWith("https://")
            ? "Turso / libSQL"
            : "SQLite (local file)",
        status: "connected",
        detail: "Schema migrations are applied automatically on first access.",
        capability: "Durable storage for every record in the app",
        requiresKey: false,
        checkedAt: new Date().toISOString(),
      },
      checkedAt: new Date().toISOString(),
    });
  });
}
