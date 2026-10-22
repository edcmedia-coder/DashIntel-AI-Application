"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  Clock,
  Gauge,
  Plus,
  Receipt,
  Target,
  Truck,
  Wallet,
  Zap,
} from "lucide-react";
import { Alert, Button, Card, DataBadge, EmptyState, SectionHeading, Skeleton, Stat } from "@/components/ui/primitives";
import { fetchJson, formatHours, formatMiles, formatMoney, useAsync, useRedirectOnUnauth } from "@/lib/hooks";
import { VERDICT_META } from "@/lib/domain/offers";

type AnalyticsResponse = {
  profit: {
    grossEarningsCents: number;
    netProfitCents: number;
    totalCostCents: number;
    businessMiles: number;
    activeMinutes: number;
    deliveryCount: number;
    costs: { key: string; label: string; amountCents: number; dataLabel: string; source: string }[];
    averageDeliveryCents: number | null;
    earningsPerActiveHourMilli: number | null;
    profitPerActiveHourMilli: number | null;
    profitPerBusinessMileMilli: number | null;
  };
  tax: {
    netProfitCents: number;
    totalTaxCents: number;
    takeHomeCents: number;
    selfEmploymentTaxCents: number;
    federalIncomeTaxCents: number;
    stateTaxCents: number | null;
    deductibleCostsCents: number;
    mileageAlternative: { betterTakeHome: boolean };
    stateNote: string;
  };
  history: {
    baselineNetPerHourMilli: number | null;
  };
  insights: { id: string; title: string; detail: string; tone: string; label: string }[];
};

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
] as const;

type Preset = (typeof PRESETS)[number]["key"];

