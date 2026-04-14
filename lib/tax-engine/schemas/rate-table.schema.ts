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
// 다주택 중과세 관련 스키마 (special category)
// ============================================================

/** 주택 수 산정 배제 규칙 (transfer:special:house_count_exclusion) */
export const houseCountExclusionSchema = z.object({
  type: z.literal("house_count_exclusion"),
  inheritedHouseYears: z.number().int().positive(),     // 상속주택 배제 기간 (5년)
  rentalHousingExempt: z.boolean(),                     // 장기임대 배제 여부 (true)
  lowPriceThreshold: z.object({
    capital: z.number().int().nullable(),               // 수도권: null (배제 없음)
    non_capital: z.number().int().nonnegative(),        // 비수도권: 100_000_000
  }),
  presaleRightStartDate: z.string(),                    // "2021-01-01"
  officetelStartDate: z.string(),                       // "2022-01-01"
});

export type HouseCountExclusionData = z.infer<typeof houseCountExclusionSchema>;

/** 조정대상지역 지정 이력 (transfer:special:regulated_areas) */
export const regulatedAreaHistorySchema = z.object({
  type: z.literal("regulated_area_history"),
  regions: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      designations: z.array(
        z.object({
          designatedDate: z.string(),       // "YYYY-MM-DD"
          releasedDate: z.string().nullable(),
        }),
      ),
    }),
  ),
});

export type RegulatedAreaHistoryData = z.infer<typeof regulatedAreaHistorySchema>;

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

export function parseHouseCountExclusion(raw: unknown): HouseCountExclusionData {
  const result = houseCountExclusionSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`주택 수 산정 규칙 구조 오류: ${result.error.message}`);
  }
  return result.data;
}

export function parseRegulatedAreaHistory(raw: unknown): RegulatedAreaHistoryData {
  const result = regulatedAreaHistorySchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`조정대상지역 이력 구조 오류: ${result.error.message}`);
  }
  return result.data;
}

// ============================================================
// 장기임대주택 감면 규칙 V2 스키마 (transfer:deduction:long_term_rental_v2)
// 기존 longTermRentalSchema (단순 조건 기반)는 유지하고 V2를 별도 스키마로 추가
// ============================================================

const longTermRentalSubTypeSchema = z.object({
  code: z.enum([
    "public_construction",
    "long_term_private",
    "public_support_private",
    "public_purchase",
  ]),
  lawArticle: z.string(),
  mandatoryYears: z.number().int().nonnegative().optional(),
  reductionRate: z.number().min(0).max(1).optional(),
  tiers: z
    .array(
      z.object({
        mandatoryYears: z.number().int().positive(),
        reductionRate: z.number().min(0).max(1),
        longTermDeductionRate: z.number().min(0).max(1),
      }),
    )
    .optional(),
  maxOfficialPrice: z
    .object({
      capital: z.number().int().positive().nullable(),
      non_capital: z.number().int().positive().nullable(),
    })
    .optional(),
  rentIncreaseLimit: z.number().min(0).max(1).nullable().optional(),
  fullReductionAfterMandatory: z.boolean().optional(),
  conditions: z
    .object({
      mustSellToPublicEntity: z.boolean().optional(),
    })
    .optional(),
});

export const longTermRentalRuleSetSchema = z.object({
  type: z.literal("long_term_rental_v2"),
  subTypes: z.array(longTermRentalSubTypeSchema),
  /** 전월세전환율 (기본값 0.04 = 4%). DB에서 세법 개정 시 변경 가능 */
  jeonseConversionRate: z.number().positive().optional(),
});

export type LongTermRentalRuleSet = z.infer<typeof longTermRentalRuleSetSchema>;

export function parseLongTermRentalRuleSet(raw: unknown): LongTermRentalRuleSet {
  const result = longTermRentalRuleSetSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(
      `장기임대 감면 규칙 구조 오류: ${result.error.message}`,
    );
  }
  return result.data;
}

// ============================================================
// 비사업용 토지 판정 기준 스키마 (transfer:special:non_business_land_judgment)
// ============================================================

