import type {
  GeocodeResult,
  LatLng,
  ProviderHealth,
  RouteAlternative,
  RouteComparison,
  RouteRequest,
  RouteResult,
  RoutingProvider,
} from "./types";

/**
 * OSRM-backed routing + Nominatim geocoding.
 *
 * The public OSRM demo server and Nominatim are free and require no API key,
 * which keeps the core application runnable with zero paid configuration.
 * They are rate-limited and must not be used for production traffic — point
 * `OSRM_BASE_URL` / `NOMINATIM_BASE_URL` at your own instances for production.
 *
 * If the network is unreachable the provider falls back to a great-circle
 * distance calculation and labels the result ESTIMATED. It never fabricates a
 * route.
 */

const OSRM_BASE = process.env.OSRM_BASE_URL?.trim() || "https://router.project-osrm.org";
const NOMINATIM_BASE =
  process.env.NOMINATIM_BASE_URL?.trim() || "https://nominatim.openstreetmap.org";
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT?.trim() ||
  "DashIntelAI/1.0 (self-hosted delivery intelligence)";
const TIMEOUT_MS = Number.parseInt(process.env.PROVIDER_TIMEOUT_MS ?? "7000", 10);

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Fallback estimate: straight-line distance inflated by a road-winding factor
 * and a conservative average city speed. Explicitly labelled ESTIMATED.
 */
function fallbackRoute(request: RouteRequest, provider: string, reason: string): RouteResult {
  const meters = haversineMeters(request.origin, request.destination);
  const roadFactor = 1.3;
  const distanceMeters = Math.round(meters * roadFactor);
  const seconds = Math.round((distanceMeters / 1000 / 24) * 3600);
  return {
    distanceMeters,
    durationSeconds: seconds,
    provider,
    dataLabel: "ESTIMATED",
    isFallback: true,
    note: `${reason} Straight-line distance × ${roadFactor} at 24 mph average speed.`,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
}

function osrmUrl(base: string, path: string, query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  return `${base.replace(/\/$/, "")}${path}?${params.toString()}`;
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly key = "osrm";
  readonly name = "OSRM / OpenStreetMap";
  readonly requiresKey = false;

  async route(request: RouteRequest): Promise<RouteResult> {
    const coords = `${request.origin.lng},${request.origin.lat};${request.destination.lng},${request.destination.lat}`;
    try {
      const data = await fetchJson<OsrmResponse>(
        osrmUrl(OSRM_BASE, "/route/v1/driving", { coordinates: coords, overview: "false" }),
      );
      const route = data.routes?.[0];
      if (!route) throw new Error("no route returned");
      return {
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        provider: this.name,
        dataLabel: "VERIFIED",
        isFallback: false,
        note: "Live road route from OSRM.",
      };
    } catch (err) {
      return fallbackRoute(
        request,
        this.name,
        `Routing service unreachable (${err instanceof Error ? err.message : "unknown"}).`,
      );
    }
  }

  async alternatives(request: RouteRequest): Promise<RouteComparison> {
    const coords = `${request.origin.lng},${request.origin.lat};${request.destination.lng},${request.destination.lat}`;
    try {
      const data = await fetchJson<OsrmResponse>(
        osrmUrl(OSRM_BASE, "/route/v1/driving", {
          coordinates: coords,
          overview: "full",
          geometries: "geojson",
          alternatives: "3",
        }),
      );
      const routes = data.routes ?? [];
      if (routes.length === 0) throw new Error("no routes returned");

      const alternatives: RouteAlternative[] = routes.map((route, i) => ({
        id: `route-${i}`,
        label: i === 0 ? "Fastest" : `Alternative ${i}`,
        distanceMeters: Math.round(route.distance),
        durationSeconds: Math.round(route.duration),
        via: (route.geometry?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
        provider: this.name,
        dataLabel: "VERIFIED",
        isFallback: false,
      }));

      const worst = routes[routes.length - 1]!;
      const best = routes[0]!;

      return {
        alternatives,
        provider: this.name,
        dataLabel: "VERIFIED",
        isFallback: false,
        savingsMeters: Math.round(worst.distance - best.distance),
        savingsSeconds: Math.round(worst.duration - best.duration),
        note: `${routes.length} live road alternatives from OSRM.`,
      };
    } catch (err) {
      const fallback = fallbackRoute(
        request,
        this.name,
        `Routing service unreachable (${err instanceof Error ? err.message : "unknown"}).`,
      );
      return {
        alternatives: [
          {
            id: "fallback",
            label: "Estimated route",
            distanceMeters: fallback.distanceMeters,
            durationSeconds: fallback.durationSeconds,
            via: [],
            provider: this.name,
            dataLabel: "ESTIMATED",
            isFallback: true,
            note: fallback.note,
          },
        ],
        provider: this.name,
        dataLabel: "ESTIMATED",
        isFallback: true,
        savingsMeters: 0,
        savingsSeconds: 0,
        note:
          fallback.note ??
          "Routing service unreachable — only an estimated distance is available.",
      };
    }
  }

  async geocode(request: GeocodeRequest): Promise<GeocodeResult> {
    try {
      const data = await fetchJson<
        { lat: string; lon: string; display_name: string }[]
      >(
        osrmUrl(NOMINATIM_BASE, "/search", {
          q: request.query,
          format: "jsonv2",
          limit: "1",
        }),
      );
      const first = data?.[0];
      if (!first) throw new Error("no result");
      return {
        lat: Number.parseFloat(first.lat),
        lng: Number.parseFloat(first.lon),
        displayName: first.display_name,
        provider: "Nominatim / OpenStreetMap",
        dataLabel: "VERIFIED",
        isFallback: false,
      };
    } catch (err) {
      throw new Error(
        `Geocoding unavailable (${err instanceof Error ? err.message : "unknown"})`,
      );
    }
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const data = await fetchJson<OsrmResponse>(
        osrmUrl(OSRM_BASE, "/route/v1/driving", {
          coordinates: "-122.4194,37.7749;-122.2711,37.8044",
          overview: "false",
        }),
      );
      const latencyMs = Date.now() - started;
      if (!data.routes?.length) throw new Error("empty response");
      return {
        key: this.key,
        name: this.name,
        status: "connected",
        detail: "Live routing and geocoding are reachable.",
        capability: "Driving routes, alternative routes, address geocoding",
        requiresKey: this.requiresKey,
        checkedAt: new Date().toISOString(),
        latencyMs,
      };
    } catch (err) {
      return {
        key: this.key,
        name: this.name,
        status: "degraded",
        detail: `Routing unreachable — distances fall back to straight-line estimates. ${
          err instanceof Error ? err.message : ""
        }`.trim(),
        capability: "Estimated distances only",
        requiresKey: this.requiresKey,
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
      };
    }
  }
}

export const routingProvider: RoutingProvider = new OsrmRoutingProvider();
