/**
 * Anchor — G-7 별지10호 합산배제·2스트림 병존 서식 정합 (H-45·H-46·H-47)
 *
 * 원칙: 별지10호서식은 일반 스트림(§55①4호) 서식이다. 합산배제(§55①1·2·3호)·조특법 특례(2스트림)
 *       세액은 별도 카드(aggregationExcludedDetail·specialStreamTax)로 표시하고, 별지 행은 일반분만 담아
 *       서식 산식(㉚=㉔−공제, ㊺=㉞−세액공제)의 자기정합을 유지한다.
 *
 * H-45: 합산배제 병존 시 별지10호 ㉓ 증여재산가산액이 0 붕괴(combined grossGiftValue가 netCurrent 팽창).
 * H-46: 합산배제 병존 시 ㉚과세표준·㉜산출세액이 §55①3호+4호 combined로 표시(서식 산식 붕괴).
 * H-47: 2스트림 별지10호 ㊺ 자진납부가 combined(특례+일반) → filingFormRows ⑫(일반)와 불일치.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  FilingFormRow,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const amt = (rows: FilingFormRow[], n: string) => rows.find((x) => x.number === n)?.amount ?? null;

function item(id: string, m: number, aggExcl?: boolean): EstateItem {
  return { id, category: "other", name: id, marketValue: m, ...(aggExcl ? { isAggregationExcludedGift: true } : {}) };
}

// 일반 500M + 합산배제(3호) 650M + 사전증여 200M
const mainMixed: GiftTaxInput = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_descendant",
  donor: "father",
  giftItems: [item("normal", 500_000_000), item("aggexcl", 650_000_000, true)],
  priorGiftsWithin10Years: [
    { giftDate: "2022-01-01", isHeir: false, giftAmount: 200_000_000, giftTaxPaid: 0, donor: "father" } as never,
  ],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" },
  creditInput: { isFiledOnTime: false },
};

describe("H-45·H-46 — 메인경로 합산배제+사전증여 병존 별지10호", () => {
  const r = calcGiftTax(mainMixed);
  const rows = r.besshi10Rows;

  it("[H45] ㉓ 증여재산가산액 = 사전증여 200M (combined gross로 0 붕괴 금지)", () => {
    expect(amt(rows, "㉓")).toBe(200_000_000);
  });

  it("[H46] ⑰·㉚·㉜는 일반분 (combined 아님)", () => {
    expect(amt(rows, "⑰")).toBe(500_000_000); // 일반 증여재산가액 (combined 1150M 아님)
    expect(amt(rows, "㉔")).toBe(700_000_000); // 일반 500M − 0 + 사전증여 200M
    expect(amt(rows, "㉚")).toBe(650_000_000); // ㉔ − §53 5천만 (combined 1270M 아님)
    expect(amt(rows, "㉜")).toBe(135_000_000); // 650M×30% − 6천만
  });

  it("[H46-self] ㉚ 과세표준 = ㉔ − (㉕+㉖+㉗+㉘+㉙) 서식 산식 자기정합", () => {
    const lhs = amt(rows, "㉚")!;
    const rhs =
      amt(rows, "㉔")! -
      (amt(rows, "㉕")! + amt(rows, "㉖")! + amt(rows, "㉗")! + amt(rows, "㉘")! + amt(rows, "㉙")!);
    expect(lhs).toBe(rhs);
  });

  it("[detail] 합산배제분은 result.aggregationExcludedDetail 별도 유지 + result.finalTax는 combined", () => {
    expect(r.aggregationExcludedDetail?.taxBase).toBe(620_000_000); // 650M − 3천만
    // result.finalTax = 일반 135M + 합산배제 126M = 261M (총 납부세액)
    expect(r.finalTax).toBe(261_000_000);
  });
});

describe("H-46 회귀 가드 — 합산배제 없으면 별지10호 combined==일반 (현행 보존)", () => {
  it("[H46-OFF] 일반 단독 → ⑰ = 전체 증여재산가액", () => {
    const r = calcGiftTax({ ...mainMixed, giftItems: [item("normal", 500_000_000)], priorGiftsWithin10Years: [] });
    expect(amt(r.besshi10Rows, "⑰")).toBe(500_000_000);
    expect(amt(r.besshi10Rows, "㉚")).toBe(450_000_000); // 500M − §53 5천만
  });
});

// 2스트림: 특례 30억 + 일반 5억
const twoStream: GiftTaxInput = {
  giftDate: "2025-01-15",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [
    { id: "s", category: "financial", name: "s", marketValue: 3_000_000_000, isSpecialTreatmentAsset: true },
    { id: "l", category: "financial", name: "l", marketValue: 500_000_000, isSpecialTreatmentAsset: false },
  ],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
  creditInput: { isFiledOnTime: true, specialTreatment: "startup", startupInvestmentCompleted: true },
};

describe("H-47 — 2스트림 별지10호 ㊺ = 일반분 (filingFormRows ⑫ 정합)", () => {
  const r = calcGiftTax(twoStream);

  it("[H47] besshi10 ㊺ 자진납부 = ordinaryStreamTax 77,600,000 (combined 327.6M 아님)", () => {
    expect(amt(r.besshi10Rows, "㊺")).toBe(77_600_000);
    expect(amt(r.besshi10Rows, "㊺")).toBe(r.ordinaryStreamTax);
  });

  it("[H47-consistency] besshi10 ㊺ == filingFormRows 차가감자진납부세액", () => {
    const ff = r.filingFormRows.find((x) => x.label === "차가감자진납부세액")?.amount;
    expect(amt(r.besshi10Rows, "㊺")).toBe(ff);
  });

  it("[H47-detail] result.finalTax는 combined 327.6M · specialStreamTax 별도 유지", () => {
    expect(r.finalTax).toBe(327_600_000);
    expect(r.specialStreamTax).toBe(250_000_000);
  });
});
