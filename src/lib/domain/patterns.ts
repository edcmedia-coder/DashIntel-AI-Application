import { type Cents, type RateMilli } from "./money";

/**
 * Pattern learning from the driver's OWN history.
 *
 * Every function here is deterministic and returns "no data" rather than a
 * guess when the sample is too small.
 */

export interface PerformanceBucket {
  key: string;
  label: string;
  sampleSize: number;
  totalGrossCents: Cents;
  averageGrossCents: Cents | null;
  averageMinutes: number | null;
  averageMiles: number | null;
  /** milli-cents per hour */
  averageNetPerHourMilli: number | null;
  /** milli-cents per mile */
  averageNetPerMileMilli: number | null;
}

export interface HistoricalDelivery {
  pickupAt: string;
  dropoffAt: string | null;
  merchantName: string;
  basePayCents: Cents;
  tipCents: Cents;
  bonusCents: Cents;
  distanceMiles: number | null;
  durationMinutes: number | null;
  status: "completed" | "cancelled";
  /** Net cents attributed to this delivery, cents. */
  netCents: Cents | null;
}

export const MIN_SAMPLE = 5;

export function grossOf(d: HistoricalDelivery): Cents {
  return d.basePayCents + d.tipCents + d.bonusCents;
}

function summarise(
  key: string,
  label: string,
  items: HistoricalDelivery[],
): PerformanceBucket {
  const completed = items.filter((d) => d.status === "completed");
  const sampleSize = completed.length;
  const totalGrossCents = completed.reduce((acc, d) => acc + grossOf(d), 0);

  const minutes = completed
    .map((d) => d.durationMinutes)
    .filter((v): v is number => v !== null);
  const miles = completed
    .map((d) => d.distanceMiles)
    .filter((v): v is number => v !== null);
  const nets = completed
    .map((d) => d.netCents)
    .filter((v): v is number => v !== null);

  const averageNetPerHourMilli =
    nets.length > 0 && minutes.length > 0
      ? Math.round((nets.reduce((a, b) => a + b, 0) * 60_000) / Math.max(1, minutes.reduce((a, b) => a + b, 0)))
      : null;

  const averageNetPerMileMilli =
    nets.length > 0 && miles.length > 0
      ? Math.round((nets.reduce((a, b) => a + b, 0) * 1000) / Math.max(1, miles.reduce((a, b) => a + b, 0)))
      : null;

  return {
    key,
    label,
    sampleSize,
    totalGrossCents,
    averageGrossCents: sampleSize > 0 ? Math.round(totalGrossCents / sampleSize) : null,
    averageMinutes:
      minutes.length > 0
        ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
        : null,
    averageMiles:
      miles.length > 0 ? Number((miles.reduce((a, b) => a + b, 0) / miles.length).toFixed(1)) : null,
    averageNetPerHourMilli,
    averageNetPerMileMilli,
  };
}

export function daypartOf(hour: number): { key: string; label: string } {
  if (hour < 6) return { key: "overnight", label: "Overnight (12am–6am)" };
  if (hour < 11) return { key: "breakfast", label: "Breakfast (6am–11am)" };
  if (hour < 15) return { key: "lunch", label: "Lunch (11am–3pm)" };
  if (hour < 20) return { key: "dinner", label: "Dinner (3pm–8pm)" };
  if (hour < 24) return { key: "late", label: "Late night (8pm–12am)" };
  return { key: "overnight", label: "Overnight (12am–6am)" };
}

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function performanceByHour(deliveries: HistoricalDelivery[]): PerformanceBucket[] {
  const buckets = new Map<number, HistoricalDelivery[]>();
  for (const d of deliveries) {
    const hour = new Date(d.pickupAt).getHours();
    const list = buckets.get(hour) ?? [];
    list.push(d);
    buckets.set(hour, list);
  }
  return Array.from({ length: 24 }, (_, hour) =>
    summarise(
      String(hour).padStart(2, "0"),
      `${String(hour).padStart(2, "0")}:00 – ${String(hour).padStart(2, "0")}:59`,
      buckets.get(hour) ?? [],
    ),
  );
}

