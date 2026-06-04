/**
 * 증여세 사전증여 합산 헬퍼 (상증법 §47 ② 동일인 그룹화)
 *
 * Phase A — donor 식별자 도입 + §58 안분 한도 + §57 한도 산식 분자 산정.
 *
 * 그룹 매핑:
 *   A: father, mother           — 부모 (§47 ② 동일인)
 *   B: grandparent              — 조부모 (§47 ② 동일인, §57 세대생략 대상)
 *   C: spouse
 *   D: lineal_descendant
 *   E: sibling
 *   F: other_relative
 *   G: other
 *
 * Pure function. DB 호출 없음. UI display 책임 없음.
 */

import { isBefore, subYears } from "date-fns";
import { GIFT } from "./legal-codes";
import type {
  GiftDonorRelation,
  DonorGroup,
  PriorGift,
  CalculationStep,
} from "./types/inheritance-gift.types";

// ============================================================
// 그룹 매핑
// ============================================================

export function getDonorGroup(donor: GiftDonorRelation): DonorGroup {
  switch (donor) {
    case "father":
    case "mother":
      return "A";
    case "grandparent":
      return "B";
    case "spouse":
      return "C";
    case "lineal_descendant":
      return "D";
    case "sibling":
      return "E";
    case "other_relative":
      return "F";
    case "other":
      return "G";
  }
}

export function isSameDonorGroup(
  a: GiftDonorRelation,
  b: GiftDonorRelation,
): boolean {
  return getDonorGroup(a) === getDonorGroup(b);
}

// ============================================================
// 합산 결과 타입
// ============================================================

export interface PriorAggregationResult {
  /** 그룹 일치 + 10년 이내 사전증여 (giftDate 내림차순) */
  matchedPriorGifts: PriorGift[];
  /** §47 합산 ① 누계 (= 신고서 ③) */
  totalAmount: number;
  /** 합산 회차들의 giftTaxPaid 합 (정보용) */
  totalTaxPaid: number;
  /**
   * 가장 최근 합산 회차의 ⑦ (§58 ⑭/⑧ 분자용).
   * 합산 대상 없으면 0.
   */
  totalComputedTax: number;
  /**
   * 가장 최근 합산 회차의 ⑤ = giftTaxBase (§58·§57 한도 산식 분자).
   * 합산 대상 없으면 0.
   */
  priorAddedTaxBase: number;
  /** 사전증여 회차들의 ⑫ 누계 = Σ⑫_prior (§57 ⑨용) */
  totalAdditionalSurcharge: number;
  /**
   * 부모 제외 직계존속 ① 누계.
   * 그룹 B (조부모) 합산 시 totalAmount와 동일, 그 외 0.
   */
  nonParentLinealAmount: number;
  breakdown: CalculationStep[];
  /** 다른 그룹 priorGifts 무시 안내 등 */
  warnings: string[];
}

// ============================================================
// 합산 함수
// ============================================================

/**
 * 동일인 §47 ② 합산 + §58·§57 한도 산식용 데이터 추출.
 *
 * @param priorGifts 사용자가 입력한 사전증여 전체
 * @param giftDate 금번 증여일 (10년 경과 필터링 기준)
 * @param currentDonor 금번 증여자 (그룹 일치 필터링 기준)
 */
export function aggregatePriorGiftsForGift(
  priorGifts: PriorGift[],
  giftDate: string,
  currentDonor: GiftDonorRelation,
): PriorAggregationResult {
  const current = new Date(giftDate);
  // §47②: "해당 증여일 전 10년 이내에 동일인으로부터 받은 증여재산가액"
  // boundary = subYears(증여일, 10). 경계일 당일 포함, 전일 제외 (민법 §160②).
  // 수정: differenceInYears(만 연수 절사 버그) → isBefore(일 단위, 경계일 전일 제외).
  const boundary47 = subYears(current, 10);
  const matched: PriorGift[] = [];
  const warnings: string[] = [];

  for (const gift of priorGifts) {
    // 사전증여일이 boundary보다 이전이면 도과(10년 초과) → 제외
    if (isBefore(new Date(gift.giftDate), boundary47)) continue;

    if (!gift.donor) {
      warnings.push(
        `사전증여 ${gift.giftDate} — donor 미입력으로 §47 합산 제외`,
      );
      continue;
    }

    if (!isSameDonorGroup(gift.donor, currentDonor)) {
      warnings.push(
        `사전증여 ${gift.giftDate} (증여자=${gift.donor})는 현 증여자(${currentDonor})와 다른 동일인 그룹 — §47 합산 제외, 별개 신고 대상`,
      );
      continue;
    }

    matched.push(gift);
  }

  // giftDate 내림차순: 첫 번째가 가장 최근
  matched.sort((a, b) => b.giftDate.localeCompare(a.giftDate));

  const totalAmount = matched.reduce((s, p) => s + p.giftAmount, 0);
  const totalTaxPaid = matched.reduce((s, p) => s + p.giftTaxPaid, 0);
  const totalComputedTax = matched[0]?.computedTax ?? 0;
  const priorAddedTaxBase = matched[0]?.giftTaxBase ?? 0;
  const totalAdditionalSurcharge = matched.reduce(
    (s, p) => s + (p.additionalGenerationSkipSurcharge ?? 0),
    0,
  );
  const nonParentLinealAmount =
    getDonorGroup(currentDonor) === "B" ? totalAmount : 0;

  const breakdown: CalculationStep[] = matched.map((p) => ({
    label: `§47 합산 (${p.giftDate}, 증여자=${p.donor})`,
    amount: p.giftAmount,
    lawRef: GIFT.AGGREGATION_SAME_PERSON,
  }));

  return {
    matchedPriorGifts: matched,
    totalAmount,
    totalTaxPaid,
    totalComputedTax,
    priorAddedTaxBase,
    totalAdditionalSurcharge,
    nonParentLinealAmount,
    breakdown,
    warnings,
  };
}

// ============================================================
// 도출 헬퍼 — wasGenerationSkip 자동 도출 (PriorGift.wasGenerationSkip 미입력 시)
// ============================================================

export function resolveWasGenerationSkip(
  donor: GiftDonorRelation | undefined,
  explicit: boolean | undefined,
): boolean {
  if (explicit !== undefined) return explicit;
  return donor === "grandparent";
}
