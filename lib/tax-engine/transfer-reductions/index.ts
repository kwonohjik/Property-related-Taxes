/**
 * 양도세 감면 23개 조문 라우터 (Phase 1 골격)
 *
 * 단일 진입점 `evaluateReduction(input)`:
 *   1. 메타데이터 조회 (id → article·category·effect)
 *   2. checkReductionPeriod(id, ctx) 시한 검증
 *   3. 시한 외면 isEligible:false + failReason 반환
 *   4. 시한 내면 isEligible:false + "구현 예정 (Phase 2~)" 반환
 *
 * Phase 2~ 본격 구현 시:
 *   - 각 ID별 분기 모듈(`new-99-3.ts`, `unsold-98-3.ts` 등)을 import
 *   - 본 라우터의 switch에 분기 추가
 *   - 시한 통과 케이스만 본 모듈로 라우팅
 */

import { checkReductionPeriod, getReductionPeriodLabel } from "./period-check";
import { REDUCTION_METADATA, ALL_REDUCTION_IDS, getReductionsByCategory } from "./metadata";
import type {
  TransferReductionId,
  ReductionCategory,
  ReductionEvaluationInput,
  ReductionStubResult,
  PeriodCheckContext,
} from "./types";

// ── 재export ──
export { checkReductionPeriod, getReductionPeriodLabel } from "./period-check";
export { REDUCTION_METADATA, ALL_REDUCTION_IDS, getReductionsByCategory, CATEGORY_UI_SCHEMA } from "./metadata";
export {
  isReductionCategoryAllowedForAssetKind,
  isReductionAllowedForAssetKind,
  type ReductionAssetKind,
} from "./asset-kind-gate";
export type { ReductionMetadata, CategoryUiSchema } from "./metadata";
export type {
  TransferReductionId,
  ReductionCategory,
  ReductionEvaluationInput,
  ReductionStubResult,
  PeriodCheckContext,
  PeriodCheckResult,
} from "./types";

// ── Phase 2: §99의3 본격 구현체 ──
export {
  evaluateNew993,
  isHighValueHouseUnder993,
  type New993Input,
  type New993Result,
  type New993FormulaStep,
  type New993IneligibleReason,
  type New993SignCase,
} from "./new-99-3";

// ── Round 10 (2026-05-06): PHD 환산 공통 헬퍼 ──
export {
  calcReductionAcquisitionStdPrice,
  canCalcReductionPhd,
  type ReductionPhdInput,
  type ReductionPhdResult,
} from "./phd-helper";

// ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 본격 구현 ──
export {
  evaluateRental97Lthd,
  evaluateRental97TaxAmount,
  type Rental97EngineContext,
} from "./rental-97-router";
export {
  evaluateRental973,
  RENTAL_97_3_OVERRIDE_RATE,
  RENTAL_97_3_OVERRIDE_RATE_8YEAR,
  RENTAL_97_3_MANDATORY_YEARS,
  RENTAL_97_3_MANDATORY_YEARS_8YEAR,
  RENTAL_97_3_PRE_2023_REG_CUTOFF,
} from "./rental-97-3";
export { evaluateRental974, getRental974AdditionalRate, RENTAL_97_4_ADDITIONAL_RATE_TABLE } from "./rental-97-4";
export { evaluateRental975, RENTAL_97_5_REGISTRATION_MONTHS } from "./rental-97-5";
export { evaluateRental97Main } from "./rental-97-main";
export { evaluateRental972 } from "./rental-97-2";
export {
  calculateEffectiveRentalPeriod,
  validateRentIncrease,
  convertToStandardDeposit,
  calcRentalGainRatio,
  RENTAL_VACANCY_GRACE_DAYS,
} from "./rental-97-shared-helpers";
export type {
  Rental97ArticleId,
  Rental97EvaluationInput,
  Rental97Result,
  Rental97IneligibleReason,
  RentalLthdEffect,
  RentalTaxAmountEffect,
} from "./types";

