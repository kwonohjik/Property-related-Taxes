/**
 * tax_rates 테이블 jsonb 컬럼 Zod 스키마
 * preloadTaxRates 조회 후 safeParse로 타입 검증 필수
 */
import { z } from "zod";

// ============================================================
// 공통: 누진세율 구간 스키마 (progressive_rate, fair_market_ratio)
// ============================================================

const bracketSchema = z.object({
  min: z.number().int().nonnegative().default(0),
  max: z.number().int().positive().optional(), // 최상위 구간은 max 없음
  rate: z.number().min(0).max(1),
  deduction: z.number().int().nonnegative().default(0),
});

export type TaxBracketData = z.infer<typeof bracketSchema>;

export const progressiveRateSchema = z.object({
  brackets: z.array(bracketSchema).min(1),
});

export type ProgressiveRateData = z.infer<typeof progressiveRateSchema>;

// 공정시장가액비율 (단일값 또는 주택수별 구간)
export const fairMarketRatioSchema = z.object({
  ratio: z.number().min(0).max(1).optional(),
  // 종합부동산세: 주택 공시가격 합계 구간별 비율
  brackets: z.array(bracketSchema).optional(),
});

export type FairMarketRatioData = z.infer<typeof fairMarketRatioSchema>;

// ============================================================
// 공제/감면 스키마 (deduction_rules 컬럼)
// ============================================================

const longTermHoldingSchema = z.object({
  type: z.literal("long_term_holding"),
  general: z.object({
    ratePerYear: z.number().min(0).max(1),
    maxRate: z.number().min(0).max(1),
    minHoldingYears: z.number().int().positive(),
  }),
  oneHouseSpecial: z.object({
    holdingRatePerYear: z.number().min(0).max(1),
    holdingMaxRate: z.number().min(0).max(1),
    residenceRatePerYear: z.number().min(0).max(1),
    residenceMaxRate: z.number().min(0).max(1),
    combinedMaxRate: z.number().min(0).max(1),
    minHoldingYears: z.number().int().positive(),
  }),
  exclusions: z.array(z.string()),
});

const basicDeductionSchema = z.object({
  type: z.literal("basic_deduction"),
  annualLimit: z.number().int().positive(),
  excludeUnregistered: z.boolean(),
});

const selfFarmingSchema = z.object({
  type: z.literal("self_farming"),
  maxRate: z.number().min(0).max(1),
  maxAmount: z.number().int().positive(),
  periodYears: z.number().int().positive(),
  cumulativeMax: z.number().int().positive(),
  conditions: z.object({
    minFarmingYears: z.number().int().positive(),
    requiresProof: z.boolean(),
    maxResidenceDistance: z.number().int().nonnegative(),
  }),
});

const longTermRentalSchema = z.object({
  type: z.literal("long_term_rental"),
  conditions: z.object({
    minRentalYears: z.number().int().positive(),
    maxRentIncreaseRate: z.number().min(0).max(1),
    requiresRegistration: z.boolean(),
  }),
});

const newHousingSchema = z.object({
  type: z.literal("new_housing"),
  reductionRates: z.array(
    z.object({
      region: z.enum(["metropolitan", "non_metropolitan"]),
      yearsFromAcquisition: z.number().int().positive(),
      rate: z.number().min(0).max(1),
    }),
  ),
});

const unsoldHousingSchema = z.object({
  type: z.literal("unsold_housing"),
  conditions: z.object({
    region: z.enum(["metropolitan", "non_metropolitan"]),
    requiresBusinessRegistration: z.boolean(),
  }),
});

export const deductionRulesSchema = z.discriminatedUnion("type", [
  longTermHoldingSchema,
  basicDeductionSchema,
  selfFarmingSchema,
  longTermRentalSchema,
  newHousingSchema,
  unsoldHousingSchema,
]);

export type DeductionRulesData = z.infer<typeof deductionRulesSchema>;

// ============================================================
// 중과세 스키마 (rate_table 컬럼 — surcharge category)
// ============================================================

export const surchargeRateSchema = z.object({
  multi_house_2: z
    .object({
      additionalRate: z.number().min(0).max(1),
      condition: z.string(),
      referenceDate: z.literal("transfer_date"),
    })
    .optional(),
  multi_house_3plus: z
    .object({
      additionalRate: z.number().min(0).max(1),
      condition: z.string(),
      referenceDate: z.literal("transfer_date"),
    })
    .optional(),
  non_business_land: z
    .object({
      additionalRate: z.number().min(0).max(1),
    })
    .optional(),
  unregistered: z
    .object({
      flatRate: z.number().min(0).max(1),
      excludeDeductions: z.boolean(),
      excludeBasicDeduction: z.boolean(),
    })
    .optional(),
});

export type SurchargeRateData = z.infer<typeof surchargeRateSchema>;

// ============================================================
// 유예/특례 스키마 (special_rules 컬럼)
// ============================================================

export const surchargeSpecialRulesSchema = z.object({
  surcharge_suspended: z.boolean(),
  suspended_types: z.array(z.string()).optional(),
  suspended_until: z.string().optional(), // ISO date string
  legal_basis: z.string().optional(),
});

export const oneHouseSpecialRulesSchema = z.object({
  one_house_exemption: z.object({
    maxExemptPrice: z.number().int().positive(),
    minHoldingYears: z.number().int().positive(),
    regulatedAreaMinResidenceYears: z.number().int().positive(),
    prePolicyDate: z.string(), // ISO date string
    prePolicyExemptResidence: z.boolean(),
  }),
  temporary_two_house: z
    .object({
      disposalDeadlineYears: z.number().int().positive(),
      regulatedAreaDeadlineYears: z.number().int().positive(),
      regulatedAreaRelaxDate: z.string().optional(),
      regulatedAreaRelaxDeadlineYears: z.number().int().positive().optional(),
    })
    .optional(),
});

export type SurchargeSpecialRulesData = z.infer<typeof surchargeSpecialRulesSchema>;
export type OneHouseSpecialRulesData = z.infer<typeof oneHouseSpecialRulesSchema>;

// ============================================================
// 런타임 safeParse 헬퍼
// ============================================================

import { TaxRateValidationError } from "@/lib/tax-engine/tax-errors";

export function parseProgressiveRate(raw: unknown): ProgressiveRateData {
  const result = progressiveRateSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`누진세율 구조 오류: ${result.error.message}`);
  }
  return result.data;
}

export function parseDeductionRules(raw: unknown): DeductionRulesData {
  const result = deductionRulesSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`공제/감면 규칙 구조 오류: ${result.error.message}`);
  }
  return result.data;
}

export function parseSurchargeRate(raw: unknown): SurchargeRateData {
  const result = surchargeRateSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`중과세율 구조 오류: ${result.error.message}`);
  }
  return result.data;
}