export function performanceByDaypart(deliveries: HistoricalDelivery[]): PerformanceBucket[] {
  const buckets = new Map<string, HistoricalDelivery[]>();
  for (const d of deliveries) {
    const part = daypartOf(new Date(d.pickupAt).getHours());
    const list = buckets.get(part.key) ?? [];
    list.push(d);
    buckets.set(part.key, list);
  }
  return Array.from(buckets.entries()).map(([key, items]) => {
    const part = daypartOf(new Date(items[0]!.pickupAt).getHours());
    return summarise(key, part.label, items);
  });
}

export function performanceByWeekday(deliveries: HistoricalDelivery[]): PerformanceBucket[] {
  const buckets = new Map<number, HistoricalDelivery[]>();
  for (const d of deliveries) {
    const day = new Date(d.pickupAt).getDay();
    const list = buckets.get(day) ?? [];
    list.push(d);
    buckets.set(day, list);
  }
  return Array.from({ length: 7 }, (_, day) =>
    summarise(String(day), WEEKDAY_LABELS[day] ?? "Unknown", buckets.get(day) ?? []),
  );
}

export function performanceByMerchant(
  deliveries: HistoricalDelivery[],
  limit = 8,
): PerformanceBucket[] {
  const buckets = new Map<string, HistoricalDelivery[]>();
  for (const d of deliveries) {
    const key = d.merchantName.trim() || "Unnamed merchant";
    const list = buckets.get(key) ?? [];
    list.push(d);
    buckets.set(key, list);
  }
  return Array.from(buckets.entries())
    .map(([key, items]) => summarise(key, key, items))
    .sort((a, b) => b.sampleSize - a.sampleSize)
    .slice(0, limit);
}

/**
 * Time-of-day multiplier derived from the driver's own history.
 * Returns 1 when the sample for that hour is too small to trust.
 */
export function hourMultiplier(
  deliveries: HistoricalDelivery[],
  hour: number,
  minSample = MIN_SAMPLE,
): { multiplier: number; fromHistory: boolean; sampleSize: number } {
  const hourly = performanceByHour(deliveries);
  const bucket = hourly[hour];
  const overall = summarise("all", "All", deliveries);

  if (!bucket || bucket.sampleSize < minSample || !bucket.averageNetPerHourMilli) {
    return { multiplier: 1, fromHistory: false, sampleSize: bucket?.sampleSize ?? 0 };
  }
  if (!overall.averageNetPerHourMilli || overall.averageNetPerHourMilli <= 0) {
    return { multiplier: 1, fromHistory: false, sampleSize: bucket.sampleSize };
  }

  const multiplier = bucket.averageNetPerHourMilli / overall.averageNetPerHourMilli;
  // Clamp so a single outlier hour cannot produce a 10× recommendation.
  const clamped = Math.min(1.6, Math.max(0.6, multiplier));
  return { multiplier: Number(clamped.toFixed(3)), fromHistory: true, sampleSize: bucket.sampleSize };
}

/**
 * Median of a numeric series. Used for baselines because a single outlier
 * delivery must not redefine the driver's normal rate.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Median net per active hour from the driver's own deliveries. */
export function baselineNetPerHour(deliveries: HistoricalDelivery[]): {
  value: number | null;
  sampleSize: number;
} {
  const rates: number[] = [];
  for (const d of deliveries) {
    if (d.status !== "completed") continue;
    if (d.netCents === null || d.durationMinutes === null || d.durationMinutes <= 0) continue;
    rates.push((d.netCents * 60_000) / d.durationMinutes);
  }
  const value = median(rates);
  return { value: value === null ? null : Math.round(value), sampleSize: rates.length };
}

/** Median net per business mile from the driver's own deliveries. */
export function baselineNetPerMile(deliveries: HistoricalDelivery[]): {
  value: number | null;
  sampleSize: number;
} {
  const rates: number[] = [];
  for (const d of deliveries) {
    if (d.status !== "completed") continue;
    if (d.netCents === null || d.distanceMiles === null || d.distanceMiles <= 0) continue;
    rates.push((d.netCents * 1000) / d.distanceMiles);
  }
  const value = median(rates);
  return { value: value === null ? null : Math.round(value), sampleSize: rates.length };
}

