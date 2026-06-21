/**
 * 부담부증여 세부담 비교 — anchor
 *
 * 설계: docs/02-design/features/burdened-gift-tax-burden-comparison.{engine,ui}.design.md
 *
 * anchor-1: calcGiftTax 채무 0(단순증여) vs 채무 有(부담부) finalTax 실측 (§47①·§56·§69)
 * anchor-2: computeBurdenedGiftComparison 자기일관 (합계·차액)
 * anchor-3: buildGiftTaxInput 주식 채무 병합분 전체 채무 0 처리 (T-07)
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { computeBurdenedGiftComparison } from "@/lib/calc/gift-burden-comparison";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

// ─────────────────────────────────────────────────────────
// anchor-1 — 2억 부동산, 직계존속→성년 자녀(공제 5천만), 채무 8천만
//   단순증여(채무 0):  과세가액 2억 − 공제 5천만 = 1.5억
//                      산출 1.5억×20% − 1천만 = 2천만 / 신고공제 3% 60만 → 19,400,000
//   부담부(채무 8천만): 과세가액 1.2억 − 공제 5천만 = 7천만
//                      산출 7천만×10% = 7백만 / 신고공제 3% 21만 → 6,790,000
// ─────────────────────────────────────────────────────────

const PROP_200M: EstateItem = {
  id: "prop-1",
  category: "real_estate_land",
  name: "테스트 토지",
  marketValue: 200_000_000,
};

const BASE_INPUT: GiftTaxInput = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_descendant",
  donor: "father",
  giftItems: [PROP_200M],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" },
  creditInput: { isFiledOnTime: true },
};

describe("[anchor-1] 단순증여(채무 0) vs 부담부증여(채무 8천만) finalTax 실측", () => {
  it("단순증여 — 채무 0 → finalTax 19,400,000", () => {
    const r = calcGiftTax(BASE_INPUT);
    expect(r.aggregatedGiftValue).toBe(200_000_000); // 채무 미차감
    expect(r.taxBase).toBe(150_000_000); // 2억 − 5천만 공제
    expect(r.finalTax).toBe(19_400_000);
  });

  it("부담부증여 — 채무 8천만 → finalTax 6,790,000", () => {
    const r = calcGiftTax({
      ...BASE_INPUT,
      giftItems: [{ ...PROP_200M, assumedDebtForGift: 80_000_000 }],
    });
    expect(r.debtAssumed).toBe(80_000_000);
    expect(r.aggregatedGiftValue).toBe(120_000_000); // 2억 − 8천만
    expect(r.taxBase).toBe(70_000_000); // 1.2억 − 5천만 공제
    expect(r.finalTax).toBe(6_790_000);
  });

  it("단순증여 baseline = 부담부 input의 채무만 0으로 덮어쓴 결과와 동일", () => {
    const burdenedInput: GiftTaxInput = {
      ...BASE_INPUT,
      giftItems: [{ ...PROP_200M, assumedDebtForGift: 80_000_000 }],
    };
    // 채무만 0으로 덮어쓰기 (원본 불변 — map + spread)
    const simpleInput: GiftTaxInput = {
      ...burdenedInput,
      giftItems: burdenedInput.giftItems.map((it) => ({
        ...it,
        assumedDebtForGift: 0,
      })),
    };
    expect(calcGiftTax(simpleInput).finalTax).toBe(19_400_000);
    // 원본 불변 확인
    expect(burdenedInput.giftItems[0].assumedDebtForGift).toBe(80_000_000);
  });
});

// ─────────────────────────────────────────────────────────
// anchor-2 — computeBurdenedGiftComparison 자기일관
// ─────────────────────────────────────────────────────────

describe("[anchor-2] computeBurdenedGiftComparison 자기일관", () => {
  it("합계·차액 산식", () => {
    const simple = calcGiftTax(BASE_INPUT); // finalTax 19,400,000
    const burdened = calcGiftTax({
      ...BASE_INPUT,
      giftItems: [{ ...PROP_200M, assumedDebtForGift: 80_000_000 }],
    }); // finalTax 6,790,000
    const transfers = [
      { totalTax: 5_000_000 } as TransferTaxResult,
    ];

    const cmp = computeBurdenedGiftComparison(simple, burdened, transfers);
    expect(cmp.simpleGiftTax).toBe(19_400_000);
    expect(cmp.burdenedGiftTax).toBe(6_790_000);
    expect(cmp.burdenedTransferTax).toBe(5_000_000);
    expect(cmp.burdenedTotal).toBe(11_790_000); // 6,790,000 + 5,000,000
    expect(cmp.taxBurdenDiff).toBe(7_610_000); // 19,400,000 − 11,790,000
  });

  it("양도세 2건 reduce 합산", () => {
    const simple = calcGiftTax(BASE_INPUT);
    const burdened = calcGiftTax(BASE_INPUT);
    const transfers = [
      { totalTax: 3_000_000 } as TransferTaxResult,
      { totalTax: 2_000_000 } as TransferTaxResult,
    ];
    const cmp = computeBurdenedGiftComparison(simple, burdened, transfers);
    expect(cmp.burdenedTransferTax).toBe(5_000_000);
  });

  it("차액 음수 가능(부담부 합계가 더 큼) — 중립 산식", () => {
    const simple = calcGiftTax(BASE_INPUT); // 19,400,000
    const burdened = calcGiftTax(BASE_INPUT); // 19,400,000 (채무 0)
    const transfers = [{ totalTax: 5_000_000 } as TransferTaxResult];
    const cmp = computeBurdenedGiftComparison(simple, burdened, transfers);
    expect(cmp.taxBurdenDiff).toBe(-5_000_000); // 19,400,000 − 24,400,000
  });
});

// ─────────────────────────────────────────────────────────
// anchor-3 — buildGiftTaxInput 주식 채무 병합 + 전체 채무 0 처리 (T-07)
// ─────────────────────────────────────────────────────────

describe("[anchor-3] 주식 부담부증여 채무 병합분 전체 채무 0 처리", () => {
  it("buildGiftTaxInput 결과 giftItems에 부동산·주식 채무 모두 병합", () => {
    const form = {
      ...INITIAL_FORM,
      giftItems: [
        {
          id: "p1",
          category: "real_estate_land",
          name: "토지",
          marketValue: 500_000_000,
          assumedDebtForGift: 100_000_000,
        },
      ] as EstateItem[],
      stockItems: [
        {
          id: "s1",
          category: "listed_stock",
          name: "상장주식",
          listedStockAvgPrice: 10_000,
          listedStockShares: 10_000,
          assumedDebtForGift: 50_000_000,
        },
      ] as EstateItem[],
    };

    const engineInput = buildGiftTaxInput(form);
    const allDebt = engineInput.giftItems.reduce(
      (s, it) => s + (it.assumedDebtForGift ?? 0),
      0,
    );
    expect(allDebt).toBe(150_000_000); // 부동산 1억 + 주식 5천만 병합 확인

    // 채무 0 덮어쓰기 — 병합 배열 전체에 적용
    const simpleInput = {
      ...engineInput,
      giftItems: engineInput.giftItems.map((it) => ({
        ...it,
        assumedDebtForGift: 0,
      })),
    };
    const simpleDebt = simpleInput.giftItems.reduce(
      (s, it) => s + (it.assumedDebtForGift ?? 0),
      0,
    );
    expect(simpleDebt).toBe(0); // 주식 채무 누락 없이 전체 0
  });
});
