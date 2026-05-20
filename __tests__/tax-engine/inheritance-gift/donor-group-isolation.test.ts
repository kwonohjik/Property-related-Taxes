/**
 * §47 ② 동일인 그룹 분리 회귀 보호
 *
 * 부모(그룹 A) + 조부모(그룹 B) priorGifts 혼합 시
 * 그룹 B 신고에서 父 항목 자동 제외 + warnings 발생을 검증.
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function cashItem(id: string, amount: number): EstateItem {
  return { id, category: "cash", name: `현금${id}`, marketValue: amount };
}

describe("donor 그룹 분리 — 다른 그룹 priorGifts 무시", () => {
  // 시나리오: 현재 조모 → 손자 / prior 1=부 (그룹 A 무시) / prior 2=조부 (그룹 B 합산)
  const prior: PriorGift[] = [
    {
      giftDate: "2018-05-10",
      isHeir: false,
      giftAmount: 350_000_000,
      giftTaxPaid: 0,
      donor: "father", // 그룹 A — §47 합산 제외
      computedTax: 50_000_000,
      giftTaxBase: 300_000_000,
    },
    {
      giftDate: "2020-05-10",
      isHeir: false,
      giftAmount: 300_000_000,
      giftTaxPaid: 50_440_000,
      donor: "grandparent", // 그룹 B — 합산
      computedTax: 40_000_000,
      giftTaxBase: 250_000_000,
      additionalGenerationSkipSurcharge: 12_000_000,
      wasGenerationSkip: true,
    },
  ];
  const input: GiftTaxInput = {
    giftDate: "2023-05-02",
    donorRelation: "lineal_descendant",
    donor: "grandparent",
    giftItems: [cashItem("dg-1", 1_000_000_000)],
    priorGiftsWithin10Years: prior,
    isGenerationSkip: true,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: true },
  };
  const result = calcGiftTax(input);

  it("aggregatedGiftValue — 그룹 A(부) 350M 제외, 조부 300M만 합산 = 1,300,000,000", () => {
    expect(result.aggregatedGiftValue).toBe(1_300_000_000);
  });

  it("warnings — 다른 그룹 priorGifts 무시 안내", () => {
    expect(
      result.warnings.some((w) =>
        /증여자=father.*별개 신고/.test(w),
      ),
    ).toBe(true);
  });

  it("priorGiftCreditDetail.priorComputedTax = 조부 ⑦ = 40,000,000 (그룹 B 가장 최근 회차)", () => {
    expect(result.priorGiftCreditDetail?.priorComputedTax).toBe(40_000_000);
  });

  it("finalTax — 부 무시 후 산정값 — taxBase 1.25B, 결정세액 > 0", () => {
    // ⑤ = 1,000M + 300M − 50M = 1,250M
    expect(result.taxBase).toBe(1_250_000_000);
    expect(result.finalTax).toBeGreaterThan(0);
  });
});
