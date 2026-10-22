import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appSettings, type AppSetting } from "@/lib/db/schema";
import type { FilingStatus, IncomeTreatment } from "@/lib/domain/tax";

/**
 * Per-driver settings, stored as a JSON document under `driver:<id>:settings`.
 * Settings are scoped to a driver, never to a household, so one family member
 * can file under a different status without affecting the other.
 */

export interface DriverSettings {
  filingStatus: FilingStatus;
  incomeTreatment: IncomeTreatment;
  /** Flat state income tax rate, e.g. 0.05. null = not configured. */
  stateEffectiveRate: number | null;
  stateName: string | null;
  /** Active vehicle id. */
  vehicleId: string | null;
  /** Whether the driver wants the mileage-deduction alternative shown. */
  preferMileageDeduction: boolean;
  /** Distance from the driver's home base used for repositioning estimates. */
  homeBaseAddress: string | null;
  /** Estimated average city speed in mph, used when no route is available. */
  averageSpeedMph: number;
}

export const DEFAULT_DRIVER_SETTINGS: DriverSettings = {
  filingStatus: "single",
  incomeTreatment: "self_employment",
  stateEffectiveRate: null,
  stateName: null,
  vehicleId: null,
  preferMileageDeduction: false,
  homeBaseAddress: null,
  averageSpeedMph: 24,
};

function settingsKey(driverId: string): string {
  return `driver:${driverId}:settings`;
}

export async function getDriverSettings(driverId: string): Promise<DriverSettings> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, settingsKey(driverId)))
    .limit(1);

  const row: AppSetting | undefined = rows[0];
  if (!row) return { ...DEFAULT_DRIVER_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<DriverSettings>;
    return { ...DEFAULT_DRIVER_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_DRIVER_SETTINGS };
  }
}

export async function saveDriverSettings(
  driverId: string,
  patch: Partial<DriverSettings>,
): Promise<DriverSettings> {
  const db = await getDb();
  const current = await getDriverSettings(driverId);
  const next: DriverSettings = { ...current, ...patch };
  const now = new Date().toISOString();
  const key = settingsKey(driverId);

  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSettings)
      .set({ value: JSON.stringify(next), updatedAt: now })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value: JSON.stringify(next), updatedAt: now });
  }

  return next;
}
