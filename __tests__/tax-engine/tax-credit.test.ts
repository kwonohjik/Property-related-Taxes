import { describe, it, expect } from "vitest";

// ── 단기재상속 ────────────────────────────────────────────────
import {
  getShortTermReinheritRate,
  calcShortTermReinheritCredit,
} from "@/lib/tax-engine/credits/short-term-reinheritance";

// ── 외국납부세액 ───────────────────────────────────────────────
import {
  calcForeignTaxCredit,
} from "@/lib/tax-engine/credits/foreign-tax-credit";

// ── 신고세액공제 ───────────────────────────────────────────────
import {
  calcFilingCredit,
} from "@/lib/tax-engine/credits/filing-credit";

// ── 조특법 특례 ────────────────────────────────────────────────
import {
  calcStartupFundSpecialTax,
  calcFamilyBusinessSpecialTax,
  getFamilyBusinessLimit,
} from "@/lib/tax-engine/credits/special-tax-treatment";

// ── 세액공제 통합 ─────────────────────────────────────────────
import {
  calcGiftTaxCredit,
  calcInheritanceTaxCredits,
  calcGiftTaxCredits,
} from "@/lib/tax-engine/inheritance-gift-tax-credit";

// ── 공통 유틸 ─────────────────────────────────────────────────
import {
  calcInheritanceGiftTax,
  calcGenerationSkipSurcharge,
  calcFuneralExpenseDeduction,
  aggregatePriorGiftsForInheritance,
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
} from "@/lib/tax-engine/inheritance-gift-common";

// ============================================================
// 1. 단기재상속세액공제 (§30)
// ============================================================

describe("단기재상속세액공제 — §30", () => {
  it("[C1] 경과 연수 0년 → 공제율 100%", () => {
    expect(getShortTermReinheritRate(0)).toBe(1.0);
  });

  it("[C2] 경과 1년 이내 → 100%", () => {
    expect(getShortTermReinheritRate(1)).toBe(1.0);
  });

  it("[C3] 경과 2년 → 90%", () => {
    expect(getShortTermReinheritRate(2)).toBe(0.9);
  });

  it("[C4] 경과 5년 → 60%", () => {
    expect(getShortTermReinheritRate(5)).toBe(0.6);
  });

  it("[C5] 경과 10년 → 10%", () => {
    expect(getShortTermReinheritRate(10)).toBe(0.1);
  });

  it("[C6] 경과 11년 → 공제 없음 (0%)", () => {
    expect(getShortTermReinheritRate(11)).toBe(0);
  });

  it("[C7] 전 납부세액 1억, 5년 경과 → 공제 6,000만", () => {
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 5,
      currentComputedTax: 200_000_000,
    });
    expect(result.creditAmount).toBe(60_000_000); // 1억 × 60%
    expect(result.creditRate).toBe(0.6);
  });

  it("[C8] 공제 기본액이 당해 산출세액 초과 → 산출세액으로 절사", () => {
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 200_000_000,
      elapsedYears: 1, // 100%
      currentComputedTax: 150_000_000, // 한도
    });
    expect(result.creditAmount).toBe(150_000_000);
  });

  it("[C9] 10년 초과 → 공제 0", () => {
    const result = calcShortTermReinheritCredit({
      priorTaxPaid: 100_000_000,
      elapsedYears: 11,
      currentComputedTax: 200_000_000,
    });
    expect(result.creditAmount).toBe(0);
  });
});

// ============================================================
// 2. 외국납부세액공제 (§29·§59)
// ============================================================

describe("외국납부세액공제 — §29·§59", () => {
  it("[C10] 외국납부세액 < 산출세액 → 전액 공제", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 30_000_000,
      computedTax: 100_000_000,
      mode: "inheritance",
    });
    expect(result.creditAmount).toBe(30_000_000);
  });

  it("[C11] 외국납부세액 > 산출세액 → 산출세액으로 절사", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 150_000_000,
      computedTax: 100_000_000,
      mode: "gift",
    });
    expect(result.creditAmount).toBe(100_000_000);
  });

  it("[C12] 국외재산 비율 50% → 한도 = 산출세액 × 50%", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 80_000_000,
      computedTax: 100_000_000,
      foreignPropertyRatio: 0.5,
      mode: "inheritance",
    });
    // 한도 = 100M × 0.5 = 50M → min(80M, 50M) = 50M
    expect(result.creditAmount).toBe(50_000_000);
  });

  it("[C13] 외국납부세액 0 → 공제 0", () => {
    const result = calcForeignTaxCredit({
      foreignTaxPaid: 0,
      computedTax: 100_000_000,
      mode: "inheritance",
    });
    expect(result.creditAmount).toBe(0);
  });
});

