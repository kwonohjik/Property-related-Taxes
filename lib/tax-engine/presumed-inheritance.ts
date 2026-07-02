/**
 * 추정상속재산 §15 (상증법 제15조·시행령 §11, 집행기준 15-11-6)
 *
 * 상속개시일 전 일정 기간 내 처분·인출·차입한 재산 중 사용처가 객관적으로 확인되지 않는
 * 금액을 상속재산에 가산하는 규정.
 *
 * 임계 자동 판정:
 *   - 1년 이내 처분·인출·차입 합계가 ≥ 2억원, 또는
 *   - 2년 이내 처분·인출·차입 합계가 ≥ 5억원
 *   임계 미달 시 해당 카테고리는 소명대상 아님 (addedAmount=0).
 *
 * 추정상속재산 가산액 산식:
 *   소명대상     = 1Y + 2Y (임계 발동 시)
 *   미소명      = 소명대상 - verifiedUseAmount
 *   기준차감액   = Min(소명대상 × 20%, 2억)
 *   추정상속재산 = max(0, 미소명 - 기준차감액)
 *
 * 적용 카테고리 (4종):
 *   1. real_estate    — 부동산·부동산권리
 *   2. deposit        — 예금 인출
 *   3. other_asset    — 기타재산 (영업권·유가증권 등)
 *   4. financial_debt — 금융기관 채무 부담
 *
 * Pure Engine — DB 호출 없음, 순수 함수.
 */

import { INH } from "./legal-codes";
import type {
  PresumedInheritanceItem,
  PresumedInheritanceItemResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// 임계 상수 (§15 ①·시행령 §11)
// ────────────────────────────────────────────────────

/** 1년 이내 임계: 2억원 */
const THRESHOLD_1Y = 200_000_000;
/** 2년 이내 임계: 5억원 */
const THRESHOLD_2Y = 500_000_000;
/** 기준차감액 — 처분금액의 20% */
const BASE_DEDUCTION_RATE = 0.20;
/** 기준차감액 최댓값: 2억원 */
const BASE_DEDUCTION_MAX = 200_000_000;

// ────────────────────────────────────────────────────
// 카테고리 라벨 (breakdown 표시용)
// ────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  real_estate: "부동산 및 부동산 권리 처분",
  deposit: "예금 인출",
  other_asset: "기타재산 처분",
  financial_debt: "금융기관 채무",
};

// ────────────────────────────────────────────────────
// 단일 항목 평가
// ────────────────────────────────────────────────────

/**
 * 추정상속재산 단일 항목 평가.
 *
 * @param item PresumedInheritanceItem (category, amountWithin1Y, amountWithin2Y, verifiedUseAmount)
 * @returns PresumedInheritanceItemResult — 임계 발동 여부·미소명·기준차감·가산액
 */
export function evaluatePresumedItem(
  item: PresumedInheritanceItem,
): PresumedInheritanceItemResult {
  const label = CATEGORY_LABEL[item.category] ?? item.category;
  const total = item.amountWithin1Y + item.amountWithin2Y;

  // 임계 판정
  const triggered1Y = item.amountWithin1Y >= THRESHOLD_1Y;
  const triggered2Y = total >= THRESHOLD_2Y;
  const thresholdTriggered = triggered1Y || triggered2Y;

  if (!thresholdTriggered) {
    return {
      id: item.id,
      category: item.category,
      thresholdTriggered: false,
      scrutinyAmount: 0,
      unverifiedAmount: 0,
      baseDeduction: 0,
      addedAmount: 0,
      breakdown: [
        {
          label: `${label} — 소명대상 미발동 (1년 ${item.amountWithin1Y.toLocaleString()} < 2억, 2년 합 ${total.toLocaleString()} < 5억)`,
          amount: 0,
          lawRef: INH.PRESUMPTION,
        },
      ],
    };
  }

  // §15①1호·시행령 §11①1호: 소명대상은 발동한 기간에 따라 결정된다.
  // 2년 5억 임계 발동 시 2년 전액(1년+1~2년증분), 1년 2억 임계만 발동 시 1년 처분액만.
  const scrutinyAmount = triggered2Y ? total : item.amountWithin1Y;
  const unverifiedAmount = Math.max(0, scrutinyAmount - item.verifiedUseAmount);
  const baseDeduction = Math.min(
    Math.floor(scrutinyAmount * BASE_DEDUCTION_RATE),
    BASE_DEDUCTION_MAX,
  );
  const addedAmount = Math.max(0, unverifiedAmount - baseDeduction);

  const breakdown: CalculationStep[] = [
    {
      label: `${label} — 소명대상 합계`,
      amount: scrutinyAmount,
      lawRef: INH.PRESUMPTION,
      note: triggered2Y
        ? `1년 ${item.amountWithin1Y.toLocaleString()} + 2년 ${item.amountWithin2Y.toLocaleString()}`
        : `1년 처분액 ${item.amountWithin1Y.toLocaleString()} (2년 합 5억 미달 → 1~2년분 ${item.amountWithin2Y.toLocaleString()} 제외)`,
    },
    {
      label: "사용처 확인 금액",
      amount: -item.verifiedUseAmount,
    },
    {
      label: "미소명 금액",
      amount: unverifiedAmount,
    },
    {
      label: "기준차감액 (Min(처분금액 × 20%, 2억))",
      amount: -baseDeduction,
      note: `${scrutinyAmount.toLocaleString()} × 20% = ${Math.floor(scrutinyAmount * BASE_DEDUCTION_RATE).toLocaleString()}, 한도 2억`,
    },
    {
      label: `${label} — 추정상속재산 가산액`,
      amount: addedAmount,
      lawRef: INH.PRESUMPTION,
    },
  ];

  return {
    id: item.id,
    category: item.category,
    thresholdTriggered: true,
    scrutinyAmount,
    unverifiedAmount,
    baseDeduction,
    addedAmount,
    breakdown,
  };
}

// ────────────────────────────────────────────────────
// 다항목 통합 평가
// ────────────────────────────────────────────────────

/**
 * 추정상속재산 §15 — 4종 카테고리 통합 평가.
 *
 * @param items PresumedInheritanceItem 배열
 * @returns { items: 항목별 결과, total: 가산액 합계 }
 *
 * @example PDF 종합사례 (책 1857)
 *   부동산: 108M  + 예금: 100M + 기타재산: 0 + 채무: 142M = 350M
 */
export function evaluatePresumedInheritance(
  items: PresumedInheritanceItem[],
): { items: PresumedInheritanceItemResult[]; total: number } {
  const itemResults = items.map(evaluatePresumedItem);
  const total = itemResults.reduce((sum, r) => sum + r.addedAmount, 0);

  return { items: itemResults, total };
}
