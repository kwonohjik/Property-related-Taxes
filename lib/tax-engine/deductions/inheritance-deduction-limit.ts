/**
 * §24 공제 적용의 한도 (상증법 §24)
 *
 * inheritance-deductions.ts 에서 800줄 정책에 따라 분리 (2026-06-07, §23 재해손실공제 통합 시).
 * applyDeductionLimit / SECTION24_GIFT_DEDUCTION_THRESHOLD / computePriorGiftDeductionForLimit 를
 * inheritance-deductions.ts 가 re-export 하므로 기존 import 사이트는 무변경.
 *
 * §24 본문(KoreanLaw mst 276123): "제18조, 제18조의2, 제18조의3, 제19조부터 제23조까지 및
 *   제23조의2에 따라 공제할 금액은 상속세 과세가액에서 다음 각 호의 가액을 뺀 금액을 한도로 한다."
 *   3호: 사전증여 가산가액(§53·§53의2·§54 공제액 차감 후). 단서: 과세가액 5억 초과 시에만 적용.
 */

import type { DonorRelation, PriorGift } from "../types/inheritance-gift.types";
import type { DeductionLimitCeilingDetail } from "../types/inheritance-deduction-detail.types";
import { calcRelationDeduction } from "./gift-deductions";
import { isWithin13Cutoff } from "../inheritance-gift-common";

/**
 * §24 종합한도 계산 (Phase D — PDF 책 1864 표 산식)
 *
 * 한도 = 상속세 과세가액
 *      − 상속인 외 자에게 유증한 금액
 *      − [모든 사전증여 가산가액 (영리법인·legatee 포함) − (증여재산공제 + 신고기한내 재해손실공제)]
 *
 * legacy 호출 (priorGiftToHeirTotal만 제공): 분자 = taxableEstateValue − priorGiftToHeirTotal
 *
 * E4: ceilingDetail: DeductionLimitCeilingDetail 반환 추가.
 *
 * @param rawTotalDeduction 공제 합계 (한도 적용 전)
 * @param taxableEstateValue 상속세 과세가액
 * @param priorGiftToHeirTotal 상속인 사전증여 가산가액 (legacy fallback용)
 * @param params Phase D 보정 입력 — totalPriorGiftAmount(모든 수증자) + priorGiftDeductionTotal + legateeAmountNonHeir + disasterLossDeduction
 */
export function applyDeductionLimit(
  rawTotalDeduction: number,
  taxableEstateValue: number,
  priorGiftToHeirTotal: number,
  params?: {
    totalPriorGiftAmount?: number;
    priorGiftDeductionTotal?: number;
    legateeAmountNonHeir?: number;
    disasterLossDeduction?: number;
  },
): {
  limitedDeduction: number;
  ceiling: number;
  wasCapped: boolean;
  ceilingDetail: DeductionLimitCeilingDetail;
} {
  let ceiling: number;
  let legateeNonHeir: number;
  let totalGift: number;
  let giftDeductions: number;
  let netPriorGiftDeducted: number;

  if (params && params.totalPriorGiftAmount !== undefined) {
    // Phase D 정확 산식
    totalGift = params.totalPriorGiftAmount;
    giftDeductions =
      (params.priorGiftDeductionTotal ?? 0) +
      (params.disasterLossDeduction ?? 0);
    legateeNonHeir = params.legateeAmountNonHeir ?? 0;
    // §24 단서: 제3호(사전증여 가산가액)는 상속세 과세가액 5억원 초과 시에만 차감.
    // (1·2호 유증·포기는 단서 무관 — 항상 차감.)
    netPriorGiftDeducted =
      taxableEstateValue > SECTION24_GIFT_DEDUCTION_THRESHOLD
        ? Math.max(0, totalGift - giftDeductions)
        : 0;
    ceiling = Math.max(0, taxableEstateValue - legateeNonHeir - netPriorGiftDeducted);
  } else {
    // legacy fallback
    totalGift = priorGiftToHeirTotal;
    giftDeductions = 0;
    legateeNonHeir = 0;
    netPriorGiftDeducted = priorGiftToHeirTotal;
    ceiling = Math.max(0, taxableEstateValue - priorGiftToHeirTotal);
  }

  const limitedDeduction = Math.min(rawTotalDeduction, ceiling);
  const wasCapped = rawTotalDeduction > ceiling;

  const ceilingDetail: DeductionLimitCeilingDetail = {
    taxableEstateValue,
    legateeAmountNonHeir: legateeNonHeir,
    heirWaiverAmount: 0, // §24 ②호 미구현 — 항상 0
    totalPriorGiftAmount: totalGift,
    priorGiftDeductionTotal: params?.priorGiftDeductionTotal ?? 0,
    disasterLossDeduction: params?.disasterLossDeduction ?? 0,
    netPriorGiftDeducted,
    ceiling,
    rawTotalDeduction,
    wasCapped,
    limitedDeduction,
  };

  return { limitedDeduction, ceiling, wasCapped, ceilingDetail };
}