// ============================================================
// 3. 신고세액공제 (§69)
// ============================================================

describe("신고세액공제 — §69 (3%)", () => {
  it("[C14] 기한 내 신고, 산출세액 1억 → 300만 공제", () => {
    const result = calcFilingCredit({
      isFiledOnTime: true,
      taxBeforeFilingCredit: 100_000_000,
    });
    expect(result.creditAmount).toBe(3_000_000);
  });

  it("[C15] 기한 내 미신고 → 공제 0", () => {
    const result = calcFilingCredit({
      isFiledOnTime: false,
      taxBeforeFilingCredit: 100_000_000,
    });
    expect(result.creditAmount).toBe(0);
  });

  it("[C16] 산출세액 0 → 공제 0", () => {
    const result = calcFilingCredit({
      isFiledOnTime: true,
      taxBeforeFilingCredit: 0,
    });
    expect(result.creditAmount).toBe(0);
  });
});

// ============================================================
// 4. 조특법 과세특례 (§30의5·§30의6)
// ============================================================

describe("조특법 과세특례", () => {
  it("[C17] 창업자금 3억 → 5억 공제 후 과세표준 0 → 특례세액 0", () => {
    const result = calcStartupFundSpecialTax({
      giftAmount: 300_000_000,
      normalComputedTax: 20_000_000,
    });
    expect(result.specialTax).toBe(0);
    expect(result.creditAmount).toBe(20_000_000); // 절감액 = 일반세액 전액
  });

  it("[C18] 창업자금 10억 → 과세표준 5억 × 10% = 5천만", () => {
    const result = calcStartupFundSpecialTax({
      giftAmount: 1_000_000_000,
      normalComputedTax: 140_000_000, // 일반세액 (10억 과세표준시 약 1.4억)
    });
    // 과세표준 = 10억 - 5억 = 5억, 5억 ≤ 50억이므로 10%
    expect(result.specialTax).toBe(50_000_000);
    expect(result.creditAmount).toBe(90_000_000); // 140M - 50M
  });

  it("[C19] 가업승계 영위 기간 10년 → 한도 300억", () => {
    expect(getFamilyBusinessLimit(10)).toBe(30_000_000_000);
  });

  it("[C20] 가업승계 영위 기간 30년 → 한도 600억", () => {
    expect(getFamilyBusinessLimit(30)).toBe(60_000_000_000);
  });

  it("[C21] 가업승계 영위 기간 5년 → 특례 불가 (한도 0)", () => {
    expect(getFamilyBusinessLimit(5)).toBe(0);
  });

  it("[C22] 가업승계 20억 → 과세표준 10억 × 10% = 1억", () => {
    const result = calcFamilyBusinessSpecialTax({
      giftAmount: 2_000_000_000,
      businessYears: 15,
      normalComputedTax: 340_000_000,
    });
    // 과세표준 = 20억 - 10억 = 10억, 10% → 1억
    expect(result.specialTax).toBe(100_000_000);
  });
});

// ============================================================
// 5. 세액공제 통합 (§28~§30·§59·§69)
// ============================================================

describe("세액공제 통합 — 적용 순서", () => {
  it("[C23] 상속세: 증여세액공제 → 신고세액공제 순으로 적용", () => {
    // 산출세액 1억, 사전증여세 납부 1천만, 기한 내 신고
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 50_000_000,
            giftTaxPaid: 10_000_000,
          },
        ],
        isFiledOnTime: true,
      },
      computedTax: 100_000_000,
      generationSkipSurcharge: 0,
      taxableEstateValue: 500_000_000,
      deathDate: "2025-01-01", // 2020-01-01 → 5년, 상속인(isHeir=true) 10년 이내 → 포함
    });

    // 1. 증여세액공제: 10,000,000
    expect(result.giftTaxCredit).toBe(10_000_000);
    // 2. 외국납부: 0
    expect(result.foreignTaxCredit).toBe(0);
    // 3. 단기재상속: 0
    expect(result.shortTermReinheritCredit).toBe(0);
    // 4. 신고세액공제: (100M - 10M) × 3% = 2,700,000
    expect(result.filingCredit).toBe(2_700_000);
    // 합계: 10M + 2.7M = 12.7M
    expect(result.totalCredit).toBe(12_700_000);
  });

  it("[C24] 증여세: 기한 내 신고 3% 공제 단독", () => {
    const result = calcGiftTaxCredits({
      creditInput: {
        isFiledOnTime: true,
      },
      computedTax: 50_000_000,
      generationSkipSurcharge: 0,
    });
    // 외국납부 0, 특례 0 → 신고세액공제: 50M × 3% = 1.5M
    expect(result.filingCredit).toBe(1_500_000);
    expect(result.totalCredit).toBe(1_500_000);
  });

  it("[C25] 세대생략 30% 할증 + 신고세액공제", () => {
    // 과세표준 5억, 산출세액 = 30% × 5억 - 6천만 = 9천만
    const taxBase = 500_000_000;
    const computedTax = calcInheritanceGiftTax(taxBase);
    // = 500M × 0.3 - 60M = 90,000,000
    expect(computedTax).toBe(90_000_000);

    const { surchargeAmount } = calcGenerationSkipSurcharge(
      computedTax,
      true,
      false,
      taxBase,
    );
    expect(surchargeAmount).toBe(27_000_000); // 90M × 30%

    const result = calcInheritanceTaxCredits({
      creditInput: { isFiledOnTime: true },
      computedTax,
      generationSkipSurcharge: surchargeAmount,
      taxableEstateValue: 500_000_000,
    });
    // 산출 + 할증 = 117M, 신고공제: 117M × 3% = 3,510,000
    expect(result.filingCredit).toBe(3_510_000);
    expect(result.totalCredit).toBe(3_510_000);
  });
});

