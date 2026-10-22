import type { DataLabel } from "@/lib/domain/labels";

/**
 * Provider abstraction.
 *
 * Every external capability (routing, geocoding, maps, traffic, AI) is an
 * interface with a well-defined status contract. A provider that cannot be
 * reached reports `unavailable` — it never returns fabricated data, and the
 * app never silently substitutes mock data for a failed integration.
 */

export type ProviderStatus = "connected" | "degraded" | "unavailable" | "not_configured";

export interface ProviderHealth {
  key: string;
  name: string;
  status: ProviderStatus;
  detail: string;
  /** What capability is actually available right now. */
  capability: string;
  requiresKey: boolean;
  checkedAt: string;
  latencyMs?: number | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  /** Optional heading for a driver already en route. */
  bearing?: number | null;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
  dataLabel: DataLabel;
  /** True when the result came from a fallback rather than a live service. */
  isFallback: boolean;
  note?: string;
}

export interface GeocodeRequest {
  query: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  provider: string;
  dataLabel: DataLabel;
  isFallback: boolean;
  note?: string;
}

export interface RouteAlternative {
  id: string;
  label: string;
  distanceMeters: number;
  durationSeconds: number;
  via: LatLng[];
  provider: string;
  dataLabel: DataLabel;
  isFallback: boolean;
  note?: string;
}

export interface RouteComparison {
  alternatives: RouteAlternative[];
  provider: string;
  dataLabel: DataLabel;
  isFallback: boolean;
  /** Distance and time saved vs. the worst alternative. */
  savingsMeters: number;
  savingsSeconds: number;
  note?: string;
}

export interface RoutingProvider {
  readonly key: string;
  readonly name: string;
  readonly requiresKey: boolean;
  route(request: RouteRequest): Promise<RouteResult>;
  alternatives(request: RouteRequest): Promise<RouteComparison>;
  geocode(request: GeocodeRequest): Promise<GeocodeResult>;
  health(): Promise<ProviderHealth>;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProvider {
  readonly key: string;
  readonly name: string;
  readonly requiresKey: boolean;
  readonly model: string | null;
  complete(system: string, user: string): Promise<string>;
  health(): Promise<ProviderHealth>;
}
