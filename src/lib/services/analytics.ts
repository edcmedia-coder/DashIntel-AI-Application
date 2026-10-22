import { computeProfit, type ProfitBreakdown } from "@/lib/domain/profit";
import { estimateTax, sumCostByKeys, type TaxBreakdown } from "@/lib/domain/tax";
import {
  baselineNetPerHour,
  baselineNetPerMile,
  buildInsights,
  grossOf,
  hourMultiplier,
  performanceByDaypart,
  performanceByHour,
  performanceByMerchant,
  performanceByWeekday,
  type HistoricalDelivery,
  type Insight,
  type PerformanceBucket,
} from "@/lib/domain/patterns";
import { VEHICLE_COST_KEYS } from "@/lib/domain/tax";
import { multiplyByRate } from "@/lib/domain/money";
import { daysInRange, listDeliveries, listExpenses, listShifts, type DateRange } from "@/lib/repositories/driver-data";
import {
  listVehicles,
  toVehicleCostInputs,
  vehicleCostPerMileMilli,
} from "@/lib/repositories/vehicles";
import { getDriverSettings, type DriverSettings } from "@/lib/repositories/settings";
import type { Vehicle } from "@/lib/db/schema";

export interface DriverAnalytics {
  range: DateRange;
  windowDays: number;
  profit: ProfitBreakdown;
  tax: TaxBreakdown;
  settings: DriverSettings;
  vehicle: Vehicle | null;
  vehicles: Vehicle[];
  costPerMileMilli: number;
  history: {
    deliveries: HistoricalDelivery[];
    hourly: PerformanceBucket[];
    dayparts: PerformanceBucket[];
    weekdays: PerformanceBucket[];
    merchants: PerformanceBucket[];
    baselineNetPerHourMilli: number | null;
    baselineNetPerMileMilli: number | null;
    hourMultiplierFor: (hour: number) => { multiplier: number; fromHistory: boolean; sampleSize: number };
  };
  insights: Insight[];
}

/**
 * Compute everything the dashboard, insights and tax pages need.
 * One pass over the driver's own data; no external calls.
 */