export interface Insight {
  id: string;
  title: string;
  detail: string;
  tone: "good" | "warn" | "bad" | "info";
  /** A FORECAST insight projects; a CALCULATED insight reports history. */
  label: "CALCULATED" | "FORECAST" | "ESTIMATED";
  metric?: string;
}

/**
 * Turn the pattern tables into plain-language insights.
 * Every insight states the sample size it was derived from.
 */
export function buildInsights(
  deliveries: HistoricalDelivery[],
  opts: {
    bestHour?: PerformanceBucket | null;
    worstHour?: PerformanceBucket | null;
    bestDaypart?: PerformanceBucket | null;
    bestMerchant?: PerformanceBucket | null;
    worstMerchant?: PerformanceBucket | null;
  },
): Insight[] {
  const insights: Insight[] = [];

  if (deliveries.length < MIN_SAMPLE) {
    insights.push({
      id: "need-data",
      title: "Not enough history yet",
      detail: `Log ${MIN_SAMPLE - deliveries.length} more ${
        MIN_SAMPLE - deliveries.length === 1 ? "delivery" : "deliveries"
      } and DashIntel will start ranking your hours, merchants and dayparts.`,
      tone: "info",
      label: "ESTIMATED",
    });
    return insights;
  }

  const { bestHour, worstHour, bestDaypart, bestMerchant, worstMerchant } = opts;

  if (bestHour && bestHour.sampleSize >= MIN_SAMPLE && bestHour.averageNetPerHourMilli) {
    insights.push({
      id: "best-hour",
      title: `${bestHour.label} is your strongest hour`,
      detail: `Across ${bestHour.sampleSize} deliveries you averaged $${(
        bestHour.averageNetPerHourMilli / 1000
      ).toFixed(2)}/hr in this window.`,
      tone: "good",
      label: "CALCULATED",
      metric: `$${(bestHour.averageNetPerHourMilli / 1000).toFixed(2)}/hr`,
    });
  }

  if (worstHour && worstHour.sampleSize >= MIN_SAMPLE && worstHour.averageNetPerHourMilli) {
    insights.push({
      id: "worst-hour",
      title: `${worstHour.label} pays your worst`,
      detail: `Only $${(worstHour.averageNetPerHourMilli / 1000).toFixed(2)}/hr across ${
        worstHour.sampleSize
      } deliveries. Consider repositioning or going home.`,
      tone: "bad",
      label: "CALCULATED",
      metric: `$${(worstHour.averageNetPerHourMilli / 1000).toFixed(2)}/hr`,
    });
  }

  if (bestDaypart && bestDaypart.sampleSize >= MIN_SAMPLE) {
    insights.push({
      id: "best-daypart",
      title: `${bestDaypart.label} outperforms the rest of your day`,
      detail: `${bestDaypart.sampleSize} deliveries averaging $${(
        (bestDaypart.averageGrossCents ?? 0) / 100
      ).toFixed(2)} each and ${bestDaypart.averageMinutes ?? 0} minutes apiece.`,
      tone: "info",
      label: "CALCULATED",
    });
  }

  if (bestMerchant && bestMerchant.sampleSize >= MIN_SAMPLE) {
    insights.push({
      id: "best-merchant",
      title: `${bestMerchant.key} is your best-paying merchant`,
      detail: `${bestMerchant.sampleSize} deliveries averaging $${(
        (bestMerchant.averageGrossCents ?? 0) / 100
      ).toFixed(2)} gross.`,
      tone: "good",
      label: "CALCULATED",
    });
  }

  if (
    worstMerchant &&
    worstMerchant.sampleSize >= MIN_SAMPLE &&
    worstMerchant.key !== bestMerchant?.key
  ) {
    insights.push({
      id: "worst-merchant",
      title: `${worstMerchant.key} underperforms`,
      detail: `${worstMerchant.sampleSize} deliveries averaging $${(
        (worstMerchant.averageGrossCents ?? 0) / 100
      ).toFixed(2)} gross. Worth checking whether the wait time is worth it.`,
      tone: "warn",
      label: "CALCULATED",
    });
  }

  return insights;
}
