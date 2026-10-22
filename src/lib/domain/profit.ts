import {
  divideCents,
  multiplyByRate,
  sumCents,
  type Cents,
  type RateMilli,
} from "./money";
import { EXPENSE_CATEGORY_MAP, type ModelledGroup, type VehicleCostInputs } from "./expenses";
import type { DataLabel } from "./labels";

/**
 * Deterministic profit engine.
 *
 * Rules enforced here:
 * 1. Every money value is integer cents.
 * 2. Each cost group contributes exactly once. If actual expenses exist for a
 *    group, the modelled estimate for that group is discarded (never summed
 *    with it). This is the structural guarantee against double counting.
 * 3. No AI, no randomness, no clock reads — the same input always yields the
 *    same output.
 */

export interface DeliveryInput {
  id: string;
  reference: string;
  merchantName: string;
  pickupAt: string;
  dropoffAt: string | null;
  basePayCents: Cents;
  tipCents: Cents;
  bonusCents: Cents;
  distanceMiles: number | null;
  durationMinutes: number | null;
  status: "completed" | "cancelled";
}

export interface ShiftInput {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startOdometerMiles: number | null;
  endOdometerMiles: number | null;
  personalMiles: number;
  idleMinutes: number;
}

export interface ExpenseInput {
  id: string;
  driverId: string;
  category: string;
  amountCents: Cents;
  occurredAt: string;
  shiftId: string | null;
}

export interface ProfitInput {
  deliveries: DeliveryInput[];
  shifts: ShiftInput[];
  expenses: ExpenseInput[];
  vehicle: VehicleCostInputs | null;
  /** Window length in days, used to prorate period costs. */
  windowDays: number;
  /** Current vehicle odometer, used to derive depreciation if not configured. */
  vehicleOdometerMiles?: number | null;
}

export interface CostLine {
  key: string;
  label: string;
  amountCents: Cents;
  dataLabel: DataLabel;
  source: "actual" | "modelled";
  note?: string;
}

export interface ProfitBreakdown {
  grossBasePayCents: Cents;
  tipsCents: Cents;
  bonusesCents: Cents;
  grossEarningsCents: Cents;
  deliveryCount: number;
  cancelledCount: number;

  costs: CostLine[];
  directExpenseCents: Cents;
  modelledVehicleCostCents: Cents;
  totalCostCents: Cents;
  /** Sum of every cost that is deductible as a business expense, cents. */
  deductibleCostsCents: Cents;

  netProfitCents: Cents;

  shiftMinutes: number;
  idleMinutes: number;
  activeMinutes: number;
  deliveryMinutes: number;

  shiftMiles: number;
  businessMiles: number;
  personalMiles: number;
  deliveryMiles: number;

  /** Net profit per active hour, in milli-cents per hour. */
  profitPerActiveHourMilli: number | null;
  /** Net profit per business mile, in milli-cents per mile. */
  profitPerBusinessMileMilli: number | null;
  /** Gross earnings per business mile, in milli-cents per mile. */
  earningsPerBusinessMileMilli: number | null;
  /** Gross earnings per active hour, in milli-cents per hour. */
  earningsPerActiveHourMilli: number | null;
  /** Average delivery, cents. */
  averageDeliveryCents: Cents | null;
}

const DAYS_PER_MONTH = 30.4375;
const DAYS_PER_YEAR = 365.25;

/** Divide safely: returns null rather than Infinity when the denominator is zero. */
function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function prorate(periodicCents: Cents, perDays: number, windowDays: number): Cents {
  const raw = (periodicCents * windowDays) / perDays;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}

/**
 * Compute the full profit breakdown for a driver over a window.
 */
