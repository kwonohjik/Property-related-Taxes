import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 2-스트림(특례) 별지10호 차가감자진납부세액 자기정합 (리뷰 확정 #3 회귀).
 *
 * 별지 최하단 행(⑫/⑱)은 formula "⑦−⑩−⑪"(또는 "⑬−⑯−⑰")로 일반분 산식이므로,
 * 표시 금액도 일반 스트림 결정세액(ordinaryStreamTax)이어야 한다.
 * 버그: buildFilingFormRows에 combined finalTax(특례+일반)를 넘겨 특례세액만큼 어긋남.
 */
function makeEstateItem(id: string, amount: number, isSpecial?: boolean): EstateItem {
  return {
    id,
    category: "financial",
    name: `자산${id}`,
    marketValue: amount,
    isSpecialTreatmentAsset: isSpecial,
  } as EstateItem;
}

const inputA: GiftTaxInput = {
  giftDate: "2025-01-15",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [
    makeEstateItem("startup-30b", 3_000_000_000, true),
    makeEstateItem("land-5b", 500_000_000, false),
  ],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
  creditInput: {
    isFiledOnTime: true,
    specialTreatment: "startup",
    startupInvestmentCompleted: true,
  },
};

describe("2-스트림 별지 차가감자진납부세액 정합 (리뷰 #3)", () => {
  it("[TS-FILING-1] 별지 최하단 행 = 일반분 77,600,000 (combined 327,600,000 아님)", () => {
    const r = calcGiftTax(inputA);
    const row = r.filingFormRows.find((x) => x.label === "차가감자진납부세액");
    expect(row).toBeDefined();
    // 산식 ⑦−⑩−⑪ = 일반 스트림 결정세액. 특례세액 250,000,000 누출 금지.
    expect(row!.amount).toBe(77_600_000);
    expect(r.ordinaryStreamTax).toBe(77_600_000);
    expect(r.specialStreamTax).toBe(250_000_000);
    // 결과 필드 finalTax는 여전히 합산(총 납부세액)
    expect(r.finalTax).toBe(327_600_000);
  });
});

describe("2-스트림 별지 §69 신고세액공제율 연도 반영 (H-21 회귀)", () => {
  it("[TS-FILING-RATE] 2018 증여 → 신고세액공제 formula '× 5%' (buildFilingFormRows filingCreditRate 미전달 시 3% 고정 드리프트)", () => {
    const r = calcGiftTax({ ...inputA, giftDate: "2018-06-01" });
    const row = r.filingFormRows.find((x) => x.label === "신고세액공제");
    expect(row).toBeDefined();
    // 계산은 §69 증여연도율(2018=5%)을 적용하는데 서식 라벨이 3%로 고정되면 표시 드리프트.
    expect(row!.formula).toContain("5%");
    expect(row!.formula).not.toContain("3%");
  });
});
