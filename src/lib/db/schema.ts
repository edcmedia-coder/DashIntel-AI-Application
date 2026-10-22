import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * DashIntel AI persistence schema.
 *
 * Conventions
 * - All money is stored as INTEGER cents.
 * - All rates are stored as INTEGER milli-cents (1/1000 cent) per unit.
 * - All timestamps are ISO-8601 UTC strings.
 * - Every financial row carries `driverId` so driver-level privacy can be
 *   enforced in the query layer, never in the UI.
 */

export const households = sqliteTable(
  "households",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    inviteCode: text("invite_code").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("households_invite_code_idx").on(t.inviteCode)],
);

export const drivers = sqliteTable(
  "drivers",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("member"), // owner | member
    colorKey: text("color_key").notNull().default("brand"),
    isActive: integer("is_active").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("drivers_email_idx").on(t.email),
    index("drivers_household_idx").on(t.householdId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("sessions_driver_idx").on(t.driverId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const vehicles = sqliteTable(
  "vehicles",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    driverId: text("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    makeModel: text("make_model"),
    modelYear: integer("model_year"),
    odometerMiles: integer("odometer_miles").notNull().default(0),
    purchasePriceCents: integer("purchase_price_cents"),
    currentValueCents: integer("current_value_cents"),
    /** Miles per gallon; null = unknown. */
    mpg: integer("mpg"),
    /** Fuel price in cents per US gallon. */
    fuelPriceCentsPerGallon: integer("fuel_price_cents_per_gallon"),
    /** Insurance per month, cents. */
    insuranceCentsPerMonth: integer("insurance_cents_per_month"),
    /** Registration / permit per year, cents. */
    registrationCentsPerYear: integer("registration_cents_per_year"),
    /** Tire + service set per year, cents. */
    recurringServiceCentsPerYear: integer("recurring_service_cents_per_year"),
    /** Maintenance over and above the per-mile figure, cents per year. */
    maintenanceCentsPerYear: integer("maintenance_cents_per_year"),
    /** Maintenance rate in milli-cents per mile. */
    maintenanceMilliPerMile: integer("maintenance_milli_per_mile").notNull().default(0),
    /** Depreciation rate in milli-cents per mile. */
    depreciationMilliPerMile: integer("depreciation_milli_per_mile").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("vehicles_household_idx").on(t.householdId)],
);

export const shifts = sqliteTable(
  "shifts",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    startOdometerMiles: integer("start_odometer_miles"),
    endOdometerMiles: integer("end_odometer_miles"),
    /** Personal (non-business) miles driven during this shift, for tax. */
    personalMiles: integer("personal_miles").notNull().default(0),
    /** Declared breaks / waiting time inside the shift, minutes. */
    idleMinutes: integer("idle_minutes").notNull().default(0),
    /** Where the driver staged at shift start. */
    baseLocation: text("base_location"),
    status: text("status").notNull().default("active"), // active | closed
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("shifts_driver_started_idx").on(t.driverId, t.startedAt),
    index("shifts_status_idx").on(t.status),
  ],
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    shiftId: text("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    /** Driver-visible reference (order code). Unique per driver. */
    reference: text("reference").notNull(),
    merchantName: text("merchant_name").notNull(),
    merchantAddress: text("merchant_address"),
    dropoffAddress: text("dropoff_address"),
    /** Optional free-text customer label. Never part of any exported payload. */
    customerLabel: text("customer_label"),
    pickupAt: text("pickup_at").notNull(),
    dropoffAt: text("dropoff_at"),
    /** Base pay excluding tip, cents. */
    basePayCents: integer("base_pay_cents").notNull().default(0),
    /** Tip received, cents. */
    tipCents: integer("tip_cents").notNull().default(0),
    /** Promotions, peak bonuses, surge add-ons, cents. */
    bonusCents: integer("bonus_cents").notNull().default(0),
    /** Distance actually driven for this delivery, miles (integer, driver-entered). */
    distanceMiles: integer("distance_miles"),
    /** Distance from a routing provider, miles (integer). */
    providerDistanceMiles: integer("provider_distance_miles"),
    /** Minutes from pickup to dropoff, driver-entered. */
    durationMinutes: integer("duration_minutes"),
    itemsCount: integer("items_count"),
    status: text("status").notNull().default("completed"), // completed | cancelled
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("deliveries_driver_reference_idx").on(t.driverId, t.reference),
    index("deliveries_driver_created_idx").on(t.driverId, t.createdAt),
    index("deliveries_shift_idx").on(t.shiftId),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    shiftId: text("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    occurredAt: text("occurred_at").notNull(),
    vendor: text("vendor"),
    note: text("note"),
    odometerMiles: integer("odometer_miles"),
    /** Marks a fuel/maintenance expense whose miles are business miles. */
    isBusinessMile: integer("is_business_mile").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("expenses_driver_occurred_idx").on(t.driverId, t.occurredAt),
    index("expenses_shift_idx").on(t.shiftId),
  ],
);

/**
 * Explicit per-driver allocation of a shared expense.
 * Sum of `shareCents` for an expense always equals `expenses.amountCents`,
 * which is what guarantees an expense is never counted twice.
 */
export const expenseShares = sqliteTable(
  "expense_shares",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    shareCents: integer("share_cents").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.driverId] })],
);

export const odometerReadings = sqliteTable(
  "odometer_readings",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    vehicleId: text("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    shiftId: text("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    odometerMiles: integer("odometer_miles").notNull(),
    recordedAt: text("recorded_at").notNull(),
    source: text("source").notNull().default("manual"), // manual | shift
  },
  (t) => [index("odometer_driver_recorded_idx").on(t.driverId, t.recordedAt)],
);

export const providerHealth = sqliteTable(
  "provider_health",
  {
    id: text("id").primaryKey(),
    providerKey: text("provider_key").notNull(),
    status: text("status").notNull(), // connected | degraded | unavailable | not_configured
    message: text("message"),
    checkedAt: text("checked_at").notNull(),
    latencyMs: integer("latency_ms"),
  },
  (t) => [uniqueIndex("provider_health_key_idx").on(t.providerKey)],
);

export const insightReports = sqliteTable(
  "insight_reports",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    generatedAt: text("generated_at").notNull(),
    engine: text("engine").notNull(),
    model: text("model"),
    payload: text("payload").notNull(),
  },
  (t) => [index("insight_driver_idx").on(t.driverId, t.generatedAt)],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const schemaVersion = sql`(select count(*) from app_settings)`;

export type Household = typeof households.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
export type OdometerReading = typeof odometerReadings.$inferSelect;
export type InsightReport = typeof insightReports.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