export function computeProfit(input: ProfitInput): ProfitBreakdown {
  const completed = input.deliveries.filter((d) => d.status === "completed");
  const cancelled = input.deliveries.filter((d) => d.status === "cancelled");

  const grossBasePayCents = sumCents(completed.map((d) => d.basePayCents));
  const tipsCents = sumCents(completed.map((d) => d.tipCents));
  const bonusesCents = sumCents(completed.map((d) => d.bonusCents));
  const grossEarningsCents = grossBasePayCents + tipsCents + bonusesCents;

  // ---------------------------------------------------------------------
  // Actual expenses, bucketed by the group they suppress.
  // ---------------------------------------------------------------------
  const actualByGroup = new Map<string, Cents>();
  const directActualCents: Cents[] = [];
  let mealsActualCents = 0;

  for (const expense of input.expenses) {
    const def = EXPENSE_CATEGORY_MAP[expense.category];
    const group = def?.group ?? "direct";
    if (expense.category === "meals") {
      mealsActualCents += expense.amountCents;
      continue;
    }
    if (group === "direct") {
      directActualCents.push(expense.amountCents);
    } else {
      actualByGroup.set(group, (actualByGroup.get(group) ?? 0) + expense.amountCents);
    }
  }

  const directExpenseCents = sumCents(directActualCents);

  // ---------------------------------------------------------------------
  // Mileage & time
  // ---------------------------------------------------------------------
  let shiftMinutes = 0;
  let idleMinutes = 0;
  let shiftMiles = 0;
  let personalMiles = 0;

  for (const shift of input.shifts) {
    if (shift.startedAt && shift.endedAt) {
      const minutes = Math.max(
        0,
        Math.round(
          (new Date(shift.endedAt).getTime() - new Date(shift.startedAt).getTime()) / 60_000,
        ),
      );
      shiftMinutes += minutes;
      idleMinutes += Math.max(0, shift.idleMinutes);
    }
    if (
      shift.startOdometerMiles !== null &&
      shift.endOdometerMiles !== null &&
      shift.endOdometerMiles >= shift.startOdometerMiles
    ) {
      shiftMiles += shift.endOdometerMiles - shift.startOdometerMiles;
    }
    personalMiles += Math.max(0, shift.personalMiles);
  }

  const deliveryMiles = completed.reduce((acc, d) => acc + (d.distanceMiles ?? 0), 0);
  const businessMiles = Math.max(0, shiftMiles - personalMiles);
  const activeMinutes = Math.max(0, shiftMinutes - idleMinutes);
  const deliveryMinutes = sumCents(
    completed.map((d) => (d.durationMinutes === null ? 0 : d.durationMinutes)),
  );

  // ---------------------------------------------------------------------
  // Modelled vehicle costs — only for groups with no actual expenses.
  // ---------------------------------------------------------------------
  const costs: CostLine[] = [];
  const vehicle = input.vehicle;
  let modelledVehicleCostCents = 0;

  const addActual = (group: ModelledGroup, label: string, note?: string) => {
    const amount = actualByGroup.get(group) ?? 0;
    actualByGroup.delete(group);
    if (amount === 0) return;
    costs.push({
      key: group,
      label,
      amountCents: amount,
      dataLabel: "VERIFIED",
      source: "actual",
      ...(note ? { note } : {}),
    });
  };

  const addModelled = (
    key: string,
    label: string,
    amountCents: Cents,
    dataLabel: DataLabel,
    note?: string,
  ) => {
    if (amountCents === 0) return;
    costs.push({
      key,
      label,
      amountCents,
      dataLabel,
      source: "modelled",
      ...(note ? { note } : {}),
    });
    modelledVehicleCostCents += amountCents;
  };

  const windowDays = Math.max(0, input.windowDays);

  if (vehicle) {
    // Fuel -----------------------------------------------------------------
    if (actualByGroup.has("fuel")) {
      addActual("fuel", "Fuel (recorded)", "Actual fill-ups used instead of the fuel model.");
    } else if (vehicle.mpg && vehicle.fuelPriceCentsPerGallon && businessMiles > 0) {
      const gallons = businessMiles / vehicle.mpg;
      const cost = Math.round(gallons * vehicle.fuelPriceCentsPerGallon);
      addModelled(
        "fuel",
        "Fuel (modelled)",
        cost,
        "ESTIMATED",
        `${businessMiles.toFixed(1)} mi ÷ ${vehicle.mpg} mpg × ${(
          vehicle.fuelPriceCentsPerGallon / 100
        ).toFixed(3)}/gal`,
      );
    }

    // Maintenance ----------------------------------------------------------
    if (actualByGroup.has("maintenance")) {
      addActual("maintenance", "Maintenance (recorded)", "Recorded repairs used instead of the per-mile model.");
    } else if (vehicle.maintenanceMilliPerMile > 0 && businessMiles > 0) {
      const cost = multiplyByRate(100_00, vehicle.maintenanceMilliPerMile, businessMiles);
      addModelled(
        "maintenance",
        "Maintenance (modelled)",
        cost,
        "ESTIMATED",
        `${businessMiles.toFixed(1)} mi × ${(vehicle.maintenanceMilliPerMile / 1000).toFixed(3)}/mi`,
      );
    }

    // Tires ----------------------------------------------------------------
    if (actualByGroup.has("tires")) {
      addActual("tires", "Tires & service (recorded)");
    } else if (vehicle.recurringServiceCentsPerYear && windowDays > 0) {
      const cost = prorate(vehicle.recurringServiceCentsPerYear, DAYS_PER_YEAR, windowDays);
      addModelled(
        "tires",
        "Tires & service (modelled)",
        cost,
        "ESTIMATED",
        `Annual allowance prorated over ${windowDays.toFixed(0)} days`,
      );
    }

    // Insurance ------------------------------------------------------------
    if (actualByGroup.has("insurance")) {
      addActual("insurance", "Insurance (recorded)");
    } else if (vehicle.insuranceCentsPerMonth && windowDays > 0) {
      const cost = prorate(vehicle.insuranceCentsPerMonth, DAYS_PER_MONTH, windowDays);
      addModelled(
        "insurance",
        "Insurance (modelled)",
        cost,
        "ESTIMATED",
        `Monthly premium prorated over ${windowDays.toFixed(0)} days`,
      );
    }

    // Registration ---------------------------------------------------------
    if (actualByGroup.has("registration")) {
      addActual("registration", "Registration & permits (recorded)");
    } else if (vehicle.registrationCentsPerYear && windowDays > 0) {
      const cost = prorate(vehicle.registrationCentsPerYear, DAYS_PER_YEAR, windowDays);
      addModelled(
        "registration",
        "Registration & permits (modelled)",
        cost,
        "ESTIMATED",
        `Annual fee prorated over ${windowDays.toFixed(0)} days`,
      );
    }

    // Depreciation ---------------------------------------------------------
    // Always calculated. Depreciation is never a manual expense category, so
    // it can never be counted twice.
    const depreciationMilli = resolveDepreciationMilliPerMile(vehicle, input.vehicleOdometerMiles ?? null);
    if (depreciationMilli > 0 && businessMiles > 0) {
      const cost = multiplyByRate(100_00, depreciationMilli, businessMiles);
      addModelled(
        "depreciation",
        "Depreciation (calculated)",
        cost,
        "CALCULATED",
        `${businessMiles.toFixed(1)} mi × ${(depreciationMilli / 1000).toFixed(3)}/mi`,
      );
    }
  }

  // Direct expenses -------------------------------------------------------
  if (directExpenseCents !== 0) {
    costs.push({
      key: "direct",
      label: "Parking, tolls, phone & supplies",
      amountCents: directExpenseCents,
      dataLabel: "VERIFIED",
      source: "actual",
    });
  }

  if (mealsActualCents !== 0) {
    costs.push({
      key: "meals",
      label: "Meals on shift",
      amountCents: mealsActualCents,
      dataLabel: "VERIFIED",
      source: "actual",
      note: "50% deductible for the tax estimate.",
    });
  }

  const totalCostCents = sumCents(costs.map((c) => c.amountCents));
  const netProfitCents = grossEarningsCents - totalCostCents;

  // Business-expense deduction: everything is deductible except half of meals.
  const deductibleCostsCents =
    totalCostCents - Math.round(mealsActualCents / 2);

  const profitPerActiveHourMilli = safeDivide(netProfitCents * 60_000, activeMinutes);
  const profitPerBusinessMileMilli = safeDivide(netProfitCents * 1000, businessMiles);
  const earningsPerActiveHourMilli = safeDivide(grossEarningsCents * 60_000, activeMinutes);
  const earningsPerBusinessMileMilli = safeDivide(grossEarningsCents * 1000, businessMiles);
  const averageDeliveryCents =
    completed.length === 0 ? null : divideCents(grossEarningsCents, completed.length);

  return {
    grossBasePayCents,
    tipsCents,
    bonusesCents,
    grossEarningsCents,
    deliveryCount: completed.length,
    cancelledCount: cancelled.length,

    costs,
    directExpenseCents,
    modelledVehicleCostCents,
    totalCostCents,
    deductibleCostsCents,

    netProfitCents,

    shiftMinutes,
    idleMinutes,
    activeMinutes,
    deliveryMinutes,

    shiftMiles,
    businessMiles,
    personalMiles,
    deliveryMiles,

    profitPerActiveHourMilli,
    profitPerBusinessMileMilli,
    earningsPerActiveHourMilli,
    earningsPerBusinessMileMilli,
    averageDeliveryCents,
  };
}

/**
 * Depreciation per mile.
 *
 * Prefers an explicit configured rate. Otherwise derives it from the vehicle's
 * value decline spread over the miles driven so far. Returns 0 when neither
 * piece of data is available — never guesses.
 */
export function resolveDepreciationMilliPerMile(
  vehicle: VehicleCostInputs,
  odometerMiles: number | null,
): RateMilli {
  if (vehicle.depreciationMilliPerMile > 0) return vehicle.depreciationMilliPerMile;

  if (
    vehicle.purchasePriceCents !== null &&
    vehicle.currentValueCents !== null &&
    odometerMiles !== null &&
    odometerMiles > 0
  ) {
    const decline = vehicle.purchasePriceCents - vehicle.currentValueCents;
    if (decline <= 0) return 0;
    const perMileCents = decline / odometerMiles;
    return Math.max(0, Math.round(perMileCents * 1000));
  }

  return 0;
}