// ── §99의4 농어촌·고향주택 — 주택수 제외 (2026-06-11) ──
export {
  evaluateNew994,
  NEW_99_4_RURAL_FROM,
  NEW_99_4_HOMETOWN_FROM,
  NEW_99_4_PERIOD_TO,
  NEW_99_4_STD_PRICE_LIMIT,
  NEW_99_4_STD_PRICE_LIMIT_HANOK,
  NEW_99_4_MANDATORY_YEARS,
} from "./new-99-4";
export type {
  New994ArticleId,
  New994EvaluationInput,
  New994Result,
  New994IneligibleCode,
  New994IneligibleReason,
} from "./types";

// ── §98의9 수도권 밖 준공후미분양 — 주택수 제외 (2026-06-11) ──
export {
  evaluateUnsold989,
  evaluateUnsold989FromReductions,
  resolveHouseCountExclusion,
  UNSOLD_98_9_FROM,
  UNSOLD_98_9_TO,
  UNSOLD_98_9_PRICE_LIMIT,
  UNSOLD_98_9_AREA_LIMIT_SQM,
  type HouseCountExclusionResolution,
} from "./unsold-98-9";
export type {
  Unsold989EvaluationInput,
  Unsold989Result,
  Unsold989IneligibleCode,
  Unsold989IneligibleReason,
} from "./types";

// ── P1 차감형 (2026-06-11): §99 (IMF 1차) + §98의8 + 공용 라우터 ──
export {
  evaluateNew99,
  NEW_99_PERIOD_START,
  NEW_99_PERIOD_END,
  NEW_99_PERIOD_END_NATIONAL,
  type New99Input,
  type New99Result,
  type New99IneligibleCode,
  type New99IneligibleReason,
} from "./new-99";
export {
  evaluateUnsold988,
  fullMonthsBetween,
  UNSOLD_98_8_PRICE_LIMIT,
  UNSOLD_98_8_AREA_LIMIT_SQM,
  UNSOLD_98_8_DEDUCTION_RATE,
  UNSOLD_98_8_RENTAL_MONTHS,
  type Unsold988Input,
  type Unsold988Result,
  type Unsold988IneligibleCode,
  type Unsold988IneligibleReason,
} from "./unsold-98-8";
export {
  resolveIncomeDeduction,
  resolveSurchargeExclusionByReduction,
  buildIncomeDeductionStep,
  buildSurchargeExclusionStep,
  SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS,
  type IncomeDeductionId,
  type IncomeDeductionContext,
  type IncomeDeductionResolution,
} from "./income-deduction-router";

// ── P2 하이브리드 (2026-06-11): §98의7 + §99의2 (5년 내 세액감면 + 5년 후 차감) ──
export {
  evaluateUnsold987,
  evaluateUnsold992,
  evaluateHybridFromReduction,
  evaluateHybridTaxAmountFromReductions,
  UNSOLD_98_7_PRICE_LIMIT,
  UNSOLD_99_2_PRICE_LIMIT,
  UNSOLD_99_2_AREA_LIMIT_SQM,
  type UnsoldHybridId,
  type UnsoldHybridResult,
  type Unsold987Input,
  type Unsold992Input,
  type Unsold992HouseType,
} from "./unsold-hybrid";

// ── P3 하이브리드 (2026-06-12): §98의3 + §98의5 + §98의6 ──
export {
  evaluateUnsold983,
  evaluateUnsold985,
  evaluateUnsold986,
  evaluateAnyHybridFromReduction,
  evaluateAnyHybridTaxAmount,
  resolve985Rate,
  RATE_SPECIAL_REDUCTION_IDS,
  type Unsold983Input,
  type Unsold985Input,
  type Unsold986Input,
} from "./unsold-hybrid-p3";

// ── P4 (2026-06-12): §98의2 (특칙 전용) + §98의4 (비거주자 10%) ──
export {
  evaluateUnsold982,
  evaluateUnsold984,
  table2HoldingRate,
  UNSOLD_98_4_RATE,
  type Unsold982Input,
  type Unsold984Input,
} from "./unsold-hybrid-p4";

