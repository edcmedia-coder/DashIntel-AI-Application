import type { ReactNode } from "react";
import type { DataLabel } from "@/lib/domain/labels";
import { LABEL_META } from "@/lib/domain/labels";

/**
 * DashIntel UI primitives.
 *
 * Small, accessible, dependency-free building blocks shared by every screen.
 * The visual language: deep black surfaces, hairline borders, electric blue
 * accents, and an explicit provenance label on every number that has one.
 */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("di-card p-4 sm:p-5", className)}>{children}</Tag>;
}

export function SectionHeading({
  title,
  action,
  description,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-snug text-ink-dim">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-line-soft", className)} />;
}

/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

const LABEL_TONE: Record<string, string> = {
  good: "border-good/35 bg-good/10 text-good",
  info: "border-brand/40 bg-brand/10 text-cyan",
  warn: "border-warn/35 bg-warn/10 text-warn",
  bad: "border-bad/35 bg-bad/10 text-bad",
  muted: "border-line bg-panel text-ink-dim",
};

export function DataBadge({
  label,
  title,
  className,
}: {
  label: DataLabel;
  title?: string;
  className?: string;
}) {
  const meta = LABEL_META[label];
  return (
    <span
      title={title ?? meta.detail}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-[0.12em] uppercase",
        LABEL_TONE[meta.tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" | "none" }) {
  const map = {
    high: { text: "High confidence", className: "text-good" },
    medium: { text: "Medium confidence", className: "text-cyan" },
    low: { text: "Low confidence", className: "text-warn" },
    none: { text: "No confidence band", className: "text-ink-dim" },
  } as const;
  return (
    <span className={cn("text-[11px] font-medium", map[level].className)}>
      {map[level].text}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  sub,
  dataLabel,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  dataLabel?: DataLabel;
  tone?: "default" | "good" | "warn" | "bad";
  className?: string;
}) {
  const valueTone =
    tone === "good"
      ? "text-good"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : "text-ink";

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5">
        <span className="di-label truncate">{label}</span>
        {dataLabel ? <DataBadge label={dataLabel} /> : null}
      </div>
      <div className={cn("tnum mt-1 text-2xl leading-none font-semibold tracking-tight", valueTone)}>
        {value}
      </div>
      {sub ? <div className="mt-1.5 text-[12px] leading-snug text-ink-dim">{sub}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-brand text-white shadow-[0_6px_24px_-10px_rgba(0,140,255,0.9)] hover:bg-cyan active:bg-brand",
    secondary:
      "border border-line bg-panel text-ink hover:border-line-strong hover:bg-elevated active:bg-surface",
    ghost: "text-ink-muted hover:bg-panel hover:text-ink",
    danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20",
  };
  const sizes = {
    sm: "h-9 px-3 text-[13px]",
    md: "h-11 px-4 text-sm",
    lg: "h-13 px-5 text-[15px]",
  } as const;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="di-label mb-1.5 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-dim">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL_BASE =
  "w-full rounded-xl border border-line bg-base/70 px-3 text-[15px] text-ink placeholder:text-ink-dim/70 transition-colors focus:border-brand focus:outline-none disabled:opacity-50";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_BASE, "h-11", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL_BASE, "h-11 appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_BASE, "min-h-20 py-2.5", className)} {...props} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink-dim">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-brand bg-brand" : "border-line bg-panel",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-panel text-ink-dim">
          {icon}
        </div>
      ) : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-dim">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-panel/80", className)}
      aria-hidden="true"
    />
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand/30 bg-brand/8 text-cyan",
    warn: "border-warn/30 bg-warn/8 text-warn",
    bad: "border-bad/30 bg-bad/8 text-bad",
    good: "border-good/30 bg-good/8 text-good",
  } as const;
  return (
    <div className={cn("rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed", tones[tone])}>
      {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
      {children}
    </div>
  );
}

/** Horizontal proportion bar used in the insight charts. */
export function ProportionBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-panel">
        {total > 0
          ? segments.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                className="h-full"
                style={{ width: `${(Math.max(0, s.value) / total) * 100}%`, background: s.color }}
              />
            ))
          : null}
      </div>
    </div>
  );
}
