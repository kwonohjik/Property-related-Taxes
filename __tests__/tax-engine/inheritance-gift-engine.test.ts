/**
 * 메인 엔진 통합 단위 테스트
 * 상속세 (E1~E9) + 증여세 (E10~E18)
 *
 * 각 테스트는 계산 파이프라인 전체를 관통하여 결정세액을 검증.
 * 핵심 계산 원칙:
 *   - §26 구간: 1억이하10%, [1억+1~5억]20%-1천만, [5억+1~10억]30%-6천만
 *   - §69 신고공제: 남은세액 × 3%
 *   - §24 종합한도: 과세가액 - 상속인사전증여액
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  InheritanceTaxInput,
  GiftTaxInput,
  Heir,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼 — 재산 항목 생성
// ============================================================

function financialItem(id: string, amount: number): EstateItem {
  return { id, category: "financial", name: `예금${id}`, marketValue: amount };
}

function heirChild(id = "h1"): Heir {
  return { id, relation: "child" };
}

function heirSpouse(id = "hs"): Heir {
  return { id, relation: "spouse" };
}

// ============================================================
// 상속세 테스트 (E1~E9)
// ============================================================

describe("상속세 메인 엔진 — calcInheritanceTax()", () => {
  // ──── E1: 단순 케이스 ─────────────────────────────────────
  it("[E1] 현금 10억 / 자녀1 / 일괄공제5억 / 기한내신고", () => {
    /**
     * 과세가액 = 10억 - 1천만(장례비) = 990,000,000
     * 공제: 일괄5억 (자녀1명 → 기초2억+자녀500만=2억500만 < 5억)
     * 과세표준 = 990M - 500M = 490,000,000
     * 산출세액 = floor(490M × 0.2) - 10M = 98M - 10M = 88,000,000
     * 신고공제 = floor(88M × 0.03) = 2,640,000
     * 결정세액 = 88M - 2.64M = 85,360,000
     */
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 10_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcInheritanceTax(input);
    expect(result.grossEstateValue).toBe(1_000_000_000);
    expect(result.taxableEstateValue).toBe(990_000_000);
    expect(result.totalDeduction).toBe(500_000_000); // 일괄공제
    expect(result.taxBase).toBe(490_000_000);
    expect(result.computedTax).toBe(88_000_000);
    expect(result.finalTax).toBe(85_360_000);
  });

  // ──── E2: 채무 공제 ───────────────────────────────────────
  it("[E2] 현금 5억 / 채무 1억 / 자녀1 / 일괄공제5억 → 과세표준 0", () => {
    /**
     * 과세가액 = 5억 - 500만(장례min) - 1억 = 3억9500만
     * 공제: 일괄5억 > 과세가액 → §24 한도로 절사
     * 과세표준 = 0 → 결정세액 = 0
     */
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 500_000_000)],
      funeralExpense: 0, // → min 500만 인정
      funeralIncludesBongan: false,
      debts: 100_000_000,
      preGiftsWithin10Years: [],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcInheritanceTax(input);
    // 과세가액 = 500M - 5M(장례min) - 100M = 395,000,000
    expect(result.taxableEstateValue).toBe(395_000_000);
    // 일괄공제 5억 > 3억9500만 → §24 한도 3억9500만으로 절사
    expect(result.totalDeduction).toBe(395_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.computedTax).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E3: 사전증여 합산 + §24 한도 ───────────────────────
  it("[E3] 재산 5억 + 상속인 사전증여 2억 → §24 한도 제한", () => {
    /**
     * 과세가액 = 5억 - 500만 + 2억 = 695,000,000
     * §24 한도 = 695M - 200M(상속인증여) = 495,000,000
     * 일괄공제 5억 > 한도 4.95억 → 공제 = 495M
     * 과세표준 = 695M - 495M = 200,000,000
     * 산출세액 = floor(200M × 0.2) - 10M = 30,000,000
     * 신고공제 = floor(30M × 0.03) = 900,000
     * 결정세액 = 29,100,000
     */
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 500_000_000)],
      funeralExpense: 0, // → min 500만
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [
        {
          giftDate: "2020-01-01",
          isHeir: true,
          giftAmount: 200_000_000,
          giftTaxPaid: 0,
        },
      ],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcInheritanceTax(input);
    expect(result.priorGiftAggregated).toBe(200_000_000);
    expect(result.taxableEstateValue).toBe(695_000_000);
    expect(result.totalDeduction).toBe(495_000_000); // §24 한도 절사
    expect(result.taxBase).toBe(200_000_000);
    expect(result.computedTax).toBe(30_000_000);
    expect(result.finalTax).toBe(29_100_000);
  });

  // ──── E4: 증여세액공제 (§28) ──────────────────────────────
  it("[E4] 사전증여세 납부 → §28 증여세액공제", () => {
    /**
     * 재산 10억, 상속인 사전증여 1억 (납부 증여세 5백만)
     * 과세가액 = 10억 - 1천만 + 1억 = 10.9억 = 1,090,000,000
     * §24 한도 = 1090M - 100M = 990M
     * 일괄공제 5억 ≤ 990M → 공제 5억
     * 과세표준 = 1090M - 500M = 590,000,000
     * 590M ≤ 1000M → 30% 구간: floor(590M × 0.3) - 60M = 177M - 60M = 117,000,000
     * 증여세액공제 = min(5M, 117M) = 5,000,000
     * 신고공제 = floor((117M - 5M) × 0.03) = floor(112M × 0.03) = 3,360,000
     * 결정세액 = 117M - 5M - 3.36M = 108,640,000
     *
     * NOTE: preGiftsWithin10Years = 과세가액 합산용
     *       creditInput.priorGifts = §28 세액공제용 (두 필드 모두 입력 필요)
     */
    const priorGift = {
      giftDate: "2020-06-01",
      isHeir: true,
      giftAmount: 100_000_000,
      giftTaxPaid: 5_000_000,
    };
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 10_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [priorGift],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: {
        isFiledOnTime: true,
        priorGifts: [priorGift], // §28 증여세액공제용 (preGiftsWithin10Years와 별도)
      },
    };
    const result = calcInheritanceTax(input);
    expect(result.computedTax).toBe(117_000_000);
    expect(result.creditDetail.giftTaxCredit).toBe(5_000_000);
    expect(result.creditDetail.filingCredit).toBe(3_360_000);
    expect(result.finalTax).toBe(108_640_000);
  });

  // ──── E5: 단기재상속 공제 ─────────────────────────────────
  it("[E5] 단기재상속 3년 경과 → 80% 공제", () => {
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 10_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: {
        isFiledOnTime: false, // 신고공제 제외로 단순화
        shortTermReinheritYears: 3,
        shortTermReinheritTaxPaid: 50_000_000,
      },
    };
    const result = calcInheritanceTax(input);
    // 산출세액 88M, 3년 경과 → 80%, 공제 = min(50M×80%, 88M) = 40M
    expect(result.creditDetail.shortTermReinheritCredit).toBe(40_000_000);
    // 결정세액 = 88M - 40M = 48,000,000
    expect(result.finalTax).toBe(48_000_000);
  });

  // ──── E6: 배우자 + 자녀 상속 ─────────────────────────────
  it("[E6] 배우자+자녀1 / 재산 30억 → 배우자공제+일괄공제", () => {
    /**
     * 장례비 1,500만, 일반 한도 1,000만 → 공제 1,000만 (시행령 §9)
     * 과세가액 = 30억 - 1000만 = 2,990,000,000
     * 배우자 법정상속분: 1.5/(1.5+1) = 0.6 → 2990M × 0.6 = 1,794,000,000
     * 배우자공제 = min(max(1794M, 5억), 30억) = 1,794,000,000
     * 기초공제 2억 + 자녀 500만 = 205M
     * 일괄 5억 > 205M → 일괄 선택
     * rawTotal = 1794M + 500M = 2,294,000,000
     * §24 한도 = 2990M (no prior gifts) → no cap
     * 과세표준 = 2990M - 2294M = 696,000,000
     * 696M > 500M → 30% 구간: floor(696M×0.3) - 60M = 208,800,000 - 60,000,000 = 148,800,000
     * 신고공제 = floor(148.8M × 0.03) = 4,464,000
     * 결정세액 = 148,800,000 - 4,464,000 = 144,336,000
     */
    const heirs: Heir[] = [heirSpouse(), heirChild()];
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 3_000_000_000)],
      funeralExpense: 15_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs,
      deductionInput: { heirs },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcInheritanceTax(input);
    expect(result.taxableEstateValue).toBe(2_990_000_000);
    expect(result.deductionDetail.spouseDeduction).toBe(1_794_000_000);
    expect(result.computedTax).toBe(148_800_000);
    expect(result.creditDetail.filingCredit).toBe(4_464_000);
    expect(result.finalTax).toBe(144_336_000);
  });

  // ──── E7: 봉안시설 포함 장례비 ───────────────────────────
  it("[E7] 봉안시설 포함 장례비 2,200만 → 봉안 한도 1,500만으로 절사", () => {
    // 봉안 포함 한도 = 일반 1,000만 + 봉안 추가 500만 = 1,500만 (시행령 §9)
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 22_000_000,
      funeralIncludesBongan: true, // 봉안 포함 → 한도 1,500만
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: false },
    };
    const result = calcInheritanceTax(input);
    expect(result.deductedBeforeAggregation).toBe(15_000_000); // 봉안 한도 절사
  });

  // ──── E8: 10년 초과 사전증여 → 합산 제외 ─────────────────
  it("[E8] 11년 전 증여 → 합산 제외, 사전증여 0", () => {
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 500_000_000)],
      funeralExpense: 5_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [
        {
          giftDate: "2013-01-01", // 12년 전
          isHeir: true,
          giftAmount: 300_000_000,
          giftTaxPaid: 0,
        },
      ],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcInheritanceTax(input);
    expect(result.priorGiftAggregated).toBe(0); // 10년 초과 → 제외
    expect(result.taxableEstateValue).toBe(495_000_000); // 500M - 5M
  });

  // ──── E9: 외국납부세액공제 ────────────────────────────────
  it("[E9] 외국납부세액 3천만 → 산출세액에서 공제", () => {
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 10_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: {
        isFiledOnTime: false, // 신고공제 제외로 단순화
        foreignTaxPaid: 30_000_000,
      },
    };
    const result = calcInheritanceTax(input);
    // 산출세액 88M, 외국납부 30M → 잔여 58M
    expect(result.creditDetail.foreignTaxCredit).toBe(30_000_000);
    expect(result.finalTax).toBe(58_000_000);
  });

  // ──── E9-A: 상속세 세대생략 할증 30% (CRITICAL-1 수정 검증) ─
  it("[E9-A] 세대생략(성인) — 현금 10억, 자녀1 / 세대생략 30% 할증", () => {
    /**
     * 과세가액: 10억 - 장례1천만 = 990M
     * 일괄공제 5억 → 과표 490M
     * 산출세액: floor(490M × 0.2) - 10M = 88,000,000
     * 세대생략 30%: floor(88M × 0.3) = 26,400,000
     * 신고공제: floor((88M + 26.4M) × 0.03) = 3,432,000
     * 결정세액: 88M + 26.4M - 3.432M = 110,968,000
     */
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 10_000_000,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: true },
      isGenerationSkip: true,
      isMinorHeir: false,
    };
    const result = calcInheritanceTax(input);
    expect(result.computedTax).toBe(88_000_000);
    expect(result.generationSkipSurcharge).toBe(26_400_000); // floor(88M × 0.3)
    expect(result.finalTax).toBe(110_968_000); // 88M + 26.4M - 3.432M
  });

  // ──── E9-B: §28 증여세액공제 — §13 기간 외 사전증여 제외 검증 ─
  it("[E9-B] §28 증여세액공제 — 비상속인 7년 전 증여(5년 초과)는 §13 합산 제외 → 공제 0", () => {
    /**
     * grossEstateValue = 10억
     * 장례비 최소 500만 공제 → deductedBeforeAggregation = 5M
     * priorGift: isHeir=false, giftDate=2018-01-01, deathDate=2025-01-01 → 7년
     *   → 비상속인 한도 5년 초과 → §13 합산 제외 → priorGiftAggregated = 0
     * taxableEstateValue = 10억 - 5M = 995,000,000
     * 일괄공제 5억 → 과표 = 995M - 500M = 495,000,000
     * 산출세액: floor(495M × 0.2) - 10M = 89,000,000
     *
     * §28 ① 공제:
     *   eligiblePriorGifts = [] (7년 → 5년 초과 필터링)
     *   giftTaxCredit = 0
     *
     * 신고공제: floor(89M × 0.03) = 2,670,000
     * 결정세액: 89M - 0 - 2,670,000 = 86,330,000
     */
    const priorGift = {
      id: "pg1", donorRelation: "lineal_ascendant" as const,
      giftDate: "2018-01-01", giftAmount: 200_000_000, giftTaxPaid: 50_000_000,
      isHeir: false,
    };
    const input: InheritanceTaxInput = {
      decedentType: "resident",
      deathDate: "2025-01-01",
      estateItems: [financialItem("1", 1_000_000_000)],
      funeralExpense: 0,
      funeralIncludesBongan: false,
      debts: 0,
      preGiftsWithin10Years: [priorGift],
      heirs: [heirChild()],
      deductionInput: { heirs: [heirChild()] },
      creditInput: { isFiledOnTime: true, priorGifts: [priorGift] },
    };
    const result = calcInheritanceTax(input);
    // 비상속인 7년 → 5년 초과 → §28 공제 대상 제외
    expect(result.creditDetail.giftTaxCredit).toBe(0);
    expect(result.finalTax).toBe(86_330_000);
  });
});

