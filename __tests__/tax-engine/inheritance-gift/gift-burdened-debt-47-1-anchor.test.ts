/**
 * Pre-Do Anchor — 증여세 부담부증여 §47① 채무인수 차감
 *
 * 목적: 현행 엔진(채무 미지원) 실측값 vs 기대값(채무 차감 후) 표로 기록
 *
 * Anchor A: 10억 부동산 + 4억 채무 인수 시
 *   현행: debtAmount=0 고정 → 과세가액 = 10억 - 비과세 0 = 10억
 *   기대: 과세가액 = 10억 - 4억 = 6억 (§47①)
 *
 * Anchor B: 별지 10호 ② 행 현행값 vs 기대값
 *   현행: buildFilingFormRows({ debtAmount: 0 }) → ② = 0
 *   기대: buildFilingFormRows({ debtAmount: 400_000_000 }) → ② = 4억
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { buildFilingFormRows } from "@/lib/tax-engine/gift-filing-form-rows";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ─────────────────────────────────────────────────────────
// Anchor A — 10억 부동산, 직계비속 증여, 4억 채무 인수 현행 실측
// ─────────────────────────────────────────────────────────

const REAL_ESTATE_ITEM: EstateItem = {
  id: "prop-1",
  category: "real_estate_land",
  name: "테스트 토지",
  marketValue: 1_000_000_000, // 10억
};

const BASE_INPUT_NO_DEBT: GiftTaxInput = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_descendant",
  donor: "father",
  giftItems: [REAL_ESTATE_ITEM],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" },
  creditInput: { isFiledOnTime: true },
};

describe("[Pre-Do Anchor A] 10억 부동산 + 4억 채무 인수 — §47① 현행 실측", () => {
  /**
   * 현행 실측:
   *   grossGiftValue = 10억 (§66 MAX 적용 없음, marketValue 직접)
   *   debtAmount = 0  ← gift-tax.ts:258 하드코딩
   *   aggregatedGiftValue = 10억 - 0(비과세) = 10억
   *   totalDeduction = 5천만 (직계비속 §53)
   *   taxBase = 10억 - 5천만 = 9억5천만
   *
   * 기대 (§47① 구현 후):
   *   grossGiftValue = 10억
   *   debtAmount = 4억  ← assumedDebt 입력
   *   netCurrentGiftValue = 10억 - 0(비과세) - 4억(채무) = 6억
   *   aggregatedGiftValue = 6억
   *   taxBase = 6억 - 5천만 = 5억5천만
   */
  it("[A-1] 현행: debtAmount=0 → grossGiftValue=10억, aggregatedGiftValue=10억", () => {
    const result = calcGiftTax(BASE_INPUT_NO_DEBT);
    // 실측값 기록
    expect(result.grossGiftValue).toBe(1_000_000_000);       // 현행: 10억
    expect(result.exemptAmount).toBe(0);
    expect(result.aggregatedGiftValue).toBe(1_000_000_000);  // 현행: 10억 (채무 미차감)
    expect(result.totalDeduction).toBe(50_000_000);          // 직계비속 공제 5천만
    expect(result.taxBase).toBe(950_000_000);                 // 9억5천만 (채무 미차감)
  });

  it("[A-2] 현행 taxBase=9억5천만 → 세액 계산 (채무 미차감 기준)", () => {
    const result = calcGiftTax(BASE_INPUT_NO_DEBT);
    /**
     * §56 누진세율: 9억5천만 (10억 이하 → 30% - 6천만 구간)
     *   floor(9.5억 × 0.3) - 6,000만 = 285,000,000 - 60,000,000 = 225,000,000
     * §69 신고공제 3%: floor(225M × 0.03) = 6,750,000
     * 결정세액 = 225M - 6.75M = 218,250,000
     *
     * ※ §47① 구현 후 기대값 (참고):
     *   taxBase = 5억5천만 → computedTax = 105,000,000
     *   신고공제 = 3,150,000 → finalTax = 101,850,000
     */
    expect(result.computedTax).toBe(225_000_000);  // 현행 실측: 9.5억 × 30% - 6천만
    expect(result.finalTax).toBe(218_250_000);      // 현행 실측: 채무 미차감 기준

    // §47① 구현 후 기대 (참고용 — 현재 실패해야 정상):
    // taxBase = 5억5천만 → 산출세액 = 5.5억 × 30% - 6천만 = 1.05억
    // 신고공제 = floor(1.05억 × 0.03) = 3,150,000
    // 기대 finalTax = 101,850,000
    console.log("[A-2] 현행 finalTax:", result.finalTax);
    console.log("[A-2] 기대 finalTax(채무 4억 차감 후):", 101_850_000);
    console.log("[A-2] 현행-기대 차이:", result.finalTax - 101_850_000);
  });
});

