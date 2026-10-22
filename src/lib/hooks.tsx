"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Loader className="animate-spin text-cyan" size={18} />
    </div>
  );
}

export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    setLoading(true);
    setError(null);
    fn(ctrl.signal)
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

export function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  return fetch(input, init).then(async (res) => {
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
    }
    return json;
  });
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
}

export function formatMiles(miles: number): string {
  return `${miles.toLocaleString("en-US", { maximumFractionDigits: 1 })} mi`;
}

export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })}h`;
}

export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function useRedirectOnUnauth(error: string | null) {
  const router = useRouter();
  useEffect(() => {
    if (error === "You need to sign in to do that.") {
      router.push("/login");
    }
  }, [error, router]);
}