export default function CommandDashboard() {
  const [preset, setPreset] = useState<Preset>("7d");
  const { data, loading, error } = useAsync<AnalyticsResponse>(
    (signal) => fetchJson(`/api/analytics?preset=${preset}`, { signal }),
    [preset],
  );
  useRedirectOnUnauth(error);

  const profit = data?.profit;
  const tax = data?.tax;

  const metrics = useMemo(() => {
    if (!profit) return [];
    const earnHr = profit.earningsPerActiveHourMilli;
    const netHr = profit.profitPerActiveHourMilli;
    const netMi = profit.profitPerBusinessMileMilli;
    return [
      {
        label: "Net profit",
        value: formatMoney(profit.netProfitCents),
        sub: `${formatMoney(profit.grossEarningsCents)} gross · ${formatMoney(profit.totalCostCents)} costs`,
        tone: profit.netProfitCents >= 0 ? "good" : "bad",
        dataLabel: "CALCULATED",
      },
      {
        label: "$ / active hr",
        value: earnHr === null ? "—" : `$${(earnHr / 1000).toFixed(2)}`,
        sub: netHr === null ? "Track shifts to compute" : `Net ${(netHr / 1000).toFixed(2)}/hr`,
        tone: "default",
        dataLabel: "CALCULATED",
      },
      {
        label: "$ / business mi",
        value: netMi === null ? "—" : `$${(netMi / 1000).toFixed(2)}`,
        sub: `${formatMiles(profit.businessMiles)} business miles`,
        tone: "default",
        dataLabel: "CALCULATED",
      },
      {
        label: "Avg delivery",
        value:
          profit.averageDeliveryCents === null ? "—" : formatMoney(profit.averageDeliveryCents),
        sub: `${profit.deliveryCount} completed deliveries`,
        tone: "default",
        dataLabel: "CALCULATED",
      },
    ];
  }, [profit]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="di-gradient-text text-2xl font-bold tracking-tight sm:text-3xl">
            Command center
          </h1>
          <p className="mt-1 text-[13px] text-ink-dim">
            Real numbers. Every figure is labeled by provenance.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                preset === p.key ? "bg-brand/15 text-cyan" : "text-ink-dim hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <Alert tone="bad">{error}</Alert> : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-3.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-7 w-24" />
              <Skeleton className="mt-2 h-2.5 w-32" />
            </Card>
          ))}
        </div>
      ) : profit ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {metrics.map((m) => (
            <Card key={m.label} className="p-3.5">
              <Stat {...m} />
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Gauge size={22} />}
            title="No data yet"
            description="Start a shift and log your first delivery to see real profit and efficiency numbers."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/shifts">
                    <Truck size={16} /> Start a shift
                  </Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/deliveries">
                    <Plus size={16} /> Log delivery
                  </Link>
                </Button>
              </div>
            }
          />
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <SectionHeading
            title="Where the money goes"
            description="Costs are labeled CALCULATED or VERIFIED. A group with a recorded expense never duplicates the model."
            action={<DataBadge label="CALCULATED" />}
          />
          {loading || !profit ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : profit.costs.length === 0 ? (
            <p className="text-[13px] text-ink-dim">
              No costs recorded yet. Add a vehicle and expenses to see your true take-home.
            </p>
          ) : (
            <div className="space-y-1.5">
              {profit.costs.map((cost) => (
                <div
                  key={cost.key}
                  className="flex items-center justify-between gap-3 rounded-xl px-1 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] text-ink-muted">{cost.label}</span>
                    <DataBadge label={cost.dataLabel as never} />
                    {cost.source === "modelled" ? (
                      <span className="text-[10px] text-ink-dim">modelled</span>
                    ) : null}
                  </div>
                  <span className="tnum text-[13px] font-medium text-ink">
                    {formatMoney(cost.amountCents)}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
                <span className="text-sm font-semibold text-ink">Total costs</span>
                <span className="tnum text-sm font-semibold text-ink">
                  {formatMoney(profit.totalCostCents)}
                </span>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionHeading
              title="Tax estimate"
              description="Federal 2026 brackets, SE tax, mileage alternative. ESTIMATED."
              action={<DataBadge label="ESTIMATED" />}
            />
            {loading || !tax ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Row label="Net profit (Schedule C)" value={formatMoney(tax.netProfitCents)} />
                <Row label="SE tax" value={formatMoney(tax.selfEmploymentTaxCents)} />
                <Row label="Federal income tax" value={formatMoney(tax.federalIncomeTaxCents)} />
                {tax.stateTaxCents !== null ? (
                  <Row label="State (est.)" value={formatMoney(tax.stateTaxCents)} />
                ) : null}
                <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
                  <span className="text-sm font-semibold text-ink">Total tax (est.)</span>
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatMoney(tax.totalTaxCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-good">Take-home after tax</span>
                  <span className="tnum text-sm font-semibold text-good">
                    {formatMoney(tax.takeHomeCents)}
                  </span>
                </div>
                {tax.mileageAlternative.betterTakeHome ? (
                  <p className="pt-1 text-[12px] text-cyan">
                    The IRS standard mileage alternative looks better for this window.
                  </p>
                ) : null}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Quick actions"
              description="Keep real records. Nothing is simulated."
            />
            <div className="grid grid-cols-2 gap-2">
              <Quick href="/shifts" icon={<Truck size={16} />} label="Shift" />
              <Quick href="/deliveries" icon={<Plus size={16} />} label="Log delivery" />
              <Quick href="/expenses" icon={<Receipt size={16} />} label="Expense" />
              <Quick href="/offers" icon={<Target size={16} />} label="Evaluate offer" />
              <Quick href="/insights" icon={<Wallet size={16} />} label="Insights" />
              <Quick href="/settings" icon={<Gauge size={16} />} label="Setup" />
            </div>
          </Card>

          {data?.insights && data.insights.length > 0 ? (
            <Card>
              <SectionHeading
                title="From your history"
                description="Pulled from your own logged deliveries."
                action={<DataBadge label="CALCULATED" />}
              />
              <div className="space-y-2">
                {data.insights.slice(0, 3).map((insight) => (
                  <Link
                    key={insight.id}
                    href="/insights"
                    className="flex items-start gap-3 rounded-xl border border-line-soft p-3 transition-colors hover:border-line-strong hover:bg-panel"
                  >
                    <Zap size={16} className="mt-0.5 text-cyan" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink">{insight.title}</div>
                      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-dim">
                        {insight.detail}
                      </p>
                    </div>
                    <ChevronRight size={16} className="mt-0.5 text-ink-dim" />
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-ink-dim">{label}</span>
      <span className="tnum text-[13px] text-ink">{value}</span>
    </div>
  );
}

function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl border border-line-soft px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-panel hover:text-ink"
    >
      {icon}
      {label}
      <ArrowRight size={14} className="ml-auto text-ink-dim" />
    </Link>
  );
}