// ─────────────────────────────────────────────────────────
// Anchor B — 별지 10호 ② 행 현행 0 실측
// ─────────────────────────────────────────────────────────

describe("[Pre-Do Anchor B] 별지 10호 ② 채무 행 현행 실측", () => {
  const ROWS_BASE = {
    grossGiftValue: 1_000_000_000,  // 10억
    debtAmount: 0,                  // gift-tax.ts:258 하드코딩 → 현행 0
    priorTotal: 0,
    totalDeduction: 50_000_000,
    taxBase: 950_000_000,
    bracketRateLabel: "40%",
    computedTax: 220_000_000,
    generationSkipDetail: null,
    priorGiftCreditDetail: null,
    reportingCredit: 6_600_000,
    finalTax: 213_400_000,
    hasPriorGifts: false,
  };

  it("[B-1] 현행: debtAmount=0 → ② 행 amount=0", () => {
    const rows = buildFilingFormRows(ROWS_BASE);
    const row2 = rows.find((r) => r.number === "②");
    expect(row2).toBeDefined();
    expect(row2!.amount).toBe(0);     // 현행: 항상 0
    expect(row2!.label).toBe("채무"); // ② 행 레이블 확인
    console.log("[B-1] ② 행 현행 amount:", row2!.amount);
    console.log("[B-1] ② 행 기대 amount (4억 채무 인수 시):", 400_000_000);
  });

  it("[B-2] 기대: debtAmount=4억 전달 시 → ② 행 amount=4억 (buildFilingFormRows는 이미 정상)", () => {
    // buildFilingFormRows 자체는 debtAmount를 그대로 표시하므로
    // 4억을 직접 전달하면 정상 동작 — 문제는 gift-tax.ts:258이 0 고정
    const rowsWithDebt = buildFilingFormRows({ ...ROWS_BASE, debtAmount: 400_000_000 });
    const row2 = rowsWithDebt.find((r) => r.number === "②");
    expect(row2!.amount).toBe(400_000_000); // buildFilingFormRows는 정상 — 엔진이 0 고정
    console.log("[B-2] ② 행 debtAmount=4억 직접 전달 시:", row2!.amount);
  });

  it("[B-3] ⑤ formula — 채무 항 항상 포함 (현행 ② = 0이어도 formula 표시는 '① − ② + ③ − ④')", () => {
    const rows = buildFilingFormRows(ROWS_BASE);
    const row5 = rows.find((r) => r.number === "⑤");
    expect(row5).toBeDefined();
    // PR #112에서 ⑤ formula에 ② 표기 완료 확인
    expect(row5!.formula).toBe("① − ② + ③ − ④");
    console.log("[B-3] ⑤ formula 현행:", row5!.formula);
  });
});

// ─────────────────────────────────────────────────────────
// Anchor C — §66 MAX 교차: mortgageAmount 설정 자산의 평가액과 §47① 차감
// 현행에서 §66 MAX가 mortgageAmount를 평가에 활용하는지 실측
// ─────────────────────────────────────────────────────────

describe("[Pre-Do Anchor C] §66 MAX 평가 vs §47① 채무 차감 교차 실측", () => {
  it("[C-1] mortgageAmount=4억 설정 표준가격 3억 자산 — 현행 §66 MAX 평가액 확인", () => {
    /**
     * §66 MAX(보충평가, 담보채권액) = MAX(3억, 4억) = 4억
     * 현행에서는 leaseDeposit(임대보증금환산) 없을 때 평가액이 MAX(표준가격, mortgageAmount)인지 확인
     */
    const itemWithMortgage: EstateItem = {
      id: "prop-2",
      category: "real_estate_land",
      name: "저당 설정 토지",
      standardPrice: 300_000_000, // 표준가격 3억
      mortgageAmount: 400_000_000,  // 저당 4억
    };
    const input: GiftTaxInput = {
      ...BASE_INPUT_NO_DEBT,
      giftItems: [itemWithMortgage],
    };
    const result = calcGiftTax(input);
    // §66 MAX 적용으로 평가액 = 4억 예상
    // (현행 property-valuation.ts §66 구현 여부 실측)
    console.log("[C-1] mortgageAmount=4억, standardPrice=3억 → grossGiftValue:", result.grossGiftValue);
    console.log("[C-1] §66 MAX 적용 여부:", result.grossGiftValue === 400_000_000 ? "적용됨" : "미적용(표준가격 그대로)");
    // 엔진이 §66 MAX를 적용한다면 4억, 표준가격만 사용하면 3억
    // 증여세는 상속세 §66 로직을 공유 — property-valuation.ts 실측 필요
  });
});