export const nonBusinessLandJudgmentSchema = z.object({
  type: z.literal("non_business_land_judgment"),
  buildingAreaMultipliers: z.object({
    residential: z.number().int().positive(),
    commercial: z.number().int().positive(),
    industrial: z.number().int().positive(),
    green: z.number().int().positive(),
    management: z.number().int().positive(),
    agriculture_forest: z.number().int().positive(),
    natural_env: z.number().int().positive(),
    undesignated: z.number().int().positive(),
  }),
  farmlandDistanceKm: z.number().int().positive(),
  exemptionPeriods: z.object({
    inheritance: z.number().int().positive(),    // 5년
    construction: z.number().int().positive(),   // 2년
    unavoidable: z.number().int().positive(),    // 2년
    preparation: z.number().int().positive(),    // 2년
    sale_contract: z.number().int().positive(),  // 2년
  }),
});

export type NonBusinessLandJudgmentSchemaData = z.infer<typeof nonBusinessLandJudgmentSchema>;

export function parseNonBusinessLandJudgment(raw: unknown): NonBusinessLandJudgmentSchemaData {
  const result = nonBusinessLandJudgmentSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`비사업용 토지 판정 기준 구조 오류: ${result.error.message}`);
  }
  return result.data;
}

// ============================================================
// 신축주택·미분양주택 감면 매트릭스 스키마 (transfer:deduction:new_housing_matrix)
// 조세특례제한법 §98의2, §99①~⑥, §99의3①~⑩ 모든 항 포함
// ============================================================

const newHousingArticleSchema = z.object({
  /** 조문 코드 (예: "99-1", "98-2-1") — DB 내 고유 식별자 */
  code: z.string(),
  /** 조문 표시명 (예: "§99 ①") */
  article: z.string(),
  /** 감면 대상 취득 기간 */
  acquisitionPeriod: z.object({
    start: z.string(), // "YYYY-MM-DD"
    end: z.string(),   // "YYYY-MM-DD"
  }),
  /** 허용 지역: nationwide/metropolitan/non_metropolitan/outside_overconcentration */
  region: z.enum(["nationwide", "metropolitan", "non_metropolitan", "outside_overconcentration"]),
  /** 취득가액 상한 (null = 제한 없음) */
  maxAcquisitionPrice: z.number().int().nullable(),
  /** 전용면적 상한 ㎡ (null = 제한 없음) */
  maxArea: z.number().nullable(),
  /** 사업주체로부터 최초 취득 요건 */
  requiresFirstSale: z.boolean(),
  /** 미분양 확인서 요건 */
  requiresUnsoldCertificate: z.boolean(),
  /** 감면 범위: tax_amount=산출세액 감면 / capital_gain=양도차익 기준 감면 */
  reductionScope: z.enum(["tax_amount", "capital_gain"]),
  /** 기본 감면율 (0.0~1.0) */
  reductionRate: z.number().min(0).max(1),
  /**
   * 5년 이내 양도 시 전액 감면, 5년 초과 양도 시 5년간 양도차익 안분 감면 규칙 적용 여부
   * (§99① 등 신축주택 capital_gain 방식에 적용)
   */
  fiveYearWindowRule: z.boolean(),
  /** 다주택 주택 수 산정에서 제외 여부 */
  isExcludedFromHouseCount: z.boolean(),
  /** 다주택 중과세 배제 여부 */
  isExcludedFromMultiHouseSurcharge: z.boolean(),
});

export const newHousingMatrixSchema = z.object({
  type: z.literal("new_housing_matrix"),
  articles: z.array(newHousingArticleSchema),
});

export type NewHousingMatrixData = z.infer<typeof newHousingMatrixSchema>;

export function parseNewHousingMatrix(raw: unknown): NewHousingMatrixData {
  const result = newHousingMatrixSchema.safeParse(raw);
  if (!result.success) {
    throw new TaxRateValidationError(`신축주택 감면 매트릭스 구조 오류: ${result.error.message}`);
  }
  return result.data;
}
