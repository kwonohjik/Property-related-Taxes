/**
 * 조특법 §71 영농자녀 농지 증여세 감면 — 재차증여 감면세액·감면농지가액 안분
 *
 * 법령 근거:
 *   §71①   — 자경농민등이 영농자녀등에게 증여하는 농지등 가액의 증여세 100% 감면
 *   §71②·§133② — 감면받을 + 증여일 전 5년간 기감면 증여세액 합계 1억원 한도, 초과분 미감면
 *   예규: 재재산-1454(2022.11.22) · 법규재산-2314(2023.9.21)
 *
 * 재차증여 계산 (정상 §47② 합산·§56 누진 파이프라인 내 산출세액 감면):
 *   ㉣ 농지분 산출세액 = 합산 산출세액 − 직전 회차 산출세액 (한도 미적용 — 안분 분모 전용)
 *   ㉤ 농지 감면세액   = min(㉣, 5년 한도 잔여)
 *   ㉮ 감면농지가액(감면범위) = 농지가액 × ㉤ / ㉣
 *   ㉯ 감면한도 초과분 농지가액 = 농지가액 − ㉮ (일반 증여재산과 합산과세)
 *
 * ㉣와 §58 기납부세액공제는 별개 — §58은 한도(min)를 적용한 결정세액 공제, ㉣는 full(한도없음) 안분 분모.
 * Phase 1 전제: 직전 회차 = prior 감면농지, §58 한도 비구속 (설계 R-3·R-9).
 *
 * Pure function — DB 호출 없음.
 */

import { subYears, isBefore, parseISO } from "date-fns";
import { GIFT } from "./legal-codes";
import { safeMultiplyThenDivide } from "./tax-utils";
import type { CalculationStep, EstateItem } from "./types/inheritance-gift.types";
import type { PriorGift } from "./types/inheritance-prior-gift.types";

/** §71② 5년 감면한도 1억원 */
export const FARMLAND_GIFT_REDUCTION_LIMIT_5YR = 100_000_000;

export interface FarmlandGiftReductionInput {
  /** 금번 감면농지 평가액 합계(원) = isFarmlandGiftReduction 자산 합 */
  farmlandValue: number;
  /** ㉡ 합산 산출세액 (gift-tax.ts computedTax) */
  aggregatedComputedTax: number;
  /** ㉠ 직전 회차 산출세액 = priorAggregation.totalComputedTax (full, 한도 없음) */
  priorComputedTax: number;
  /** 5년 내 기감면받은 증여세액 합계 (PriorGift 5년 필터 Σ farmlandReductionAmount) */
  priorReductionWithin5Years: number;
  /**
   * R-2: 금번 증여 총 평가액(농지+비농지). ㉣ 농지분 산출세액 안분 분모.
   * 단일 농지(=farmlandValue)면 ratio=1 → ㉣=full marginal (무회귀).
   */
  currentTotalGiftValue: number;
}