export async function getDriverAnalytics(
  driverId: string,
  householdId: string,
  range: DateRange,
): Promise<DriverAnalytics> {
  const [deliveryRows, shiftRows, expenseRows, settings, vehicleRows] = await Promise.all([
    listDeliveries(driverId, range),
    listShifts(driverId, range),
    listExpenses(driverId, range),
    getDriverSettings(driverId),
    listVehicles(householdId),
  ]);

  const vehicle = settings.vehicleId
    ? (vehicleRows.find((v) => v.id === settings.vehicleId) ?? null)
    : (vehicleRows[0] ?? null);

  const windowDays = daysInRange(range);

  const profit = computeProfit({
    deliveries: deliveryRows.map((d) => ({
      id: d.id,
      reference: d.reference,
      merchantName: d.merchantName,
      pickupAt: d.pickupAt,
      dropoffAt: d.dropoffAt,
      basePayCents: d.basePayCents,
      tipCents: d.tipCents,
      bonusCents: d.bonusCents,
      distanceMiles: d.distanceMiles,
      durationMinutes: d.durationMinutes,
      status: d.status,
    })),
    shifts: shiftRows.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      startOdometerMiles: s.startOdometerMiles,
      endOdometerMiles: s.endOdometerMiles,
      personalMiles: s.personalMiles,
      idleMinutes: s.idleMinutes,
    })),
    expenses: expenseRows.map((e) => ({
      id: e.id,
      driverId: e.driverId,
      category: e.category,
      amountCents: e.amountCents,
      occurredAt: e.occurredAt,
      shiftId: e.shiftId,
    })),
    vehicle: toVehicleCostInputs(vehicle),
    windowDays,
    vehicleOdometerMiles: vehicle?.odometerMiles ?? null,
  });

  const tax = estimateTax({
    grossEarningsCents: profit.grossEarningsCents,
    deductibleCostsCents: profit.deductibleCostsCents,
    vehicleCostCents: sumCostByKeys(profit.costs, VEHICLE_COST_KEYS),
    businessMiles: profit.businessMiles,
    windowStart: range.from,
    windowEnd: range.to,
    filingStatus: settings.filingStatus,
    incomeTreatment: settings.incomeTreatment,
    stateEffectiveRate: settings.stateEffectiveRate,
    stateName: settings.stateName,
  });

  // ------------------------------------------------------------------
  // Attribute costs to individual deliveries so per-delivery history is real.
  // ------------------------------------------------------------------
  const costPerMile = vehicleCostPerMileMilli(vehicle);
  const totalGross = profit.grossEarningsCents;

  const history: HistoricalDelivery[] = deliveryRows.map((d) => {
    const gross = grossOf({
      pickupAt: d.pickupAt,
      dropoffAt: d.dropoffAt,
      merchantName: d.merchantName,
      basePayCents: d.basePayCents,
      tipCents: d.tipCents,
      bonusCents: d.bonusCents,
      distanceMiles: d.distanceMiles,
      durationMinutes: d.durationMinutes,
      status: d.status,
    });
    const vehicleCost = d.distanceMiles
      ? multiplyByRate(100_00, costPerMile, d.distanceMiles)
      : 0;
    const directShare =
      totalGross > 0
        ? Math.round((profit.directExpenseCents * gross) / totalGross)
        : 0;
    return {
      pickupAt: d.pickupAt,
      dropoffAt: d.dropoffAt,
      merchantName: d.merchantName,
      basePayCents: d.basePayCents,
      tipCents: d.tipCents,
      bonusCents: d.bonusCents,
      distanceMiles: d.distanceMiles,
      durationMinutes: d.durationMinutes,
      status: d.status,
      netCents: gross - vehicleCost - directShare,
    };
  });

  const hourly = performanceByHour(history);
  const dayparts = performanceByDaypart(history);
  const weekdays = performanceByWeekday(history);
  const merchants = performanceByMerchant(history);

  const ratedHours = hourly.filter((h) => h.sampleSize >= 5 && h.averageNetPerHourMilli !== null);
  const bestHour =
    ratedHours.length > 0
      ? ratedHours.reduce((best, h) =>
          (h.averageNetPerHourMilli ?? 0) > (best.averageNetPerHourMilli ?? 0) ? h : best,
        )
      : null;
  const worstHour =
    ratedHours.length > 0
      ? ratedHours.reduce((worst, h) =>
          (h.averageNetPerHourMilli ?? 0) < (worst.averageNetPerHourMilli ?? 0) ? h : worst,
        )
      : null;
  const ratedDayparts = dayparts.filter((d) => d.sampleSize >= 5);
  const bestDaypart =
    ratedDayparts.length > 0
      ? ratedDayparts.reduce((best, d) =>
          (d.averageNetPerHourMilli ?? 0) > (best.averageNetPerHourMilli ?? 0) ? d : best,
        )
      : null;

  const ratedMerchants = merchants.filter((m) => m.sampleSize >= 5);
  const bestMerchant =
    ratedMerchants.length > 0
      ? ratedMerchants.reduce((best, m) =>
          (m.averageNetPerHourMilli ?? 0) > (best.averageNetPerHourMilli ?? 0) ? m : best,
        )
      : null;
  const worstMerchant =
    ratedMerchants.length > 1
      ? ratedMerchants.reduce((worst, m) =>
          (m.averageNetPerHourMilli ?? 0) < (worst.averageNetPerHourMilli ?? 0) ? m : worst,
        )
      : null;

  const insights = buildInsights(history, {
    bestHour,
    worstHour,
    bestDaypart,
    bestMerchant,
    worstMerchant,
  });

  const baselineHour = baselineNetPerHour(history);
  const baselineMile = baselineNetPerMile(history);

  return {
    range,
    windowDays,
    profit,
    tax,
    settings,
    vehicle,
    vehicles: vehicleRows,
    costPerMileMilli: costPerMile,
    history: {
      deliveries: history,
      hourly,
      dayparts,
      weekdays,
      merchants,
      baselineNetPerHourMilli: baselineHour.value,
      baselineNetPerMileMilli: baselineMile.value,
      hourMultiplierFor: (hour: number) => hourMultiplier(history, hour),
    },
    insights,
  };
}
