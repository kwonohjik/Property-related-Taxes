/**
 * Anchor — §41의3 합산배제증여재산 본세 특례 (Phase A1)
 *
 * 법령(법제처 검증): §47①(합산배제증여재산에 §41의3·§41의5 포함)·§47② 단서(10년 합산 격리)·
 *   §55①3호(과세표준 = 증여재산가액 − 3천만원, §53·§54 미적용)·§56 일반세율.
 *
 * AE-1  : 합산배제재산 → 과세표준 = 650M − 3천만 = 620M (§53 미적용)
 * AE-OFF: 동일 재산 일반(플래그 false) → §53 직계 5천만 공제 → 600M (현행 동작 보존, 회귀 가드)
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function listingItem(excluded: boolean): EstateItem {
  return {
    id: "lg1",
    category: "other",
    name: "상장이익",
    marketValue: 650_000_000,
    isAggregationExcludedGift: excluded,
  };
}

function baseInput(excluded: boolean): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation: "lineal_descendant",
    donor: "father",
    giftItems: [listingItem(excluded)],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: false },
  };
}

describe("§41의3 합산배제증여재산 본세 (§47②격리·§55①3호·§53배제)", () => {
  it("[AE-1] 합산배제: 과세표준 = 650M − 3천만 = 620M (§53 미적용)", () => {
    const r = calcGiftTax(baseInput(true));
    expect(r.taxBase).toBe(620_000_000);
    expect(r.finalTax).toBe(126_000_000); // 620M×30% − 6천만(누진공제)
  });
  it("[AE-OFF] 일반재산(플래그 false): §53 5천만 공제 → 과세표준 600M (현행 보존)", () => {
    const r = calcGiftTax(baseInput(false));
    expect(r.taxBase).toBe(600_000_000);
    expect(r.finalTax).toBe(120_000_000); // 600M×30% − 6천만
  });
  // A1.5 — 별도 카드용 echo (별지 서식은 일반분, 합산배제분은 별도 표시)
  it("[AE-DETAIL] 합산배제: aggregationExcludedDetail echo", () => {
    const d = calcGiftTax(baseInput(true)).aggregationExcludedDetail;
    expect(d?.grossValue).toBe(650_000_000);
    expect(d?.taxBase).toBe(620_000_000);
    expect(d?.finalTax).toBe(126_000_000);
  });
  it("[AE-OFF-DETAIL] 일반재산은 aggregationExcludedDetail undefined", () => {
    expect(calcGiftTax(baseInput(false)).aggregationExcludedDetail).toBeUndefined();
  });
});
