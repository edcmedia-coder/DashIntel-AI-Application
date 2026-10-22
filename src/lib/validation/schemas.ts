import { z } from "zod";

/**
 * Runtime validation for every API input.
 * Nothing reaches the database without passing through one of these schemas.
 */

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Must be a valid ISO-8601 date",
});

const moneyString = z
  .string()
  .trim()
  .regex(/^-?\d*(\.\d{1,2})?$/, "Enter an amount with at most 2 decimal places")
  .refine((v) => v !== "" && v !== "-", "Amount is required");

export const registerSchema = z.object({
  householdName: z.string().trim().min(2, "Household name is too short").max(80),
  displayName: z.string().trim().min(1, "Your name is required").max(60),
  email: z.email("Enter a valid email address").max(200).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  joinCode: z.string().trim().max(40).optional(),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").max(200).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required").max(200),
});

export const startShiftSchema = z.object({
  vehicleId: z.string().min(1).nullable().optional(),
  startOdometerMiles: z.number().int().min(0).max(1_000_000).nullable().optional(),
  baseLocation: z.string().trim().max(200).nullable().optional(),
  startedAt: isoDate.optional(),
});

export const updateShiftSchema = z.object({
  endedAt: isoDate.optional(),
  endOdometerMiles: z.number().int().min(0).max(1_000_000).nullable().optional(),
  startOdometerMiles: z.number().int().min(0).max(1_000_000).nullable().optional(),
  idleMinutes: z.number().int().min(0).max(24 * 60).optional(),
  personalMiles: z.number().int().min(0).max(10_000).optional(),
  baseLocation: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "closed"]).optional(),
});

export const deliverySchema = z.object({
  reference: z.string().trim().min(1, "Order reference is required").max(60),
  merchantName: z.string().trim().min(1, "Merchant is required").max(120),
  merchantAddress: z.string().trim().max(240).nullable().optional(),
  dropoffAddress: z.string().trim().max(240).nullable().optional(),
  customerLabel: z.string().trim().max(60).nullable().optional(),
  shiftId: z.string().min(1).nullable().optional(),
  pickupAt: isoDate,
  dropoffAt: isoDate.nullable().optional(),
  basePay: moneyString,
  tip: moneyString.optional(),
  bonus: moneyString.optional(),
  distanceMiles: z.number().int().min(0).max(2000).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  itemsCount: z.number().int().min(0).max(200).nullable().optional(),
  status: z.enum(["completed", "cancelled"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateDeliverySchema = deliverySchema.partial();

export const expenseSchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(40),
  amount: moneyString,
  occurredAt: isoDate,
  shiftId: z.string().min(1).nullable().optional(),
  vendor: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  odometerMiles: z.number().int().min(0).max(1_000_000).nullable().optional(),
  isBusinessMile: z.boolean().optional(),
  /** Driver ids this shared expense should be split with. */
  shareWithDriverIds: z.array(z.string().min(1)).max(10).optional(),
});

export const vehicleSchema = z.object({
  label: z.string().trim().min(1, "Give the vehicle a name").max(60),
  makeModel: z.string().trim().max(120).nullable().optional(),
  modelYear: z.number().int().min(1980).max(2100).nullable().optional(),
  odometerMiles: z.number().int().min(0).max(1_000_000).optional(),
  mpg: z.number().int().min(3).max(200).nullable().optional(),
  fuelPrice: moneyString.optional(),
  insurancePerMonth: moneyString.optional(),
  registrationPerYear: moneyString.optional(),
  recurringServicePerYear: moneyString.optional(),
  maintenancePerYear: moneyString.optional(),
  maintenancePerMile: z.number().min(0).max(1000).optional(),
  depreciationPerMile: z.number().min(0).max(1000).optional(),
  purchasePrice: moneyString.optional(),
  currentValue: moneyString.optional(),
});

export const vehicleUpdateSchema = z.object({
  id: z.string().min(1, "Vehicle id is required."),
  label: z.string().trim().min(1, "Give the vehicle a name").max(60).optional(),
  makeModel: z.string().trim().max(120).nullable().optional(),
  modelYear: z.number().int().min(1980).max(2100).nullable().optional(),
  odometerMiles: z.number().int().min(0).max(1_000_000).optional(),
  mpg: z.number().int().min(3).max(200).nullable().optional(),
  fuelPrice: moneyString.optional(),
  insurancePerMonth: moneyString.optional(),
  registrationPerYear: moneyString.optional(),
  recurringServicePerYear: moneyString.optional(),
  maintenancePerYear: moneyString.optional(),
  maintenancePerMile: z.number().min(0).max(1000).optional(),
  depreciationPerMile: z.number().min(0).max(1000).optional(),
  purchasePrice: moneyString.optional(),
  currentValue: moneyString.optional(),
});

export const settingsSchema = z.object({
  filingStatus: z.enum(["single", "married_joint", "head_of_household", "married_separate"]).optional(),
  incomeTreatment: z.enum(["self_employment", "w2_employee"]).optional(),
  stateEffectiveRate: z.number().min(0).max(0.2).nullable().optional(),
  stateName: z.string().trim().max(60).nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  preferMileageDeduction: z.boolean().optional(),
  homeBaseAddress: z.string().trim().max(200).nullable().optional(),
  averageSpeedMph: z.number().min(5).max(120).optional(),
});

export const offerEvaluationSchema = z.object({
  merchantName: z.string().trim().max(120).default("Offer"),
  basePay: moneyString,
  tip: moneyString.optional(),
  bonus: moneyString.optional(),
  pickupDistanceMiles: z.number().min(0).max(2000).nullable().optional(),
  dropoffDistanceMiles: z.number().min(0).max(2000).nullable().optional(),
  repositionMiles: z.number().min(0).max(2000).nullable().optional(),
  pickupWaitMinutes: z.number().int().min(0).max(240).nullable().optional(),
  travelMinutes: z.number().int().min(0).max(600).nullable().optional(),
  itemsCount: z.number().int().min(0).max(200).nullable().optional(),
  orderWeightLbs: z.number().min(0).max(1000).nullable().optional(),
  coldChain: z.boolean().optional(),
  currentLocationLat: z.number().min(-90).max(90).nullable().optional(),
  currentLocationLng: z.number().min(-180).max(180).nullable().optional(),
});

export const routeCompareSchema = z.object({
  originLat: z.number().min(-90).max(90),
  originLng: z.number().min(-180).max(180),
  destinationLat: z.number().min(-90).max(90),
  destinationLng: z.number().min(-180).max(180),
});

export const geocodeSchema = z.object({
  query: z.string().trim().min(3, "Enter at least 3 characters").max(240),
});

export const idParamSchema = z.string().min(1).max(64);
