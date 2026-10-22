import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { Mark } from "@/components/nav";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  const ctx = await getSessionContext();
  if (ctx) redirect("/dashboard");

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="di-grid-bg pointer-events-none absolute inset-0 opacity-30 [mask-image:radial-gradient(70%_60%_at_50%_0%,#000,transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Mark className="h-12 w-12" />
          <h1 className="di-gradient-text mt-4 text-3xl font-bold tracking-tight">Create your household</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
            Set up a shared family account. Each driver keeps their own earnings, expenses and tax
            estimates private.
          </p>
        </div>
        <AuthForm mode="register" />
        <p className="mt-6 text-center text-[13px] text-ink-dim">
          Already set up?{" "}
          <Link href="/login" className="font-semibold text-cyan hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
