import { destroySession } from "@/lib/auth/session";
import { handle, ok } from "@/lib/api";

export async function POST() {
  return handle(async () => {
    await destroySession();
    return ok({ signedOut: true });
  });
}
