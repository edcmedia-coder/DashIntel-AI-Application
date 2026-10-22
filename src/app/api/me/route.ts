import { getSessionContext } from "@/lib/auth/session";

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) {
    return Response.json({ error: "You need to sign in to do that." }, { status: 401 });
  }
  return Response.json({
    driver: {
      id: ctx.driver.id,
      displayName: ctx.driver.displayName,
      email: ctx.driver.email,
      role: ctx.driver.role,
    },
    household: {
      id: ctx.household.id,
      name: ctx.household.name,
      inviteCode: ctx.household.inviteCode,
    },
  });
}
