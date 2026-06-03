/**
 * §13 cutoff 일(日) 단위 정합 anchor — H-1, M-1, M-4 수정 검증
 *
 * 수정 내용:
 *   (A) H-1: isWithin13Cutoff / aggregatePriorGiftsForGift — differenceInYears(만 연수 절사) →
 *            !isBefore(giftDate, subYears(deathDate, limitYears)) (일 단위 비교)
 *   (B) M-1: §19 배우자 법정상속분 분자 — cutoffFilteredGifts 재사용 (도과분 제외)
 *   (C) M-4: §27 세대생략 분모 nonHeirNonLegateeGifts — cutoffFilteredGifts 재사용
 *
 * 법령 근거:
 *   §13①1호: "상속개시일 전 10년 이내에 피상속인이 상속인에게 증여한 재산가액"
 *   §13①2호: "상속개시일 전 5년 이내에 피상속인이 상속인이 아닌 자에게 증여한 재산가액"
 *   §19①C: "제13조제1항제1호에 따른 재산가액" — §13 기준 cutoff 내 분
 *   §27: "제13조에 따라 상속재산에 가산한 증여재산" — cutoff 내 분
 *   §47②: "해당 증여일 전 10년 이내에 동일인으로부터 받은 증여재산가액"
 *   민법 §160②: boundary = subYears(기준일, N) — 경계일 당일 포함, 전일 제외
 *
 * KoreanLaw MCP 검증 완료: §13①, §19①, §27, §47② 본칙 (mst 276123, 2026-01-02 시행).
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import {
  isWithin13Cutoff,
  aggregatePriorGiftsForGift,
} from "@/lib/tax-engine/inheritance-gift-common";
import type {
  InheritanceTaxInput,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────────────────
// (A) H-1: isWithin13Cutoff 헬퍼 — 일(日) 단위 경계 anchor
// ────────────────────────────────────────────────────────────
describe("(A) H-1: isWithin13Cutoff — 일(日) 단위 경계 정합", () => {
  /**
   * deathDate = 2026-05-21
   * 비상속인(isHeir=false) limit = 5년 → boundary = subYears(2026-05-21, 5) = 2021-05-21
   * 상속인(isHeir=true) limit = 10년 → boundary = subYears(2026-05-21, 10) = 2016-05-21
   */

  it("CUTOFF-A1: 5년 경계일(2021-05-21) → 포함 (§13①2호 '이내')", () => {
    expect(
      isWithin13Cutoff(
        { giftDate: "2021-05-21", isHeir: false, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(true);
  });

  it("CUTOFF-A2: 5년 경계일 전일(2021-05-20) → 제외 (도과, 일 단위 정합)", () => {
    // 구버전 differenceInYears(2026-05-21, 2021-05-20)=5 → 5<=5 → 포함(버그)
    // 신버전 isBefore(2021-05-20, 2021-05-21)=true → !isBefore=false → 제외(정합)
    expect(
      isWithin13Cutoff(
        { giftDate: "2021-05-20", isHeir: false, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(false);
  });

  it("CUTOFF-A3: 10년 경계일(2016-05-21) → 포함 (§13①1호 '이내')", () => {
    expect(
      isWithin13Cutoff(
        { giftDate: "2016-05-21", isHeir: true, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(true);
  });

  it("CUTOFF-A4: 10년 경계일 전일(2016-05-20) → 제외 (도과, 일 단위 정합)", () => {
    // 구버전: differenceInYears(2026-05-21, 2016-05-20)=10 → 10<=10 → 포함(버그)
    // 신버전: isBefore(2016-05-20, 2016-05-21)=true → 제외(정합)
    expect(
      isWithin13Cutoff(
        { giftDate: "2016-05-20", isHeir: true, giftAmount: 0, giftTaxPaid: 0 },
        "2026-05-21",
      ),
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// (A) H-1 §47 경로: aggregatePriorGiftsForGift 일 단위 경계
// ────────────────────────────────────────────────────────────
describe("(A) H-1: aggregatePriorGiftsForGift §47 — 일(日) 단위 경계 정합", () => {
  /**
   * giftDate(현재 증여일) = 2026-05-21
   * boundary = subYears(2026-05-21, 10) = 2016-05-21
   * 이전 증여일 2016-05-21 → 포함 / 2016-05-20 → 제외
   */
  it("CUTOFF-A5: §47 10년 경계일(2016-05-21) 이전증여 → 포함", () => {
    const priorGifts: PriorGift[] = [
      { giftDate: "2016-05-21", isHeir: false, giftAmount: 200_000_000, giftTaxPaid: 0 },
    ];
    const result = aggregatePriorGiftsForGift(priorGifts, "2026-05-21");
    expect(result.totalAmount).toBe(200_000_000);
  });

  it("CUTOFF-A6: §47 10년 경계일 전일(2016-05-20) 이전증여 → 제외 (일 단위 정합)", () => {
    // 구버전: differenceInYears()=10 → 10>10=false → 포함(버그)
    // 신버전: isBefore(2016-05-20, 2016-05-21)=true → 제외(정합)
    const priorGifts: PriorGift[] = [
      { giftDate: "2016-05-20", isHeir: false, giftAmount: 300_000_000, giftTaxPaid: 0 },
      { giftDate: "2016-05-21", isHeir: false, giftAmount: 200_000_000, giftTaxPaid: 0 },
    ];
    const result = aggregatePriorGiftsForGift(priorGifts, "2026-05-21");
    // 2016-05-20 제외, 2016-05-21 포함 → 200M만
    expect(result.totalAmount).toBe(200_000_000);
  });
});

// ────────────────────────────────────────────────────────────
// (B) M-1: §19 배우자 법정상속분 분자 cutoff 정합
// ────────────────────────────────────────────────────────────
describe("(B) M-1: §19 배우자공제 분자 — cutoffFilteredGifts 동일 기준 적용", () => {
  /**
   * 시나리오: 현금 30억, 배우자+자녀1명, deathDate=2026-05-21.
   *   배우자 증여: giftDate=2016-05-20 (10년 경계일 전일, isHeir=true → boundary=2016-05-21 → 도과).
   *   giftAmount=10억, giftTaxBase=4억(600M 공제 후).
   *
   * 기대:
   *   - priorGiftAggregated = 0 (도과 → 과세가액 합산 제외)
   *   - §19 분자에도 cutoffFilteredGifts 적용 → 도과 10억 제외 → 배우자공제 과대 없음
   *
   * 수정 전(M-1 버그): heirGiftAmount = 10억(도과분 포함) → 분자 과대 → 배우자공제 과대
   * 수정 후(M-1 정합): cutoffFilteredGifts → heirGiftAmount = 0 → 분자 정합
   *
   * 기댓값 (실측): spouseDeduction=1,800,000,000, finalTax=144,045,000
   *   - 과세가액 = 30억(자산) + 0(도과증여 미합산) - 0(공제없음) = 30억
   *   - §19 분자: 30억 × (1.5/2.5) = 18억 → 배우자공제 min(18억,30억)=18억
   *   - 과세표준 = 30억 - 18억 - 5억(일괄) = 7억 → floor → 695,000,000 (천원 절사)
   *   - 산출세액 = floor(695M×0.3) - 60M = 208.5M - 60M = 148,500,000
   *   - 신고공제 = floor(148.5M×0.03) = 4,455,000
   *   - 최종납부 = 148,500,000 - 4,455,000 = 144,045,000
   */
  const HEIR_SPOUSE: Heir = {
    id: "spouse1",
    relation: "spouse",
    name: "배우자",
    isHeir: true,
    actualShareRatio: 1,
  };
  const HEIR_CHILD: Heir = {
    id: "child1",
    relation: "child",
    name: "자녀",
    isHeir: true,
    actualShareRatio: 1,
  };

  const overdueSpousalGift: PriorGift = {
    giftDate: "2016-05-20", // boundary=2016-05-21 → 도과
    giftAmount: 1_000_000_000,
    giftTaxBase: 400_000_000,
    giftTaxPaid: 10_000_000,
    isHeir: true,
    doneeId: "spouse1",
    beneficiaryType: "heir",
  };

  const input: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems: [{ id: "e1", category: "cash", name: "현금", marketValue: 3_000_000_000 }],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [overdueSpousalGift],
    heirs: [HEIR_SPOUSE, HEIR_CHILD],
    deductionInput: { heirs: [HEIR_SPOUSE, HEIR_CHILD] },
    creditInput: { isFiledOnTime: true },
  };

  const result = calcInheritanceTax(input);

  it("CUTOFF-B1: 도과 배우자 증여 → priorGiftAggregated=0 (과세가액 미합산)", () => {
    expect(result.priorGiftAggregated).toBe(0);
  });

  it("CUTOFF-B2: §19 분자 cutoff 정합 → spouseDeduction=1,800,000,000", () => {
    // 도과분이 §19 분자에 포함되면 배우자공제 과대(구버전 M-1 버그)
    // 정합: cutoffFilteredGifts → heirGiftAmount=0 → 분자=30억 × 1.5/2.5=18억
    expect(result.deductionDetail?.spouseDeduction).toBe(1_800_000_000);
  });

  it("CUTOFF-B3: 최종납부세액 = 144,045,000 (과세가액·공제 정합 종합)", () => {
    expect(result.finalTax).toBe(144_045_000);
  });
});

// ────────────────────────────────────────────────────────────
// (C) M-4: §27 세대생략 분모 cutoff 정합
// ────────────────────────────────────────────────────────────
describe("(C) M-4: §27 세대생략 할증 분모 — cutoffFilteredGifts 동일 기준 적용", () => {
  /**
   * 시나리오: 현금 50억, 자녀(법정상속인)+손녀(legatee, isGenerationSkipBeneficiary=true),
   *   손녀 유증 5억 + 나머지 45억 자녀.
   *   영리법인에게 도과 증여(giftDate=2016-05-20, boundary=2021-05-21 → 도과).
   *   deathDate=2026-05-21.
   *
   * 분모 정합:
   *   - taxableEstateValue = 50억(자산) + 0(도과법인미합산) − 공제 = 45억 이하
   *   - 구버전(M-4 버그): nonHeirNonLegateeGifts = 5억(도과법인 포함) → adjustedDenominator 과소
   *   - 신버전(정합): cutoffFilteredGifts → nonHeirNonLegateeGifts = 0 → adjustedDenominator = taxableEstateValue
   *
   * 실측값: generationSkipSurcharge=53,678,678, finalTax=1,785,943,318
   */
  const HEIR_GRANDDAUGHTER: Heir = {
    id: "gd1",
    relation: "legatee",
    name: "손녀",
    birthDate: "1993-01-01",
    isHeir: false,
    isGenerationSkipBeneficiary: true,
  };
  const HEIR_CHILD: Heir = {
    id: "child1",
    relation: "child",
    name: "자녀",
    isHeir: true,
    isGenerationSkipBeneficiary: false,
  };

  const overdueCorporateGift: PriorGift = {
    giftDate: "2016-05-20", // boundary=2021-05-21 → 도과
    giftAmount: 500_000_000,
    giftTaxPaid: 0,
    isHeir: false,
    beneficiaryType: "corporate",
    corporateGiftComputedTax: 50_000_000,
  };

  const input: InheritanceTaxInput = {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems: [
      {
        id: "e1",
        category: "cash",
        name: "현금",
        marketValue: 5_000_000_000,
        heirAllocations: [
          { heirId: "child1", amount: 4_500_000_000 },
          { heirId: "gd1", amount: 500_000_000 },
        ],
      },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [overdueCorporateGift],
    heirs: [HEIR_CHILD, HEIR_GRANDDAUGHTER],
    deductionInput: {
      heirs: [HEIR_CHILD, HEIR_GRANDDAUGHTER],
      legateeAmountNonHeir: 500_000_000,
    },
    creditInput: { isFiledOnTime: true },
  };

  const result = calcInheritanceTax(input);

  it("CUTOFF-C1: 도과 영리법인 → priorGiftAggregated=0 (과세가액 미합산)", () => {
    expect(result.priorGiftAggregated).toBe(0);
  });

  it("CUTOFF-C2: §27 분모 정합 → generationSkipSurcharge=53,678,678", () => {
    // 구버전: nonHeirNonLegateeGifts=5억(도과 포함) → adjustedDenominator 과소 → 할증 과대
    // 신버전: nonHeirNonLegateeGifts=0(cutoff 내 법인증여 없음) → 분모=taxableEstateValue → 정합
    expect(result.generationSkipSurcharge).toBe(53_678_678);
  });

  it("CUTOFF-C3: 최종납부세액 = 1,785,943,318 (분모 정합 종합)", () => {
    expect(result.finalTax).toBe(1_785_943_318);
  });
});
