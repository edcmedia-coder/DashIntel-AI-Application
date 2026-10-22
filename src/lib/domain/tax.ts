import { type Cents, type RateMilli, milliRate, sumCents } from "./money";
import type { CostLine } from "./profit";

/**
 * Deterministic US federal tax estimate for gig earnings.
 *
 * Every figure below is a published rate for tax year 2026:
 *  - Brackets: IRS Rev. Proc. 2025-32 (IR-2025-103, Oct. 9 2025)
 *  - Standard deduction: $16,100 single / $32,200 MFJ / $24,150 HoH
 *  - Self-employment tax: 15.3% (12.4% SS to the $184,500 wage base, 2.9%
 *    Medicare uncapped), 92.35% factor
 *  - Standard mileage: 72.5¢/mi (Jan 1 – Jun 30 2026), 76¢/mi (Jul 1 – Dec 31 2026)
 *    per Notice 2026-10 and IRB 2026-29
 *
 * The output is always labelled ESTIMATED. It is a planning aid, not tax
 * advice, and it deliberately does not include state income tax unless the
 * driver supplies a rate.
 */

export const TAX_YEAR = 2026;

export type FilingStatus = "single" | "married_joint" | "head_of_household" | "married_separate";
export type IncomeTreatment = "self_employment" | "w2_employee";

export interface Bracket {
  upTo: Cents | null; // null = no upper bound
  rate: number;
}