// ── P5 (2026-06-12): §98 (세율 20%) + 모드 2 N-way ──
export {
  evaluateUnsold98,
  resolveSpecialHouseExclusions,
  SPECIAL_HOUSE_EXCLUSION_WINDOWS,
  UNSOLD_98_FLAT_RATE,
  type Unsold98Input,
  type SpecialHouseExclusionArticle,
  type SpecialHouseExclusionInput,
  type SpecialHouseExclusionResolution,
} from "./unsold-hybrid-p5";

/**
 * 23개 조문 통합 stub evaluator. Phase 1 단계는 모두 isEligible:false 반환.
 * 시한 외 케이스는 명시적 사유, 시한 내 케이스는 "구현 예정" 사유.
 */
export function evaluateReduction(input: ReductionEvaluationInput): ReductionStubResult {
  const meta = REDUCTION_METADATA[input.id];
  const period = checkReductionPeriod(input.id, input);

  const failReason = !period.inPeriod
    ? (period.failReason ?? `${meta.article} 시한 외`)
    : `${meta.article} — Phase 2 본격 구현 예정 (현재는 시한 검증만 수행)`;

  return {
    id: input.id,
    isEligible: false,
    inPeriod: period.inPeriod,
    failReason,
    legalBasis: meta.article,
    category: meta.category,
    effectCategory: meta.effectCategory,
    meta: {
      article: meta.article,
      periodLabel: meta.id === "self_farming" || meta.id === "public_expropriation"
        ? "시한 없음"
        : getReductionPeriodLabel(meta.id),
      effectLabel: meta.effectLabel,
    },
  };
}

/**
 * UI 펼침 헤더용 활성/전체 카운터 (사용자 결정사항 #3-4).
 *
 * 시한 검증 결과 `inPeriod === true` 인 항목 수를 카테고리별로 반환.
 * 자산 컨텍스트(취득일·양도일·등록일 등) 기반으로 useMemo 계산 권장
 * (memory `feedback_useeffect_store_mirror_forbidden.md` 정책 — useEffect 미러링 금지).
 *
 * @example
 * const counters = countActiveReductionsByCategory({
 *   transferDate: new Date("2023-02-16"),
 *   acquisitionDate: new Date("2003-09-23"),
 *   contractDate: new Date("2001-05-24"),
 * });
 * // counters.new_housing = { active: 1, total: 4 }  // §99의3만 활성
 */
export function countActiveReductionsByCategory(
  ctx: PeriodCheckContext,
): Record<ReductionCategory, { active: number; total: number }> {
  const groups = getReductionsByCategory();
  const result: Record<ReductionCategory, { active: number; total: number }> = {
    rental: { active: 0, total: 0 },
    new_housing: { active: 0, total: 0 },
    unsold_housing: { active: 0, total: 0 },
    standalone: { active: 0, total: 0 },
  };
  for (const cat of Object.keys(groups) as ReductionCategory[]) {
    const items = groups[cat];
    result[cat].total = items.length;
    for (const meta of items) {
      const r = checkReductionPeriod(meta.id, ctx);
      if (r.inPeriod) result[cat].active += 1;
    }
  }
  return result;
}

/**
 * UI 항목별 활성 여부 일괄 조회. 펼침 패널 안의 23개 항목 disabled/enabled 결정.
 *
 * @returns `{ [id]: { inPeriod, failReason, periodLabel } }` map
 */
export function evaluateAllPeriods(
  ctx: PeriodCheckContext,
): Record<TransferReductionId, { inPeriod: boolean; failReason?: string; periodLabel?: string }> {
  const result = {} as Record<TransferReductionId, { inPeriod: boolean; failReason?: string; periodLabel?: string }>;
  for (const id of ALL_REDUCTION_IDS) {
    result[id] = checkReductionPeriod(id, ctx);
  }
  return result;
}
