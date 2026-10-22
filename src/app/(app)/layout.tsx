import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionContext } from "@/lib/auth/session";
import { DesktopSidebar, MobileTabBar, Mark } from "@/components/nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar
        displayName={ctx.driver.displayName}
        householdName={ctx.household.name}
        role={ctx.driver.role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-base/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Mark className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-[14px] font-bold tracking-tight">DashIntel AI</div>
              <div className="text-[10px] text-ink-dim">Smarter dashes. Bigger profits.</div>
            </div>
          </div>
          <div className="hidden text-[12px] text-ink-dim lg:block">
            {ctx.household.name} · {ctx.driver.displayName}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
              {ctx.driver.displayName}
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink-dim transition-colors hover:border-bad/40 hover:text-bad lg:hidden"
              >
                Exit
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
