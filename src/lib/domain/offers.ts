import { multiplyByRate, type Cents, type RateMilli } from "./money";
import type { DataLabel } from "./labels";

/**
 * Offer evaluation engine.
 *
 * Pure and deterministic: the same offer + the same driver profile always
 * produces the same verdict. There is no model call, no randomness and no
 * hidden clock read. A language model may *explain* the result, but it never
 * decides it.
 */

export type OfferVerdict = "STRONG_ACCEPT" | "ACCEPT" | "MARGINAL" | "DECLINE" | "INSUFFICIENT_DATA";

export interface OfferInput {
  merchantName: string;
  basePayCents: Cents;
  /** Customer tip. Use 0 when unknown — never invent a tip. */
  tipCents: Cents;
  bonusCents: Cents;

  /** Miles from the driver's current position to the merchant. */
  pickupDistanceMiles: number | null;
  /** Miles from merchant to customer. */
  dropoffDistanceMiles: number | null;
  /** Extra miles to reposition to the next likely pickup. */
  repositionMiles: number | null;

  /** Minutes the merchant is expected to hold the order. */
  pickupWaitMinutes: number | null;
  /** Minutes from pickup to dropoff, if known from a routing provider. */
  travelMinutes: number | null;

  itemsCount: number | null;
  /** Driver-reported order weight in pounds, when known. */
  orderWeightLbs: number | null;
  /** Merchant is a cold-chain / fragile category (e.g. frozen, pharmacy). */
  coldChain: boolean;

  /** Current local hour 0–23, used for time-of-day multipliers. */
  localHour: number;
}

export interface DriverEconomics {
  /** Driver's own median net per active hour, milli-cents/hour. */
  baselineNetPerHourMilli: RateMilli | null;
  /** Driver's own median net per business mile, milli-cents/mile. */
  baselineNetPerMileMilli: RateMilli | null;
  /** Vehicle running cost, milli-cents per mile. */
  costPerMileMilli: RateMilli;
  /** True when the mileage/routing distances came from a live routing provider. */
  distancesAreProviderVerified: boolean;
  /** Number of historical deliveries available for the baseline. */
  historicalSampleSize: number;
  /** Multiplier from the driver's own time-of-day history, e.g. 1.12. */
  hourMultiplier: number;
  /** True when the hour multiplier came from the driver's own data. */
  hourMultiplierFromHistory: boolean;
}

export interface OfferCostLine {
  label: string;
  amountCents: Cents;
  dataLabel: DataLabel;
  note?: string;
}

export interface OfferEvaluation {
  verdict: OfferVerdict;
  headline: string;
  rationale: string[];

  grossPayCents: Cents;
  estimatedTotalCents: Cents;
  estimatedCostCents: Cents;
  estimatedNetCents: Cents;

  estimatedMiles: number | null;
  estimatedMinutes: number | null;

  /** milli-cents per hour */
  estimatedNetPerHourMilli: number | null;
  /** Ratio against the driver's own baseline; 1.0 = on par. */
  baselineRatio: number | null;
  /** The $/hr the driver must beat for this offer to break even on cost alone. */
  breakEvenNetPerHourMilli: number | null;

  confidence: "high" | "medium" | "low" | "none";
  dataLabel: DataLabel;
  caveats: string[];
  costs: OfferCostLine[];
  missingInputs: string[];
}

/** Fallback baseline used only when the driver has no history yet. */
export const DEFAULT_BASELINE_NET_PER_HOUR_MILLI: RateMilli = 1500; // $15.00/hr