export interface FarmlandGiftReductionResult {
  /** 금번 감면농지 평가액 합계 */
  farmlandValue: number;
  /** ㉣ 농지분 산출세액 (≥0 가드) — 안분 분모 */
  farmlandComputedTax: number;
  /** 5년 감면한도 잔여 */
  reductionLimitRemaining: number;
  /** ㉤ 농지 감면세액 */
  reductionAmount: number;
  /** ㉮ 감면농지가액(감면범위) */
  reducedFarmlandValue: number;
  /** ㉯ 감면한도 초과분 농지가액 */
  excessFarmlandValue: number;
  /** 5년 누적 감면 (기감면 + ㉤) */
  cumulative5yrReduction: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

/**
 * 농지 감면세액 + 감면농지가액 안분 계산.
 *
 * @example FR-1 (재재산-1454):
 *   farmlandValue=813,066,000, aggregatedComputedTax=230,046,000,
 *   priorComputedTax=20,750,800, priorReductionWithin5Years=20,750,800
 *   → ㉣=209,295,200 / 잔여=79,249,200 / ㉤=79,249,200 / ㉮≈307,867천 / ㉯≈505,199천
 */
export function calcFarmlandGiftReduction(
  input: FarmlandGiftReductionInput,
): FarmlandGiftReductionResult {
  const {
    farmlandValue,
    aggregatedComputedTax,
    priorComputedTax,
    priorReductionWithin5Years,
    currentTotalGiftValue,
  } = input;

  const breakdown: CalculationStep[] = [];
  const warnings: string[] = [];

  // ㉣ 농지분 산출세액 = (합산 − 직전) × 농지가액/금번총가액 (한도 미적용, ≥0 가드)
  //   R-2: 농지+비농지 혼합 시 농지분으로 가액비례 안분 — §71 감면(㉤)이 비농지분 세액까지
  //   감면하지 않도록 제한. 단일 증여 내 혼합 직접 예규 부재 → 가액비례(법령 도출).
  //   단일 농지(농지=총가액)면 ratio=1 → full marginal (무회귀).
  const currentMarginalTax = Math.max(0, aggregatedComputedTax - priorComputedTax);
  const farmlandComputedTax =
    currentTotalGiftValue > 0
      ? safeMultiplyThenDivide(currentMarginalTax, farmlandValue, currentTotalGiftValue)
      : currentMarginalTax;
  const isMixed = farmlandValue < currentTotalGiftValue;
  breakdown.push({
    label: isMixed
      ? "농지분 산출세액 ㉣ ((합산 − 직전) × 농지가액/금번총가액 안분)"
      : "농지분 산출세액 ㉣ (합산 산출세액 − 직전 회차 산출세액)",
    amount: farmlandComputedTax,
    lawRef: GIFT.FARMLAND_REDUCTION,
    note: isMixed
      ? `(${aggregatedComputedTax.toLocaleString()} − ${priorComputedTax.toLocaleString()}) × ${farmlandValue.toLocaleString()}/${currentTotalGiftValue.toLocaleString()}`
      : `${aggregatedComputedTax.toLocaleString()} − ${priorComputedTax.toLocaleString()}`,
  });

  // 5년 감면한도 잔여
  const reductionLimitRemaining = Math.max(
    0,
    FARMLAND_GIFT_REDUCTION_LIMIT_5YR - Math.max(0, priorReductionWithin5Years),
  );
  if (reductionLimitRemaining === 0) {
    warnings.push(
      "조특법 §71② 5년 감면한도(1억원)가 기감면으로 소진 — 농지 감면세액 0, 농지가액 전부 일반 증여세 과세",
    );
  }

  // ㉤ 감면세액 = min(㉣, 잔여)
  const reductionAmount = Math.min(farmlandComputedTax, reductionLimitRemaining);
  breakdown.push({
    label: "농지 감면세액 ㉤ = min(㉣ 농지분 산출세액, 5년 한도 잔여)",
    amount: reductionAmount,
    lawRef: GIFT.FARMLAND_REDUCTION_LIMIT,
    note: `min(${farmlandComputedTax.toLocaleString()}, ${reductionLimitRemaining.toLocaleString()})`,
  });

  // ㉮ 감면농지가액(감면범위) = farmlandValue × ㉤ / ㉣ — BigInt 안전 안분
  const reducedFarmlandValue =
    farmlandComputedTax <= 0
      ? 0
      : safeMultiplyThenDivide(farmlandValue, reductionAmount, farmlandComputedTax);
  // ㉯ 초과분 = farmlandValue − ㉮
  const excessFarmlandValue = Math.max(0, farmlandValue - reducedFarmlandValue);

  if (farmlandComputedTax <= 0) {
    warnings.push(
      "농지분 산출세액(㉣)이 0 이하 — 감면농지가액 안분 불가(감면범위 0, 전부 과세부분)",
    );
  } else {
    breakdown.push(
      {
        label: "감면받은 농지가액(감면범위) ㉮ = 농지가액 × ㉤ / ㉣",
        amount: reducedFarmlandValue,
        lawRef: GIFT.FARMLAND_REDUCTION,
        note: `${farmlandValue.toLocaleString()} × ${reductionAmount.toLocaleString()} / ${farmlandComputedTax.toLocaleString()}`,
      },
      {
        label: "감면한도 초과분 농지가액 ㉯ (일반 증여재산과 합산과세)",
        amount: excessFarmlandValue,
        lawRef: GIFT.FARMLAND_REDUCTION_LIMIT,
      },
    );
  }

  const cumulative5yrReduction =
    Math.max(0, priorReductionWithin5Years) + reductionAmount;

  return {
    farmlandValue,
    farmlandComputedTax,
    reductionLimitRemaining,
    reductionAmount,
    reducedFarmlandValue,
    excessFarmlandValue,
    cumulative5yrReduction,
    breakdown,
    warnings,
  };
}

/**
 * gift-tax.ts STEP 7.5 orchestrator 헬퍼 — 감면농지 평가액 집계 + 5년 기감면 필터 + 감면 계산.
 *
 * - farmlandValue = Σ valuatedAmounts[idx] (giftItems[idx].isFarmlandGiftReduction)
 * - priorReductionWithin5Years = Σ farmlandReductionAmount (giftDate 전 5년 이내, §71② 수증자별 누계)
 * - 감면농지 없으면(farmlandValue=0) null 반환 → 기존 동작 불변.
 *
 * @param giftItems 금번 증여 자산
 * @param valuatedAmounts giftItems 인덱스 대응 평가액 (valuationResults[idx].valuatedAmount)
 * @param priorGifts 사전증여 전체
 * @param giftDate 금번 증여일 (5년 경계 기준)
 * @param aggregatedComputedTax ㉡ 합산 산출세액
 * @param priorComputedTax ㉠ 직전 회차 산출세액 (priorAggregation.totalComputedTax)
 */
export function deriveFarmlandReduction(
  giftItems: EstateItem[],
  valuatedAmounts: number[],
  priorGifts: PriorGift[],
  giftDate: string,
  aggregatedComputedTax: number,
  priorComputedTax: number,
): FarmlandGiftReductionResult | null {
  const farmlandValue = giftItems.reduce(
    (s, item, idx) =>
      item.isFarmlandGiftReduction ? s + (valuatedAmounts[idx] ?? 0) : s,
    0,
  );
  if (farmlandValue <= 0) return null; // 감면농지 미신청 — 기존 동작 불변

  // R-2: 금번 증여 총 평가액(농지+비농지) — ㉣ 안분 분모
  const currentTotalGiftValue = valuatedAmounts.reduce((s, v) => s + (v ?? 0), 0);

  // §71② 5년 기감면 누계 (수증자별, donor 무관). §47② 10년 합산과 별개 비대칭.
  // new Date(x) 직접호출 금지(CLAUDE.md) — parseISO 통일 (gift-prior-aggregation §47② 경계와 동일 패턴)
  const boundary5yr = subYears(parseISO(giftDate), 5);
  const priorReductionWithin5Years = priorGifts.reduce((s, p) => {
    if (!p.farmlandReductionApplied) return s;
    if (isBefore(parseISO(p.giftDate), boundary5yr)) return s; // 5년 초과 제외
    return s + (p.farmlandReductionAmount ?? 0);
  }, 0);

  return calcFarmlandGiftReduction({
    farmlandValue,
    aggregatedComputedTax,
    priorComputedTax,
    priorReductionWithin5Years,
    currentTotalGiftValue,
  });
}

/** GiftTaxResult.farmlandReductionDetail 매핑 — breakdown·warnings 제외 7필드 (orchestrator 1줄용) */
export function toFarmlandReductionDetail(
  r: FarmlandGiftReductionResult,
): Omit<FarmlandGiftReductionResult, "breakdown" | "warnings"> {
  return {
    farmlandValue: r.farmlandValue,
    farmlandComputedTax: r.farmlandComputedTax,
    reductionLimitRemaining: r.reductionLimitRemaining,
    reductionAmount: r.reductionAmount,
    reducedFarmlandValue: r.reducedFarmlandValue,
    excessFarmlandValue: r.excessFarmlandValue,
    cumulative5yrReduction: r.cumulative5yrReduction,
  };
}
