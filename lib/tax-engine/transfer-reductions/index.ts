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