// ============================================================
// 6. 공통 유틸 추가 검증
// ============================================================

describe("공통 유틸 — §14 장례비 공제", () => {
  // 일반 장례비 한도: 1,000만원 (시행령 §9 ①) / 봉안시설 추가: +500만원
  it("[C26] 장례비 800만 → 한도(1,000만) 내이므로 800만 공제", () => {
    const { deduction } = calcFuneralExpenseDeduction(8_000_000, false);
    expect(deduction).toBe(8_000_000);
  });

  it("[C27] 장례비 1,200만 → 일반 한도 1,000만으로 절사", () => {
    const { deduction } = calcFuneralExpenseDeduction(12_000_000, false);
    expect(deduction).toBe(10_000_000);
  });

  it("[C28] 장례비 0원 → 최솟값 500만 인정", () => {
    const { deduction } = calcFuneralExpenseDeduction(0, false);
    expect(deduction).toBe(5_000_000);
  });

  it("[C29] 봉안시설 포함 + 장례비 1,200만 → 봉안 한도(1,500만) 내이므로 1,200만 공제", () => {
    const { deduction } = calcFuneralExpenseDeduction(12_000_000, true);
    expect(deduction).toBe(12_000_000);
  });

  it("[C30] 봉안시설 포함 + 장례비 2,000만 → 봉안 한도 1,500만으로 절사", () => {
    const { deduction } = calcFuneralExpenseDeduction(20_000_000, true);
    expect(deduction).toBe(15_000_000);
  });
});

describe("공통 유틸 — §26 누진세율", () => {
  it("[C31] 과세표준 0 → 세액 0", () => {
    expect(calcInheritanceGiftTax(0)).toBe(0);
  });

  it("[C32] 과세표준 1억 → 세액 1,000만 (10%)", () => {
    expect(calcInheritanceGiftTax(100_000_000)).toBe(10_000_000);
  });

  it("[C33] 과세표준 5억 → 세액 9,000만 (30% × 5억 - 6천만)", () => {
    // 5억은 정확히 [500M, 30%, 60M] 구간
    // 하지만 구간 경계: min=500_000_001이므로 5억은 [1억~5억] 구간
    // 5억: 20% × 500M - 10M = 90M
    expect(calcInheritanceGiftTax(500_000_000)).toBe(90_000_000);
  });

  it("[C34] 과세표준 30억 초과(31억) → 세액 50% × 31억 - 4.6억", () => {
    const tax = calcInheritanceGiftTax(3_100_000_000);
    expect(tax).toBe(Math.floor(3_100_000_000 * 0.5) - 460_000_000);
  });
});

describe("공통 유틸 — §13 사전증여 합산", () => {
  it("[C35] 10년 이내 상속인 증여 → 합산 포함", () => {
    const { totalAmount } = aggregatePriorGiftsForInheritance(
      [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 100_000_000,
          giftTaxPaid: 0,
        },
      ],
      "2025-06-01",
    );
    expect(totalAmount).toBe(100_000_000);
  });

  it("[C36] 10년 초과 → 합산 제외", () => {
    const { totalAmount } = aggregatePriorGiftsForInheritance(
      [
        {
          giftDate: "2010-01-01",
          isHeir: true,
          giftAmount: 100_000_000,
          giftTaxPaid: 0,
        },
      ],
      "2025-06-01", // 15년 경과
    );
    expect(totalAmount).toBe(0);
  });
});
