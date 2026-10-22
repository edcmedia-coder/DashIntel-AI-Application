import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export default async function Home() {
  const ctx = await getSessionContext();
  redirect(ctx ? "/dashboard" : "/login");
}
