/**
 * 양도세 감면 24개 조문 — 공용 메타·시한·게이트 배럴 + 평가기 re-export
 *
 * **진입점은 하나가 아니다.** 효과 유형별로 4계열이 각각 진입점이다:
 *   - 세액감면형   → `calcReductions` (transfer-tax-reductions-calc.ts)
 *   - 소득차감형   → `resolveIncomeDeduction` (income-deduction-router.ts)
 *   - 장특공 대체형 → `evaluateRental97Lthd` (rental-97-router.ts)
 *   - 주택수 제외형 → `resolveHouseCountExclusion` (unsold-98-9.ts)
 *
 * 본 파일은 그 4계열이 공유하는 메타데이터(`REDUCTION_METADATA`)·시한 판정
 * (`checkReductionPeriod`)·자산종류 게이트(`asset-kind-gate`)를 모아 re-export한다.
 *
 * (Phase 1의 통합 stub `evaluateReduction`은 호출부 0건 dead code여서 제거했다 — D9-04.
 *  「단일 진입점」 서술이 신규 조문을 죽은 분기에 배선하도록 오유도하고 있었다.)
 */

import { checkReductionPeriod } from "./period-check";
import { ALL_REDUCTION_IDS, getReductionsByCategory } from "./metadata";
import type {
  TransferReductionId,
  ReductionCategory,
  PeriodCheckContext,
} from "./types";

// ── 재export ──
export { checkReductionPeriod, getReductionPeriodLabel } from "./period-check";
export { REDUCTION_METADATA, ALL_REDUCTION_IDS, getReductionsByCategory, CATEGORY_UI_SCHEMA } from "./metadata";
export {
  isReductionCategoryAllowedForAssetKind,
  isReductionAllowedForAssetKind,
  isGbClaimRouteAllowedForAssetKind,
  type ReductionAssetKind,
} from "./asset-kind-gate";
export type { ReductionMetadata, CategoryUiSchema } from "./metadata";
export type {
  TransferReductionId,
  ReductionCategory,
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
  RENTAL_VACANCY_GRACE_MONTHS_97,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
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
  LTHD_SPECIAL_REDUCTION_IDS,
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
 * UI 항목별 활성 여부 일괄 조회. 펼침 패널 안의 24개 항목 disabled/enabled 결정.
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
