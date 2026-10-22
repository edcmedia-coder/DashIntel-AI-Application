/**
 * Data provenance labels.
 *
 * DashIntel never presents a number without telling the user how much to trust
 * it. Every derived figure carries one of these labels.
 */

export const DATA_LABELS = [
  "VERIFIED",
  "CALCULATED",
  "ESTIMATED",
  "FORECAST",
  "UNAVAILABLE",
] as const;

export type DataLabel = (typeof DATA_LABELS)[number];

export const LABEL_META: Record<
  DataLabel,
  { title: string; detail: string; tone: "good" | "info" | "warn" | "bad" | "muted" }
> = {
  VERIFIED: {
    title: "Verified",
    detail: "Recorded directly from a source you provided or a live API response.",
    tone: "good",
  },
  CALCULATED: {
    title: "Calculated",
    detail: "Derived by deterministic math from your own recorded data.",
    tone: "info",
  },
  ESTIMATED: {
    title: "Estimated",
    detail: "Approximated from assumptions or a fallback source. Treat as a guide.",
    tone: "warn",
  },
  FORECAST: {
    title: "Forecast",
    detail: "A projection based on your historical patterns. Not a guarantee.",
    tone: "warn",
  },
  UNAVAILABLE: {
    title: "Unavailable",
    detail: "No source could supply this value. Nothing was substituted.",
    tone: "muted",
  },
};

export type ConfidenceBand = "high" | "medium" | "low" | "none";

export interface Labelled<T> {
  value: T;
  label: DataLabel;
  confidence: ConfidenceBand;
  note?: string;
}

export function labelled<T>(
  value: T,
  label: DataLabel,
  confidence: ConfidenceBand = "none",
  note?: string,
): Labelled<T> {
  return { value, label, confidence, ...(note ? { note } : {}) };
}

export const CONFIDENCE_META: Record<ConfidenceBand, { title: string; tone: string }> = {
  high: { title: "High confidence", tone: "text-good" },
  medium: { title: "Medium confidence", tone: "text-cyan" },
  low: { title: "Low confidence", tone: "text-warn" },
  none: { title: "No confidence band", tone: "text-ink-dim" },
};
