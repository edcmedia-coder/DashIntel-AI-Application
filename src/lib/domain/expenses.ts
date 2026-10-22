import type { Cents, RateMilli } from "./money";

/**
 * Expense taxonomy.
 *
 * `group` determines how a category interacts with the vehicle cost model.
 * A category whose group has recorded actual expenses will SUPPRESS the
 * modelled estimate for that group, which is the mechanism that guarantees
 * an expense is never counted twice.
 */
export type ExpenseGroup =
  | "fuel"
  | "maintenance"
  | "tires"
  | "insurance"
  | "registration"
  | "direct";

export interface ExpenseCategoryDef {
  key: string;
  label: string;
  group: ExpenseGroup;
  /** Counts as a deductible business expense for the tax estimate. */
  deductible: boolean;
  /** Modelled from vehicle data instead of entered by hand. */
  modelled?: boolean;
  hint?: string;
}

export const EXPENSE_CATEGORIES: readonly ExpenseCategoryDef[] = [
  {
    key: "fuel",
    label: "Fuel",
    group: "fuel",
    deductible: true,
    hint: "Fill-ups. Suppresses the modelled fuel estimate for the same period.",
  },
  {
    key: "maintenance",
    label: "Maintenance & Repairs",
    group: "maintenance",
    deductible: true,
    hint: "Oil changes, brakes, parts. Suppresses the per-mile maintenance model.",
  },
  {
    key: "tires",
    label: "Tires",
    group: "tires",
    deductible: true,
    hint: "Supplies the modelled annual tire & service allowance.",
  },
  {
    key: "insurance",
    label: "Insurance",
    group: "insurance",
    deductible: true,
    hint: "Driver insurance premiums. Suppresses the prorated monthly premium.",
  },
  {
    key: "registration",
    label: "Registration & Permits",
    group: "registration",
    deductible: true,
    hint: "Supplies the prorated annual registration cost.",
  },
  {
    key: "parking_tolls",
    label: "Parking & Tolls",
    group: "direct",
    deductible: true,
  },
  { key: "phone_data", label: "Phone & Data", group: "direct", deductible: true },
  { key: "supplies", label: "Supplies & Equipment", group: "direct", deductible: true },
  { key: "meals", label: "Meals on Shift", group: "direct", deductible: true },
  { key: "other", label: "Other", group: "direct", deductible: true },
] as const;

export const EXPENSE_CATEGORY_MAP: Record<string, ExpenseCategoryDef> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c]),
);

export function expenseCategory(key: string): ExpenseCategoryDef {
  return (
    EXPENSE_CATEGORY_MAP[key] ?? {
      key,
      label: key,
      group: "direct",
      deductible: true,
    }
  );
}

/** Groups whose modelled estimate is replaced when actual expenses exist. */
export const MODELLED_GROUPS = ["fuel", "maintenance", "tires", "insurance", "registration"] as const;
export type ModelledGroup = (typeof MODELLED_GROUPS)[number];

export interface VehicleCostInputs {
  mpg: number | null;
  fuelPriceCentsPerGallon: number | null;
  maintenanceCentsPerYear: number | null;
  maintenanceMilliPerMile: RateMilli;
  depreciationMilliPerMile: RateMilli;
  insuranceCentsPerMonth: number | null;
  registrationCentsPerYear: number | null;
  recurringServiceCentsPerYear: number | null;
  purchasePriceCents: number | null;
  currentValueCents: number | null;
}
