/**
 * Standalone migration runner.
 *
 *   npm run db:migrate
 *
 * The app also migrates lazily on first database access, so a fresh clone
 * works with a single `npm run dev`. This script exists for CI and for
 * deployments where the database is managed out-of-band.
 */
import { dbKind, getDb } from "./client";

async function main() {
  const db = await getDb();
  const kind = dbKind();
  console.log(`[dashintel] migrations applied (${kind})`);
  // Touch the db handle so TS does not flag it as unused in strict mode.
  void db;
}

main().catch((err) => {
  console.error("[dashintel] migration failed:", err);
  process.exit(1);
});
