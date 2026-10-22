import { handle, ok, parseBody, parseJsonBody, requireDriver } from "@/lib/api";
import { offerEvaluationSchema } from "@/lib/validation/schemas";
import { evaluateOffer, DEFAULT_BASELINE_NET_PER_HOUR_MILLI } from "@/lib/domain/offers";
import { parseCents } from "@/lib/domain/money";
import { getDriverAnalytics } from "@/lib/services/analytics";
import { rangeForPreset } from "@/lib/repositories/driver-data";

/**
 * Evaluate a delivery offer against the driver's own history.
 * The verdict is computed by deterministic math; the model is never involved.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const ctx = await requireDriver();
    const body = parseJsonBody(request);
    const input = parseBody(offerEvaluationSchema, body);

    const analytics = await getDriverAnalytics(
      ctx.driver.id,
      ctx.household.id,
      rangeForPreset("all"),
    );

    const now = new Date();
    const hourStats = analytics.history.hourMultiplierFor(now.getHours());

    const evaluation = evaluateOffer(
      {
        merchantName: input.merchantName,
        basePayCents: parseCents(input.basePay),
        tipCents: parseCents(input.tip ?? "0"),
        bonusCents: parseCents(input.bonus ?? "0"),
        pickupDistanceMiles: input.pickupDistanceMiles ?? null,
        dropoffDistanceMiles: input.dropoffDistanceMiles ?? null,
        repositionMiles: input.repositionMiles ?? null,
        pickupWaitMinutes: input.pickupWaitMinutes ?? null,
        travelMinutes: input.travelMinutes ?? null,
        itemsCount: input.itemsCount ?? null,
        orderWeightLbs: input.orderWeightLbs ?? null,
        coldChain: input.coldChain ?? false,
        localHour: now.getHours(),
      },
      {
        baselineNetPerHourMilli: analytics.history.baselineNetPerHourMilli,
        baselineNetPerMileMilli: analytics.history.baselineNetPerMileMilli,
        costPerMileMilli: analytics.costPerMileMilli,
        distancesAreProviderVerified: false,
        historicalSampleSize: analytics.history.deliveries.filter((d) => d.status === "completed")
          .length,
        hourMultiplier: hourStats.multiplier,
        hourMultiplierFromHistory: hourStats.fromHistory,
      },
    );

    return ok({
      evaluation,
      baseline: {
        netPerHourMilli:
          analytics.history.baselineNetPerHourMilli ?? DEFAULT_BASELINE_NET_PER_HOUR_MILLI,
        fromHistory: analytics.history.baselineNetPerHourMilli !== null,
        sampleSize: analytics.history.deliveries.length,
      },
      hourMultiplier: hourStats,
    });
  });
}
