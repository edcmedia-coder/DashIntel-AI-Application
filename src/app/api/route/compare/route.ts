import { handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { routeCompareSchema } from "@/lib/validation/schemas";
import { routingProvider } from "@/lib/providers/routing";

/**
 * Compare real road alternatives between two points.
 * The provider returns live routes; when the service is unreachable it falls
 * back to an explicitly-labelled estimate. No route is ever invented.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(routeCompareSchema, body);

    const comparison = await routingProvider.alternatives({
      origin: { lat: input.originLat, lng: input.originLng },
      destination: { lat: input.destinationLat, lng: input.destinationLng },
    });

    return ok({ comparison });
  });
}
