/**
 * 증여세 재차증여 합산 — 사례 3·4 (교재 PDF 이미지 32~35) Pre-Do anchor
 *
 * 사례4: 동일인(부·모 그룹A) 3차 증여 중 1차분 10년 경과 합산제외 (cutoff 뺄셈 marginal).
 *   → 기존 R-6 drop-out 메커니즘으로 재현되어야 함 (신규코드 0, 즉시 GREEN).
 *   부(1차)·모(2차/3차) 혼합 그룹 A 합산 경로 + finalTax 원 단위 정합(92,264 vs A주장 92,265 판정).
 *
 * 사례3: 부 사망 후 모 재차증여 (사망 합산제외 + 곱셈 안분 marginal) — 신규 기능.
 *   현행 코드는 donorDeceasedDate 미감지 → 1차도 합산(RED). 타입 추가는 Do 1단계.
 *   ⑧=90,588천원(서일46014-11750 분모 gross 1,020,000), ⑩=78,620·⑫=34,319(PDF 일치).
 *
 * 단위: 천원(PDF) → 원(엔진) ×1,000. PDF round 1천원 tolerance.
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function parentGift(
  date: string,
  donor: "father" | "mother",
  value: number,
  priors: PriorGift[],
  priorUsedDeduction?: number, // §53 10년 내 기사용 증여공제 (사례3 3차=5천만 소진)
): GiftTaxInput {
  return {
    giftDate: date,
    donorRelation: "lineal_ascendant_adult",
    donor,
    giftItems: [{ id: "g", category: "cash", name: "현금", marketValue: value }],
    priorGiftsWithin10Years: priors,
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction },
    creditInput: { isFiledOnTime: true }, // 신고세액공제 3% (PDF ⑪)
  };
}

// ════════════════════════════════════════════════════════
// 사례4 — 1차 10년 경과 cutoff (기존 R-6, 즉시 GREEN 기대)
// ════════════════════════════════════════════════════════
describe("사례4 — 동일인 3차증여 1차분 cutoff (R-6 뺄셈 marginal, 무회귀)", () => {
  const prior1: PriorGift = {
    giftDate: "2012-05-02",
    donor: "father",
    isHeir: false,
    giftAmount: 820_000_000,
    giftTaxPaid: 0,
    computedTax: 171_000_000, // 1차 단독 ⑦ (770M×30%−60M)
    giftTaxBase: 770_000_000, // 1차 ⑤
  };
  const prior2: PriorGift = {
    giftDate: "2021-05-02",
    donor: "mother",
    isHeir: false,
    giftAmount: 600_000_000,
    giftTaxPaid: 0,
    computedTax: 388_000_000, // 2차 ⑦ (1·2차 합산 1,370M×40%−160M)
    giftTaxBase: 1_370_000_000, // 2차 ⑤ (1·2차 합산과표)
  };

  const r3 = calcGiftTax(parentGift("2023-05-02", "mother", 420_000_000, [prior1, prior2]));

  it("[probe] taxBase·computedTax 출력", () => {
    // 3차 합산과표 970M = (420M+600M)−50M 증여공제
    expect(r3.taxBase).toBe(970_000_000);
    expect(r3.computedTax).toBe(231_000_000); // 970M×30%−60M
  });

  it("§58 ⑧ 가산재산 산출세액 = 직전(2차)⑦ − 1차⑦ = 388M − 171M = 217M (marginal)", () => {
    expect(r3.priorGiftCreditDetail?.priorComputedTax).toBe(217_000_000);
  });

  it("§58 ⑤_prior 가산재산 과표 = 970M × 600M/1,020M = 570,588,235 (안분)", () => {
    expect(r3.priorGiftCreditDetail?.priorAddedTaxBase).toBe(570_588_235);
  });

  it("§58 ⑨ 한도 = 231M × 570,588,235/970M = 135,882,352 / ⑩ = min(⑧,⑨)", () => {
    expect(r3.priorGiftCreditDetail?.creditLimit).toBe(135_882_352);
    expect(r3.priorGiftCreditDetail?.priorPaidCredit).toBe(135_882_352);
  });

  it("⑫ 결정세액(원 단위 정합) — PDF 92,264천원, A주장 92,265는 천원절사 오차", () => {
    // 231,000,000 − 135,882,352 − floor(95,117,648×0.03=2,853,529) = 92,264,119
    expect(r3.finalTax).toBe(92_264_119);
  });

  it("[가드] 사망 분기 미발동 — deceasedExclusion 없음(R-6 경로 유지)", () => {
    expect(r3.priorGiftCreditDetail?.deceasedExclusion).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════
// 사례3 — 부 사망 후 모 재차증여 (사망 합산제외 + 곱셈 안분, 신규)
// ════════════════════════════════════════════════════════
describe("사례3 — 부 사망 후 모 재차증여 (사망 합산제외 + 곱셈 안분)", () => {
  const prior1: PriorGift = {
    giftDate: "2018-05-02",
    donor: "father",
    isHeir: false,
    giftAmount: 620_000_000,
    giftTaxPaid: 0,
    computedTax: 111_000_000, // 1차 단독 ⑦ (570M×30%−60M)
    giftTaxBase: 570_000_000,
    donorDeceasedDate: "2022-05-02", // 부친 사망 → 3차(2023) 합산 제외
  };
  const prior2: PriorGift = {
    giftDate: "2020-05-02",
    donor: "mother",
    isHeir: false,
    giftAmount: 400_000_000,
    giftTaxPaid: 0,
    computedTax: 231_000_000, // 2차 ⑦ (1·2차 합산 970M×30%−60M)
    giftTaxBase: 970_000_000, // 2차 ⑤ (1·2차 합산과표)
  };

  // 3차 증여공제 0 (PDF) — 직전 10년 내 동일인 §53 공제 5천만 소진 → priorUsedDeduction
  const r3 = calcGiftTax(
    parentGift("2023-05-02", "mother", 180_000_000, [prior1, prior2], 50_000_000),
  );

  it("③ 합산 = 400M (1차 부친 620M 사망제외) — deceasedExclusion + 분자/분모 echo", () => {
    expect(r3.priorGiftCreditDetail?.deceasedExclusion).toBe(true);
    expect(r3.priorGiftCreditDetail?.deceasedMarginalNumerator).toBe(400_000_000);
    expect(r3.priorGiftCreditDetail?.deceasedMarginalDenominator).toBe(1_020_000_000);
  });

  it("taxBase·computedTax — 3차 합산과표 580M(공제 0)·산출세액 114M (PDF ⑤⑦)", () => {
    expect(r3.taxBase).toBe(580_000_000);
    expect(r3.computedTax).toBe(114_000_000);
  });

  it("⑧ 가산재산 산출세액 = 231M × 400M/1,020M = 90,588,235 (서일46014-11750 곱셈 안분)", () => {
    expect(r3.priorGiftCreditDetail?.priorComputedTax).toBe(90_588_235);
  });

  it("⑤_prior 가산재산 과표 = 580M × 400M/580M = 400M (과표 안분, 증여공제 0이라 가액=과표)", () => {
    expect(r3.priorGiftCreditDetail?.priorAddedTaxBase).toBe(400_000_000);
  });

  it("⑨ 한도 = 114M × 400M/580M = 78,620,689 / ⑩ = min(⑧,⑨) = 78,620,689 (PDF 78,620)", () => {
    expect(r3.priorGiftCreditDetail?.creditLimit).toBe(78_620_689);
    expect(r3.priorGiftCreditDetail?.priorPaidCredit).toBe(78_620_689);
  });

  it("⑫ 결정세액 = 114M − 78,620,689 − floor(35,379,311×3%) = 34,317,932 (PDF 34,319천원, 1천원 tolerance)", () => {
    expect(r3.finalTax).toBe(34_317_932);
  });
});
