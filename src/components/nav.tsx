"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Gauge,
  LogOut,
  Receipt,
  Settings as SettingsIcon,
  Target,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "./ui/primitives";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: Gauge },
  { href: "/shifts", label: "Shifts", Icon: Truck },
  { href: "/deliveries", label: "Deliveries", Icon: Activity },
  { href: "/expenses", label: "Expenses", Icon: Receipt },
  { href: "/offers", label: "Offers", Icon: Target },
  { href: "/insights", label: "Insights", Icon: Wallet },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const items = NAV.slice(0, 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors",
                  active ? "text-cyan" : "text-ink-dim hover:text-ink-muted",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span>{label}</span>
                {active ? (
                  <span className="absolute top-0 h-0.5 w-10 rounded-full bg-brand" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopSidebar({
  displayName,
  householdName,
  role,
}: {
  displayName: string;
  householdName: string;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/60 lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Mark />
        <div className="min-w-0">
          <div className="truncate text-[15px] leading-tight font-bold tracking-tight">DashIntel AI</div>
          <div className="truncate text-[11px] text-ink-dim">Smarter dashes. Bigger profits.</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3" aria-label="Primary">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand/12 text-cyan shadow-[inset_0_0_0_1px_rgba(0,140,255,0.28)]"
                  : "text-ink-muted hover:bg-panel hover:text-ink",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Users size={14} className="text-cyan" />
            <span className="truncate">{householdName}</span>
          </div>
          <div className="mt-1 truncate text-[12px] text-ink-dim">
            {displayName} · {role}
          </div>
        </div>
        <form action="/api/auth/logout" method="post" className="mt-2">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-dim transition-colors hover:bg-panel hover:text-bad"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 shadow-[inset_0_0_0_1px_rgba(0,140,255,0.4)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 17.5 9.2 6.6a1 1 0 0 1 1.7 0L17 15"
          stroke="#19B5FF"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M3 17.5h11" stroke="#008CFF" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="18.5" cy="17.5" r="3" fill="#19B5FF" />
      </svg>
    </span>
  );
}
