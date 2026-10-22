import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { drivers, vehicles, type Vehicle } from "@/lib/db/schema";
import { parseCents, type RateMilli } from "@/lib/domain/money";

export async function listVehicles(householdId: string): Promise<Vehicle[]> {
  const db = await getDb();
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.householdId, householdId))
    .orderBy(desc(vehicles.createdAt));
}

export async function listHouseholdMembers(householdId: string) {
  const db = await getDb();
  return db
    .select({
      id: drivers.id,
      displayName: drivers.displayName,
      email: drivers.email,
      role: drivers.role,
      colorKey: drivers.colorKey,
      isActive: drivers.isActive,
    })
    .from(drivers)
    .where(eq(drivers.householdId, householdId));
}

export async function getVehicle(householdId: string, vehicleId: string): Promise<Vehicle | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.householdId, householdId), eq(vehicles.id, vehicleId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The vehicle running cost used by the offer engine: fuel + wear per mile.
 * Uses the driver's own configured numbers; falls back to zero (never a guess)
 * when the vehicle has not been configured yet.
 */
export function vehicleCostPerMileMilli(vehicle: Vehicle | null): RateMilli {
  if (!vehicle) return 0;
  const fuelMilli =
    vehicle.mpg && vehicle.fuelPriceCentsPerGallon
      ? Math.round((vehicle.fuelPriceCentsPerGallon / vehicle.mpg) * 1000)
      : 0;
  const depreciationMilli = vehicle.depreciationMilliPerMile ?? 0;
  return fuelMilli + depreciationMilli + (vehicle.maintenanceMilliPerMile ?? 0);
}

/** Convert a vehicle row into the profit engine's vehicle inputs. */
export function toVehicleCostInputs(vehicle: Vehicle | null) {
  if (!vehicle) return null;
  return {
    mpg: vehicle.mpg,
    fuelPriceCentsPerGallon: vehicle.fuelPriceCentsPerGallon,
    maintenanceCentsPerYear: vehicle.maintenanceCentsPerYear,
    maintenanceMilliPerMile: vehicle.maintenanceMilliPerMile,
    depreciationMilliPerMile: vehicle.depreciationMilliPerMile,
    insuranceCentsPerMonth: vehicle.insuranceCentsPerMonth,
    registrationCentsPerYear: vehicle.registrationCentsPerYear,
    recurringServiceCentsPerYear: vehicle.recurringServiceCentsPerYear,
    purchasePriceCents: vehicle.purchasePriceCents,
    currentValueCents: vehicle.currentValueCents,
  };
}

export function vehicleFromInput(
  input: {
    label: string;
    makeModel?: string | null;
    modelYear?: number | null;
    odometerMiles?: number;
    mpg?: number | null;
    fuelPrice?: string;
    insurancePerMonth?: string;
    registrationPerYear?: string;
    recurringServicePerYear?: string;
    maintenancePerYear?: string;
    maintenancePerMile?: number;
    depreciationPerMile?: number;
    purchasePrice?: string;
    currentValue?: string;
  },
  existing: Vehicle | null,
) {
  const parse = (v: string | undefined, fallback: number | null) => {
    if (v === undefined) return fallback;
    try {
      return parseCents(v);
    } catch {
      return fallback;
    }
  };

  return {
    label: input.label,
    makeModel: input.makeModel ?? existing?.makeModel ?? null,
    modelYear: input.modelYear ?? existing?.modelYear ?? null,
    odometerMiles: input.odometerMiles ?? existing?.odometerMiles ?? 0,
    mpg: input.mpg ?? existing?.mpg ?? null,
    fuelPriceCentsPerGallon: parse(input.fuelPrice, existing?.fuelPriceCentsPerGallon ?? null),
    insuranceCentsPerMonth: parse(input.insurancePerMonth, existing?.insuranceCentsPerMonth ?? null),
    registrationCentsPerYear: parse(
      input.registrationPerYear,
      existing?.registrationCentsPerYear ?? null,
    ),
    recurringServiceCentsPerYear: parse(
      input.recurringServicePerYear,
      existing?.recurringServiceCentsPerYear ?? null,
    ),
    maintenanceCentsPerYear: parse(input.maintenancePerYear, existing?.maintenanceCentsPerYear ?? null),
    maintenanceMilliPerMile:
      input.maintenancePerMile !== undefined
        ? Math.round(input.maintenancePerMile * 1000)
        : existing?.maintenanceMilliPerMile ?? 0,
    depreciationMilliPerMile:
      input.depreciationPerMile !== undefined
        ? Math.round(input.depreciationPerMile * 1000)
        : existing?.depreciationMilliPerMile ?? 0,
    purchasePriceCents: parse(input.purchasePrice, existing?.purchasePriceCents ?? null),
    currentValueCents: parse(input.currentValue, existing?.currentValueCents ?? null),
  };
}