export const FEDERAL_BRACKETS_2026: Record<FilingStatus, Bracket[]> = {
  single: [
    { upTo: 12_400_00, rate: 0.1 },
    { upTo: 50_400_00, rate: 0.12 },
    { upTo: 105_700_00, rate: 0.22 },
    { upTo: 201_775_00, rate: 0.24 },
    { upTo: 256_225_00, rate: 0.32 },
    { upTo: 640_600_00, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  married_joint: [
    { upTo: 24_800_00, rate: 0.1 },
    { upTo: 100_800_00, rate: 0.12 },
    { upTo: 211_400_00, rate: 0.22 },
    { upTo: 403_550_00, rate: 0.24 },
    { upTo: 512_450_00, rate: 0.32 },
    { upTo: 768_700_00, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  head_of_household: [
    { upTo: 17_700_00, rate: 0.1 },
    { upTo: 67_450_00, rate: 0.12 },
    { upTo: 105_700_00, rate: 0.22 },
    { upTo: 201_750_00, rate: 0.24 },
    { upTo: 256_200_00, rate: 0.32 },
    { upTo: 640_600_00, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  married_separate: [
    { upTo: 12_400_00, rate: 0.1 },
    { upTo: 50_400_00, rate: 0.12 },
    { upTo: 105_700_00, rate: 0.22 },
    { upTo: 201_775_00, rate: 0.24 },
    { upTo: 256_225_00, rate: 0.32 },
    { upTo: 320_300_00, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
};

export const STANDARD_DEDUCTION_2026: Record<FilingStatus, Cents> = {
  single: 16_100_00,
  married_joint: 32_200_00,
  head_of_household: 24_150_00,
  married_separate: 16_100_00,
};

export const SELF_EMPLOYMENT = {
  /** Net earnings factor (1 - 7.65% employee FICA). */
  factor: 0.9235,
  socialSecurityRate: 0.124,
  medicareRate: 0.029,
  additionalMedicareRate: 0.009,
  socialSecurityWageBase: 184_500_00,
  additionalMedicareThreshold: { single: 200_000_00, married_joint: 250_000_00 } as Record<
    FilingStatus,
    Cents
  >,
};

export interface MileageRatePeriod {
  from: string; // ISO date, inclusive
  to: string; // ISO date, inclusive
  rateMilliPerMile: RateMilli;
  note: string;
}

export const MILEAGE_RATES_2026: MileageRatePeriod[] = [
  {
    from: "2026-01-01",
    to: "2026-06-30",
    rateMilliPerMile: milliRate(0.725),
    note: "IRS Notice 2026-10",
  },
  {
    from: "2026-07-01",
    to: "2026-12-31",
    rateMilliPerMile: milliRate(0.76),
    note: "IRS IRB 2026-29 (revised mid-year)",
  },
];

/** Cost groups that the standard mileage rate already covers. */
export const VEHICLE_COST_KEYS = [
  "fuel",
  "maintenance",
  "tires",
  "insurance",
  "registration",
  "depreciation",
] as const;

export function sumCostByKeys(costs: CostLine[], keys: readonly string[]): Cents {
  return sumCents(costs.filter((c) => keys.includes(c.key)).map((c) => c.amountCents));
}

export function applyBrackets(taxableIncome: Cents, brackets: Bracket[]): Cents {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lowerBound = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= lowerBound) break;
    const upper = bracket.upTo ?? taxableIncome;
    const slice = Math.min(taxableIncome, upper) - lowerBound;
    if (slice > 0) tax += slice * bracket.rate;
    lowerBound = upper;
  }
  return Math.round(tax);
}

/**
 * Standard mileage deduction for a window, honouring the mid-2026 rate change.
 * `windowStart`/`windowEnd` are ISO dates; miles are split across rate periods
 * by day proportion.
 */
export function mileageDeductionCents(
  businessMiles: number,
  windowStart: Date,
  windowEnd: Date,
  periods: MileageRatePeriod[] = MILEAGE_RATES_2026,
): { totalCents: Cents; breakdown: { label: string; miles: number; cents: Cents; note: string }[] } {
  const totalDays = Math.max(1, Math.round((windowEnd.getTime() - windowStart.getTime()) / 86_400_000));
  const breakdown: { label: string; miles: number; cents: Cents; note: string }[] = [];
  let total = 0;

  for (const period of periods) {
    const pStart = new Date(`${period.from}T00:00:00Z`).getTime();
    const pEnd = new Date(`${period.to}T23:59:59Z`).getTime();
    const overlapStart = Math.max(pStart, windowStart.getTime());
    const overlapEnd = Math.min(pEnd, windowEnd.getTime());
    if (overlapEnd < overlapStart) continue;

    const overlapDays = Math.round((overlapEnd - overlapStart) / 86_400_000) + 1;
    const share = Math.min(1, overlapDays / totalDays);
    const miles = businessMiles * share;
    const cents = Math.round((miles * period.rateMilliPerMile) / 1000);
    total += cents;
    breakdown.push({
      label: `${period.from} → ${period.to}`,
      miles: Number(miles.toFixed(2)),
      cents,
      note: period.note,
    });
  }

  return { totalCents: total, breakdown };
}

export interface TaxInput {
  grossEarningsCents: Cents;
  /** Deductible business costs already netted out, cents. */
  deductibleCostsCents: Cents;
  /** Vehicle-related portion of deductibleCostsCents, cents. */
  vehicleCostCents: Cents;
  businessMiles: number;
  windowStart: Date;
  windowEnd: Date;
  filingStatus: FilingStatus;
  incomeTreatment: IncomeTreatment;
  /** Optional flat state income tax rate, e.g. 0.05 for 5%. */
  stateEffectiveRate?: number | null;
  stateName?: string | null;
  /** User-supplied other W-2 income for the same year, cents. */
  otherWagesCents?: Cents;
}

export interface TaxBreakdown {
  taxYear: number;
  grossEarningsCents: Cents;
  deductibleCostsCents: Cents;
  netProfitCents: Cents;

  selfEmploymentTaxCents: Cents;
  socialSecurityTaxCents: Cents;
  medicareTaxCents: Cents;
  additionalMedicareTaxCents: Cents;
  deductibleHalfSeTaxCents: Cents;

  adjustedGrossIncomeCents: Cents;
  standardDeductionCents: Cents;
  taxableIncomeCents: Cents;
  federalIncomeTaxCents: Cents;
  federalEffectiveRate: number | null;

  stateTaxCents: Cents | null;
  stateNote: string;

  totalTaxCents: Cents;
  takeHomeCents: Cents;

  /** Alternative: standard mileage deduction instead of itemised vehicle costs. */
  mileageAlternative: {
    deductionCents: Cents;
    netProfitCents: Cents;
    totalTaxCents: Cents;
    takeHomeCents: Cents;
    betterTakeHome: boolean;
    breakdown: { label: string; miles: number; cents: Cents; note: string }[];
  };
}

export function estimateTax(input: TaxInput): TaxBreakdown {
  const netProfitCents = input.grossEarningsCents - input.deductibleCostsCents;

  const brackets = FEDERAL_BRACKETS_2026[input.filingStatus];
  const standardDeduction = STANDARD_DEDUCTION_2026[input.filingStatus];

  let seTax = 0;
  let ssTax = 0;
  let medicareTax = 0;
  let additionalMedicare = 0;
  let halfSeDeduction = 0;

  if (input.incomeTreatment === "self_employment" && netProfitCents > 0) {
    const seBase = netProfitCents * SELF_EMPLOYMENT.factor;
    const ssTaxable = Math.min(seBase, SELF_EMPLOYMENT.socialSecurityWageBase);
    ssTax = ssTaxable * SELF_EMPLOYMENT.socialSecurityRate;
    medicareTax = seBase * SELF_EMPLOYMENT.medicareRate;

    const threshold =
      SELF_EMPLOYMENT.additionalMedicareThreshold[input.filingStatus] ??
      SELF_EMPLOYMENT.additionalMedicareThreshold.single;
    additionalMedicare = Math.max(0, netProfitCents - threshold) * SELF_EMPLOYMENT.additionalMedicareRate;

    seTax = ssTax + medicareTax + additionalMedicare;
    halfSeDeduction = seTax / 2;
  }

  const otherWages = input.otherWagesCents ?? 0;
  const agi = netProfitCents - halfSeDeduction + otherWages;
  const taxableIncome = Math.max(0, agi - standardDeduction);
  const federalIncomeTax = applyBrackets(taxableIncome, brackets);

  const stateTax =
    input.stateEffectiveRate === null || input.stateEffectiveRate === undefined
      ? null
      : Math.round(Math.max(0, taxableIncome) * input.stateEffectiveRate);

  const totalTax = seTax + federalIncomeTax + (stateTax ?? 0);
  const takeHome = netProfitCents - totalTax;

  // --- Mileage deduction alternative -------------------------------------
  const mileage = mileageDeductionCents(
    input.businessMiles,
    input.windowStart,
    input.windowEnd,
  );
  const nonVehicleCosts = input.deductibleCostsCents - input.vehicleCostCents;
  const altNetProfit = input.grossEarningsCents - nonVehicleCosts - mileage.totalCents;

  let altSeTax = 0;
  let altHalfSe = 0;
  if (input.incomeTreatment === "self_employment" && altNetProfit > 0) {
    const seBase = altNetProfit * SELF_EMPLOYMENT.factor;
    const ssTaxable = Math.min(seBase, SELF_EMPLOYMENT.socialSecurityWageBase);
    const ss = ssTaxable * SELF_EMPLOYMENT.socialSecurityRate;
    const med = seBase * SELF_EMPLOYMENT.medicareRate;
    const threshold =
      SELF_EMPLOYMENT.additionalMedicareThreshold[input.filingStatus] ??
      SELF_EMPLOYMENT.additionalMedicareThreshold.single;
    const addl = Math.max(0, altNetProfit - threshold) * SELF_EMPLOYMENT.additionalMedicareRate;
    altSeTax = ss + med + addl;
    altHalfSe = altSeTax / 2;
  }
  const altAgi = altNetProfit - altHalfSe + otherWages;
  const altTaxable = Math.max(0, altAgi - standardDeduction);
  const altFederal = applyBrackets(altTaxable, brackets);
  const altState =
    input.stateEffectiveRate === null || input.stateEffectiveRate === undefined
      ? null
      : Math.round(altTaxable * input.stateEffectiveRate);
  const altTotal = altSeTax + altFederal + (altState ?? 0);

  return {
    taxYear: TAX_YEAR,
    grossEarningsCents: input.grossEarningsCents,
    deductibleCostsCents: input.deductibleCostsCents,
    netProfitCents,

    selfEmploymentTaxCents: Math.round(seTax),
    socialSecurityTaxCents: Math.round(ssTax),
    medicareTaxCents: Math.round(medicareTax),
    additionalMedicareTaxCents: Math.round(additionalMedicare),
    deductibleHalfSeTaxCents: Math.round(halfSeDeduction),

    adjustedGrossIncomeCents: Math.round(agi),
    standardDeductionCents: standardDeduction,
    taxableIncomeCents: Math.round(taxableIncome),
    federalIncomeTaxCents: Math.round(federalIncomeTax),
    federalEffectiveRate: taxableIncome > 0 ? federalIncomeTax / taxableIncome : null,

    stateTaxCents: stateTax,
    stateNote:
      stateTax === null
        ? "State income tax not configured. Federal only."
        : `Flat ${(input.stateEffectiveRate! * 100).toFixed(2)}% estimate applied to taxable income.`,

    totalTaxCents: Math.round(totalTax),
    takeHomeCents: Math.round(takeHome),

    mileageAlternative: {
      deductionCents: mileage.totalCents,
      netProfitCents: Math.round(altNetProfit),
      totalTaxCents: Math.round(altTotal),
      takeHomeCents: Math.round(altNetProfit - altTotal),
      betterTakeHome: altNetProfit - altTotal > takeHome,
      breakdown: mileage.breakdown,
    },
  };
}