// ─────────────────────────────────────────────────────────
// Anchor D — §47① 구현 정식 anchor (Do 완료 후 법령 정합값)
// 법문: 과세가액 = 증여재산가액 − 수증자가 인수한 채무액 (§47①)
// ─────────────────────────────────────────────────────────

describe("[Anchor D] §47① 부담부증여 채무인수 차감 — 법령 정합", () => {
  const DEBT_ITEM: EstateItem = {
    ...REAL_ESTATE_ITEM,
    assumedDebtForGift: 400_000_000, // 수증자 인수 4억
  };
  const INPUT_WITH_DEBT: GiftTaxInput = {
    ...BASE_INPUT_NO_DEBT,
    giftItems: [DEBT_ITEM],
  };

  it("[D-1] 10억 − 4억 인수 → 과세가액 6억·과세표준 5억5천만", () => {
    const result = calcGiftTax(INPUT_WITH_DEBT);
    expect(result.grossGiftValue).toBe(1_000_000_000); // ① 재산가액은 차감 전
    expect(result.debtAssumed).toBe(400_000_000);      // echo
    expect(result.aggregatedGiftValue).toBe(600_000_000);
    expect(result.taxBase).toBe(550_000_000);          // 6억 − 5천만 공제
  });

  it("[D-2] 산출세액 1억5백만·신고공제 3% → finalTax 101,850,000", () => {
    const result = calcGiftTax(INPUT_WITH_DEBT);
    // §56: 5.5억 × 30% − 6천만(누진공제) = 1억5백만
    expect(result.computedTax).toBe(105_000_000);
    // §69: floor(1.05억 × 3%) = 3,150,000
    expect(result.finalTax).toBe(101_850_000);
  });

  it("[D-3] 별지 10호 ② 행 = 4억 (엔진 → filingFormRows 연동)", () => {
    const result = calcGiftTax(INPUT_WITH_DEBT);
    const row2 = result.filingFormRows?.find((r) => r.number === "②");
    expect(row2?.amount).toBe(400_000_000);
  });

  it("[D-4] 경계: 채무 ≥ 재산가액 → 과세가액 0 + 경고 (음수 가드)", () => {
    const result = calcGiftTax({
      ...BASE_INPUT_NO_DEBT,
      giftItems: [{ ...REAL_ESTATE_ITEM, assumedDebtForGift: 1_200_000_000 }],
    });
    expect(result.aggregatedGiftValue).toBe(0);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
    expect(result.warnings.some((w) => w.includes("채무인수액"))).toBe(true);
  });

  it("[D-5] 채무 미입력(undefined) → 기존 동작 100% 보존", () => {
    const result = calcGiftTax(BASE_INPUT_NO_DEBT);
    expect(result.debtAssumed).toBe(0);
    expect(result.aggregatedGiftValue).toBe(1_000_000_000);
    expect(result.taxBase).toBe(950_000_000);
    expect(result.finalTax).toBe(218_250_000);
  });

  it("[D-6] §66 MAX 교차: 평가 4억(저당 MAX) + 인수 4억 → 과세가액 0", () => {
    // 저당 4억 > 표준가격 3억 → §66 MAX 평가액 4억. 같은 채무를 수증자가 인수 → 과세가액 0 (법령상 정당)
    const result = calcGiftTax({
      ...BASE_INPUT_NO_DEBT,
      giftItems: [{
        id: "prop-3",
        category: "real_estate_land",
        name: "저당 인수 토지",
        standardPrice: 300_000_000,
        mortgageAmount: 400_000_000,
        assumedDebtForGift: 400_000_000,
      }],
    });
    expect(result.grossGiftValue).toBe(400_000_000); // §66 MAX 유지
    expect(result.aggregatedGiftValue).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  it("[D-7] 사전증여 합산 조합: 채무 차감 후 순가액 + prior 합산", () => {
    // 금번 10억 − 4억 = 6억, prior 2억 (동일인 father) → 합산 8억, 공제 5천만 → 과세표준 7.5억
    const result = calcGiftTax({
      ...INPUT_WITH_DEBT,
      priorGiftsWithin10Years: [{
        giftDate: "2022-01-01",
        donor: "father",
        isHeir: true,
        giftAmount: 200_000_000,
        giftTaxBase: 150_000_000,
        giftTaxPaid: 20_000_000,
        computedTax: 20_000_000,
      }],
    });
    expect(result.aggregatedGiftValue).toBe(800_000_000);
    expect(result.taxBase).toBe(750_000_000);
  });
});