// ============================================================
// 증여세 테스트 (E10~E18)
// ============================================================

describe("증여세 메인 엔진 — calcGiftTax()", () => {
  // ──── E10: 공제 한도 내 → 세액 0 ──────────────────────────
  it("[E10] 직계비속 5천만 → 공제 한도(5천만) 내 → 결정세액 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 50_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.totalDeduction).toBe(50_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E11: 과세표준 1억 → 세액 10M ───────────────────────
  it("[E11] 직계비속 1억5천만 → 공제 5천만, 과세표준 1억 → 세액 1천만", () => {
    /**
     * 과세표준 = 1.5억 - 5천만 = 1억
     * 산출세액 = floor(1억 × 0.1) - 0 = 10,000,000
     * 신고공제 = floor(10M × 0.03) = 300,000
     * 결정세액 = 9,700,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 150_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(100_000_000);
    expect(result.computedTax).toBe(10_000_000);
    expect(result.creditDetail.filingCredit).toBe(300_000);
    expect(result.finalTax).toBe(9_700_000);
  });

  // ──── E12: 50만원 미만 → 과세 없음 ───────────────────────
  it("[E12] 기타친족 1천40만 → 공제 1천만, 과표 40만 < 50만 → 세액 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "other_relative",
      giftItems: [financialItem("1", 10_400_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "other_relative" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    // rawTaxBase = 400,000 < 500,000 → taxBase = 0
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E13: 10년 합산 → 공제 소진 ─────────────────────────
  it("[E13] 직계비속 5천만 + 기증여 4천만 → 공제잔여 1천만, 과표 4천만", () => {
    /**
     * 금번 증여 5천만, 기증여 4천만 (10년 내)
     * aggregatedGiftValue = 5천만 + 4천만 = 9천만
     * 관계공제 = 5천만 - 4천만(기사용) = 1천만
     * 과세표준 = 9천만 - 1천만 = 8천만
     * 산출세액 = floor(8천만 × 0.1) = 8,000,000
     * 신고공제 = floor(8M × 0.03) = 240,000
     * 결정세액 = 7,760,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-06-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 50_000_000)],
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-01-01",
          isHeir: false,
          giftAmount: 40_000_000,
          giftTaxPaid: 0,
        },
      ],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 40_000_000, // 기사용 공제
      },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.aggregatedGiftValue).toBe(90_000_000);
    expect(result.totalDeduction).toBe(10_000_000); // 잔여 공제
    expect(result.taxBase).toBe(80_000_000);
    expect(result.computedTax).toBe(8_000_000);
    expect(result.finalTax).toBe(7_760_000);
  });

  // ──── E14: 세대생략 30% 할증 (성인) ──────────────────────
  it("[E14] 세대생략(성인) — 과표 2.5억, 산출 4천만 → 할증 1200만", () => {
    /**
     * 직계비속 3억, 공제 5천만 → 과세표준 2.5억
     * 산출세액 = floor(2.5억 × 0.2) - 1천만 = 5천만 - 1천만 = 40,000,000
     * 세대생략 30%: floor(40M × 0.3) = 12,000,000
     * 신고공제: floor((40M + 12M) × 0.03) = floor(52M × 0.03) = 1,560,000
     * 결정세액 = 40M + 12M - 1.56M = 50,440,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 300_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(250_000_000);
    expect(result.computedTax).toBe(40_000_000);
    expect(result.generationSkipSurcharge).toBe(12_000_000);
    expect(result.creditDetail.filingCredit).toBe(1_560_000);
    expect(result.finalTax).toBe(50_440_000);
  });

  // ──── E15: 세대생략 40% 할증 (미성년 + 20억 초과) ────────
  it("[E15] 세대생략(미성년, 과표 29.5억) → 할증 40%", () => {
    /**
     * 직계비속 30억, 공제 5천만 → 과세표준 2,950,000,000
     * §26 구간 확인: 2.95억 ≤ 30억 → [10억+1~30억] 40% 구간
     * 산출세액 = floor(2.95억 × 0.4) - 1.6억 = 11.8억 - 1.6억 = 1,020,000,000
     * 과세표준 2.95억 > 20억 + 미성년 → 할증 40%
     * 세대생략 40%: floor(1020M × 0.4) = 408,000,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 3_000_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: true,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(2_950_000_000);
    expect(result.computedTax).toBe(1_020_000_000); // 40% 구간
    expect(result.generationSkipSurcharge).toBe(408_000_000); // 40% 할증
  });

  // ──── E16: 배우자 증여 6억 → 공제 한도 내 ────────────────
  it("[E16] 배우자 6억 → 공제 6억 한도 → 세액 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "spouse",
      giftItems: [financialItem("1", 600_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "spouse" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.totalDeduction).toBe(600_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E17: 혼인·출산 공제 포함 ───────────────────────────
  it("[E17] 성인직계존속 1억5천만 + 혼인공제 1억 → 과세표준 0", () => {
    /**
     * 직계존속(성인) 기본공제: 5천만
     * 혼인·출산공제: 1억 (단, 기본공제와 별도)
     * 총공제 = 5천만 + 1억 = 1억5천만
     * 과세표준 = 1.5억 - 1.5억 = 0
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_ascendant_adult",
      giftItems: [financialItem("1", 150_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_ascendant_adult",
        marriageExemption: 100_000_000,
      },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.totalDeduction).toBe(150_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E18: 기한 미신고 → 신고공제 없음 ───────────────────
  it("[E18] 기한 내 미신고 → 신고공제 0, 결정세액 = 산출세액", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 150_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false }, // 미신고
    };
    const result = calcGiftTax(input);
    // 신고공제 없음 → 결정세액 = 산출세액
    expect(result.creditDetail.filingCredit).toBe(0);
    expect(result.computedTax).toBe(10_000_000);
    expect(result.finalTax).toBe(10_000_000);
  });
});