export function evaluateOffer(
  offer: OfferInput,
  driver: DriverEconomics,
): OfferEvaluation {
  const caveats: string[] = [];
  const missingInputs: string[] = [];
  const rationale: string[] = [];

  const grossPayCents = offer.basePayCents + offer.tipCents + offer.bonusCents;

  // --- Distances ---------------------------------------------------------
  const distanceKnown =
    offer.pickupDistanceMiles !== null || offer.dropoffDistanceMiles !== null;
  const estimatedMiles =
    offer.pickupDistanceMiles === null && offer.dropoffDistanceMiles === null
      ? null
      : (offer.pickupDistanceMiles ?? 0) +
        (offer.dropoffDistanceMiles ?? 0) +
        (offer.repositionMiles ?? 0);

  if (offer.pickupDistanceMiles === null) missingInputs.push("pickup distance");
  if (offer.dropoffDistanceMiles === null) missingInputs.push("drop-off distance");
  if (offer.tipCents === 0) missingInputs.push("customer tip");
  if (offer.pickupWaitMinutes === null) missingInputs.push("merchant wait time");

  // --- Time --------------------------------------------------------------
  let estimatedMinutes: number | null = null;
  if (offer.travelMinutes !== null || offer.pickupWaitMinutes !== null) {
    estimatedMinutes =
      (offer.travelMinutes ?? 0) + (offer.pickupWaitMinutes ?? 0);
  } else if (estimatedMiles !== null) {
    // Fallback: assume 26 mph average city speed. Labelled ESTIMATED.
    estimatedMinutes = Math.round((estimatedMiles / 26) * 60) + 4;
    caveats.push("Travel time estimated from distance at 26 mph — no live route was available.");
  }

  if (offer.pickupWaitMinutes === null) {
    caveats.push("Merchant wait time unknown; 0 minutes assumed, which flatters this offer.");
  }
  if (offer.tipCents === 0) {
    caveats.push("No tip included. Enter the customer's tip if you can see it.");
  }

  // --- Cost --------------------------------------------------------------
  const costs: OfferCostLine[] = [];
  let estimatedCostCents = 0;

  if (estimatedMiles !== null && driver.costPerMileMilli > 0) {
    const vehicleCost = multiplyByRate(100_00, driver.costPerMileMilli, estimatedMiles);
    estimatedCostCents += vehicleCost;
    costs.push({
      label: "Vehicle running cost",
      amountCents: vehicleCost,
      dataLabel: driver.distancesAreProviderVerified ? "VERIFIED" : "ESTIMATED",
      note: `${estimatedMiles.toFixed(1)} mi × ${(driver.costPerMileMilli / 1000).toFixed(3)}/mi`,
    });
  } else {
    missingInputs.push("vehicle cost per mile");
  }

  // Time has an opportunity cost: the driver could have taken another offer.
  const baseline =
    driver.baselineNetPerHourMilli ?? DEFAULT_BASELINE_NET_PER_HOUR_MILLI;
  const baselineSource: DataLabel =
    driver.baselineNetPerHourMilli === null ? "ESTIMATED" : "CALCULATED";
  if (driver.baselineNetPerHourMilli === null) {
    caveats.push(
      "No delivery history yet — this is compared against a default $15.00/hr baseline, not your own average.",
    );
  }

  let opportunityCostCents = 0;
  if (estimatedMinutes !== null && estimatedMinutes > 0) {
    // Opportunity cost of the hours consumed, floored at zero so a negative
    // baseline never inflates the offer.
    const baselineHourCents = Math.max(0, baseline) * (estimatedMinutes / 60_000);
    opportunityCostCents = Math.round(baselineHourCents);
    costs.push({
      label: "Opportunity cost of time",
      amountCents: opportunityCostCents,
      dataLabel: baselineSource,
      note: `${estimatedMinutes} min at your own baseline`,
    });
  }

  const estimatedTotalCents = grossPayCents;
  const estimatedNetCents = estimatedTotalCents - estimatedCostCents;
  const estimatedNetPerHourMilli =
    estimatedMinutes !== null && estimatedMinutes > 0
      ? Math.round((estimatedNetCents * 60_000) / estimatedMinutes)
      : null;

  const baselineRatio =
    estimatedNetPerHourMilli !== null ? estimatedNetPerHourMilli / baseline : null;

  // --- Verdict -----------------------------------------------------------
  let verdict: OfferVerdict;
  let headline: string;

  if (baselineRatio === null) {
    verdict = "INSUFFICIENT_DATA";
    headline = "Not enough data to score this offer";
  } else if (baselineRatio >= 1.15) {
    verdict = "STRONG_ACCEPT";
    headline = "Strong accept — well above your baseline";
  } else if (baselineRatio >= 0.98) {
    verdict = "ACCEPT";
    headline = "Accept — at or above your baseline";
  } else if (baselineRatio >= 0.82) {
    verdict = "MARGINAL";
    headline = "Marginal — slightly below your baseline";
  } else {
    verdict = "DECLINE";
    headline = "Decline — well below your baseline";
  }

  // --- Rationale ---------------------------------------------------------
  if (estimatedNetPerHourMilli !== null) {
    rationale.push(
      `Net ≈ $${(estimatedNetPerHourMilli / 1000).toFixed(2)}/hr against your $${(
        baseline / 1000
      ).toFixed(2)}/hr baseline (${(baselineRatio! * 100).toFixed(0)}%).`,
    );
  }
  if (estimatedMiles !== null) {
    rationale.push(
      `${estimatedMiles.toFixed(1)} mi total · vehicle cost $${(estimatedCostCents / 100).toFixed(2)}.`,
    );
  }
  if (estimatedMinutes !== null) {
    rationale.push(`About ${estimatedMinutes} min of door-to-door and waiting time.`);
  }
  if (driver.hourMultiplierFromHistory) {
    rationale.push(
      `Your own history says ${driver.localHour}:00 is worth ${driver.hourMultiplier.toFixed(
        2,
      )}× your usual rate at this hour.`,
    );
  }
  if (offer.coldChain) {
    rationale.push("Cold-chain order — expect extra time and a higher chance of a remake.");
  }
  if ((offer.itemsCount ?? 0) >= 8) {
    rationale.push("Large order — expect a slower pickup and a higher bag count.");
  }
  if ((offer.orderWeightLbs ?? 0) >= 40) {
    rationale.push("Heavy load — factor in extra carry time and vehicle wear.");
  }

  // --- Confidence --------------------------------------------------------
  const knownRatio =
    (offer.pickupDistanceMiles !== null ? 1 : 0) +
    (offer.dropoffDistanceMiles !== null ? 1 : 0) +
    (offer.tipCents > 0 ? 1 : 0) +
    (offer.pickupWaitMinutes !== null ? 1 : 0) +
    (offer.travelMinutes !== null ? 1 : 0);

  let confidence: OfferEvaluation["confidence"];
  if (driver.historicalSampleSize >= 20 && knownRatio >= 4 && driver.distancesAreProviderVerified) {
    confidence = "high";
  } else if (driver.historicalSampleSize >= 8 && knownRatio >= 3) {
    confidence = "medium";
  } else if (knownRatio >= 2) {
    confidence = "low";
  } else {
    confidence = "none";
  }

  const dataLabel: DataLabel =
    confidence === "high"
      ? "CALCULATED"
      : confidence === "medium"
        ? "CALCULATED"
        : "ESTIMATED";

  return {
    verdict,
    headline,
    rationale,
    grossPayCents,
    estimatedTotalCents,
    estimatedCostCents,
    estimatedNetCents,
    estimatedMiles,
    estimatedMinutes,
    estimatedNetPerHourMilli,
    baselineRatio,
    breakEvenNetPerHourMilli: estimatedMinutes ? estimatedNetPerHourMilli : null,
    confidence,
    dataLabel,
    caveats,
    costs,
    missingInputs,
  };
}

export const VERDICT_META: Record<
  OfferVerdict,
  { label: string; tone: "good" | "info" | "warn" | "bad" | "muted" }
> = {
  STRONG_ACCEPT: { label: "Strong accept", tone: "good" },
  ACCEPT: { label: "Accept", tone: "info" },
  MARGINAL: { label: "Marginal", tone: "warn" },
  DECLINE: { label: "Decline", tone: "bad" },
  INSUFFICIENT_DATA: { label: "Not enough data", tone: "muted" },
};