// ============================================================
// §24 사전증여 증여재산공제 자동 도출 (§24 3호 — §53·§53의2·§54 공제 차감)
// ============================================================

/** §24 단서 — 제3호(사전증여 가산가액)는 상속세 과세가액이 이 금액을 초과할 때만 차감 (KoreanLaw mst 276123). */
export const SECTION24_GIFT_DEDUCTION_THRESHOLD = 500_000_000;

/**
 * §24 3호: 상속세 과세가액에서 차감할 「가산 증여재산가액 − 증여재산공제(§53·§53의2·§54)」 중
 * **증여재산공제 합계**를 사전증여 내역에서 자동 도출한다.
 *
 * 배우자 법정상속분 분자(inheritance-tax.ts:263~)와 동일한 건별 우선순위:
 *   1. giftTaxBase 명시 → max(0, giftAmount − giftTaxBase)  (그 증여의 실제 공제 실액)
 *   2. giftTaxBase 없고 doneeRelation 있음 → 관계별 그룹 합산 후 calcRelationDeduction (§53 관계한도 1회)
 *   3. 둘 다 없음 → 0 (보수적 — 화면에 안 보이는 미입력 건의 과대공제 차단)
 *
 * §13 cutoff(상속인 10년·비상속인 5년) 통과 건만 — totalPriorGiftAmount(가산가액)와 동일 모집단.
 * 영리법인 사전증여는 통상 giftTaxBase=giftAmount → 공제 0 (정합).
 *
 * 수동 입력(deductionInput.priorGiftDeductionTotal)이 명시되면 호출측에서 그 값을 우선(override).
 *
 * @param preGifts 사전증여 내역
 * @param deathDate 상속개시일 (§13 cutoff 판정)
 */
export function computePriorGiftDeductionForLimit(
  preGifts: PriorGift[] | undefined,
  deathDate: string,
): number {
  if (!preGifts || preGifts.length === 0) return 0;

  let explicitTotal = 0; // giftTaxBase 명시 건의 공제 합
  const relationSums = new Map<DonorRelation, number>(); // 관계별 gross 합 (giftTaxBase 미명시 건)

  for (const g of preGifts) {
    if (!isWithin13Cutoff(g, deathDate)) continue;
    if (g.giftTaxBase !== undefined) {
      explicitTotal += Math.max(0, g.giftAmount - g.giftTaxBase);
    } else if (g.doneeRelation) {
      relationSums.set(
        g.doneeRelation,
        (relationSums.get(g.doneeRelation) ?? 0) + g.giftAmount,
      );
      // §53의2 (직계존속 혼인·출산) — branch 2(giftTaxBase 미설정)에서만 가산.
      // branch 1(giftTaxBase 명시)은 과세표준에 이미 반영 → 무시(이중차감 금지).
      // per-gift 1억 캡: §53의2③ 수증자별 통합한도 방어 (정상 입력 시 실액 ≤ 1억).
      if (g.marriageBirthDeduction && g.marriageBirthDeduction > 0) {
        explicitTotal += Math.min(g.marriageBirthDeduction, 100_000_000);
      }
    }
    // 둘 다 미입력 → 공제 0 (보수적)
  }

  let groupedTotal = 0;
  for (const [rel, sum] of relationSums.entries()) {
    groupedTotal += calcRelationDeduction(
      { donorRelation: rel, priorUsedDeduction: 0 },
      sum,
    ).relationDeduction;
  }

  return explicitTotal + groupedTotal;
}
