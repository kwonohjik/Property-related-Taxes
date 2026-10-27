/**
 * anchor — 이월과세 × 당초 증여 때 인수한 채무 부분(매입분): 집계 파생 단위(꼬리 카드) · 시나리오 A′ 조각 계산 — 엔진 레벨.
 * 설계서 `docs/02-design/features/carryover-gift-debt-purchased-part.engine.design.md` §2·§3·§7(A-0~A-15·A-19).
 *
 * 기준 사례: 주택 · 다주택 · 비조정 · 양도 2026-03-01 15억 · 증여 2023-06-01 평가 10억 · 채무 4억(r = 0.4) · 증여자 2000-06-01 취득 1억 · mock 세율.
 * 수정 前: 집계가 `carryoverTaxation.giftAssumedDebt`를 읽지 않아 자산 전체를 증여자 기준으로 계산했다(374,610,000).
 * 값은 손계산으로 확인한 것이다(설계서 §7 검증 열).
 */
import { describe, it, expect } from "vitest";
import { makeMockRates } from "../_helpers/mock-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";

const rates = makeMockRates();

const BASE = {
  propertyType: "housing", transferPrice: 1_500_000_000, transferDate: "2026-03-01", acquisitionPrice: 0, acquisitionDate: "2023-06-01",
  expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0, acquisitionCause: "carryover_gift",
};
const CT = {
  giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: 100_000_000, useEstimatedAcquisition: false,
  giftTaxAmount: 0, giftDateValuation: 1_000_000_000, donorRelation: "lineal",
};

/** 화면 경로 본문과 같은 모양을 ⑫로 거른 뒤 ⑭ 변환 — 채무 키는 엔진 입력에 직접 얹는다(⑫ 수락은 route anchor가 본다). */
function card(over: Record<string, unknown> = {}, ct: Record<string, unknown> = {}, debt: number | null = 400_000_000, id = "primary"): TransferTaxItemInput {
  const parsed = propertySchema.parse({ ...BASE, ...over, carryoverTaxation: { ...CT, ...ct } });
  const e = buildTransferEngineInput(parsed as never, new Date(parsed.transferDate), new Date(parsed.acquisitionDate), undefined);
  return {
    ...e, propertyId: id, propertyLabel: id, filingPenaltyDetails: undefined, delayedPaymentDetails: undefined,
    carryoverTaxation: { ...e.carryoverTaxation!, ...(debt === null ? {} : { giftAssumedDebt: debt }) },
  } as TransferTaxItemInput;
}
const agg = (props: TransferTaxItemInput[]): AggregateTransferResult => calculateTransferTaxAggregate({ taxYear: 2026, properties: props, annualBasicDeductionUsed: 0 }, rates);
const rowOf = (r: AggregateTransferResult, id: string) => r.properties.find((p) => p.propertyId === id)!;
const split = (r: AggregateTransferResult, id = "primary") => rowOf(r, id).carryoverTaxationDetail?.scenarioA.purchasedPartSplit;

describe("A-0 · 회귀 — 채무 없음", () => {
  it("채무 키 없음 · 0 → 현행 A 374,610,000 · 조각 없음", () => {
    for (const d of [null, 0]) {
      const r = agg([card({}, {}, d)]);
      expect(r.determinedTax).toBe(374_610_000);
      expect(r.properties).toHaveLength(1);
      expect(split(r)).toBeUndefined();
    }
  });
});

describe("A-1 · 기본 — 매입분 장기 보유", () => {
  const r = agg([card()]);
  it("A′ 293,970,000 · 채택 A · 비교값 A′/B", () => {
    expect(r.determinedTax).toBe(293_970_000);
    const d = rowOf(r, "primary").carryoverTaxationDetail!;
    expect(d.adoptedScenario).toBe("A");
    expect(d.filingUnitComparison).toEqual({ determinedTaxWithCarryover: 293_970_000, determinedTaxWithout: 173_060_000 });
  });
  it("조각 카드: 증여분 9억/6천만/8.4억(42%) · 매입분 꼬리 6억/4억/2억(38%)", () => {
    expect(r.properties.map((p) => p.propertyId)).toEqual(["primary", "primary__purchased"]);
    const g = rowOf(r, "primary"), p = rowOf(r, "primary__purchased");
    expect([g.transferPrice, g.acquisitionPrice, g.transferGain, g.appliedRate]).toEqual([900_000_000, 60_000_000, 840_000_000, 0.42]);
    expect([p.transferPrice, p.acquisitionPrice, p.transferGain, p.appliedRate]).toEqual([600_000_000, 400_000_000, 200_000_000, 0.38]);
    expect(g.longTermHoldingDeduction).toBe(252_000_000);
  });
  it("echo purchasedPartSplit — 불변식", () => {
    const s = split(r)!;
    expect(s).toMatchObject({ debtAmount: 400_000_000, giftValuation: 1_000_000_000, transferPrice: 1_500_000_000, donorAcquisitionPrice: 100_000_000, determinedTaxA: 293_970_000, determinedTaxB: 173_060_000 });
    expect(s.gift).toMatchObject({ propertyId: "primary", transferPrice: 900_000_000, acquisitionPrice: 60_000_000, acquisitionDate: "2000-06-01", transferGain: 840_000_000, appliedRate: 0.42 });
    expect(s.purchased).toMatchObject({ propertyId: "primary__purchased", transferPrice: 600_000_000, acquisitionPrice: 400_000_000, acquisitionDate: "2023-06-01", transferGain: 200_000_000, appliedRate: 0.38 });
    expect(s.gift!.transferPrice + s.purchased.transferPrice).toBe(s.transferPrice);
    expect(s.purchased.holdingPeriodYears).toBe(2);
    // B 열은 자산 전체 B(증여 당시 평가액 10억 · 차익 5억)다 — 증여분 카드 내부의 조각 크기 B가 아니다
    expect(rowOf(r, "primary").carryoverTaxationDetail!.scenarioB).toMatchObject({ acquisitionPrice: 1_000_000_000, transferGain: 500_000_000 });
    expect(s.gift!.holdingPeriodYears).toBe(25);
  });
});

describe("A-2 · 매입분 단기(증여 2025-06-01)", () => {
  it("349,270,000 — 증여분 42% · 매입분 70%", () => {
    const r = agg([card({ acquisitionDate: "2025-06-01" }, { giftRegistryDate: "2025-06-01" })]);
    expect(r.determinedTax).toBe(349_270_000);
    expect(rowOf(r, "primary__purchased").appliedRate).toBe(0.7);
    expect(split(r)!.purchased).toMatchObject({ acquisitionDate: "2025-06-01", holdingPeriodYears: 0, appliedRate: 0.7 });
  });
});

describe("A-3 · B 채택", () => {
  it("증여자 취득가액 14억 → A′ 71,070,000 < B → 결정 173,060,000 · 조각 카드 없음 · echo는 있다(반사실)", () => {
    const r = agg([card({}, { donorAcquisitionPrice: 1_400_000_000 })]);
    expect(r.determinedTax).toBe(173_060_000);
    expect(r.properties).toHaveLength(1);
    const d = rowOf(r, "primary").carryoverTaxationDetail!;
    expect(d.adoptedScenario).toBe("B");
    expect(d.filingUnitComparison).toEqual({ determinedTaxWithCarryover: 71_070_000, determinedTaxWithout: 173_060_000 });
    const s = d.scenarioA.purchasedPartSplit!;
    expect(s.determinedTaxA).toBe(71_070_000);
    expect(s.gift).toMatchObject({ transferPrice: 900_000_000, acquisitionPrice: 840_000_000, transferGain: 60_000_000 });
    expect(s.purchased).toMatchObject({ transferPrice: 600_000_000, transferGain: 200_000_000 });
  });
});

describe("A-4 · 증여세 상당액 · 증여자 capex · 본인 capex·양도비", () => {
  it("258,606,000 — 상당액·증여자 capex는 증여분 전액 · 본인 capex·양도비는 6:4", () => {
    const r = agg([card({ capitalExpenditure: 50_000_000, transferExpense: 10_000_000 }, { giftTaxAmount: 20_000_000, donorCapitalExpenditure: 30_000_000 })]);
    expect(r.determinedTax).toBe(258_606_000);
    expect(rowOf(r, "primary").transferGain).toBe(754_000_000);
    expect(rowOf(r, "primary__purchased").transferGain).toBe(176_000_000);
  });
});

describe("A-5 · 증여자 환산(일반 기준시가: 취득시 1억 · 양도시 5억)", () => {
  it("A′ 258,160,800 · 증여분 취득 180,000,000 · 차익 718,200,000(개산공제 1,800,000)", () => {
    const over = { useEstimatedAcquisition: true, standardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 500_000_000 };
    const r = agg([card(over, { useEstimatedAcquisition: true, donorAcquisitionPrice: undefined })]);
    expect(r.determinedTax).toBe(258_160_800);
    expect(rowOf(r, "primary").acquisitionPrice).toBe(180_000_000);
    expect(rowOf(r, "primary").transferGain).toBe(718_200_000);
    expect(split(r)!.donorAcquisitionPrice).toBe(300_000_000);
  });
});

describe("A-6 · r = 1 (채무 = 평가액)", () => {
  it("증여분 없음 · 매입분 한 장이 원 카드 id · 결정 173,060,000(= B, 동률은 A)", () => {
    const r = agg([card({}, {}, 1_000_000_000)]);
    expect(r.determinedTax).toBe(173_060_000);
    expect(r.properties.map((p) => p.propertyId)).toEqual(["primary"]);
    const s = split(r)!;
    expect(s.gift).toBeUndefined();
    expect(s.purchased).toMatchObject({ propertyId: "primary", transferPrice: 1_500_000_000, acquisitionPrice: 1_000_000_000, transferGain: 500_000_000 });
    expect(rowOf(r, "primary").carryoverTaxationDetail?.adoptedScenario).toBe("A");
  });
});

describe("A-7 · 정수 불변식 r = 1/3", () => {
  it("양도 1,500,000,001 · 채무 333,333,333 · 증여자 100,000,001 → 합이 원값 · A′ 307,410,000", () => {
    const r = agg([card({ transferPrice: 1_500_000_001 }, { donorAcquisitionPrice: 100_000_001 }, 333_333_333)]);
    const g = rowOf(r, "primary"), p = rowOf(r, "primary__purchased");
    expect([g.transferPrice, p.transferPrice]).toEqual([1_000_000_001, 500_000_000]);
    expect(g.transferPrice + p.transferPrice).toBe(1_500_000_001);
    expect([g.acquisitionPrice, p.acquisitionPrice]).toEqual([66_666_667, 333_333_333]);
    expect(r.determinedTax).toBe(307_410_000);
  });
});

describe("A-8 · 매입분 차손", () => {
  it("양도 12억 · 평가 15억 · 채무 6억 → 매입분 −1.2억 · §102② 통산 후 A′ 109,860,000 · B 0 → A 채택", () => {
    const r = agg([card({ transferPrice: 1_200_000_000 }, { giftDateValuation: 1_500_000_000 }, 600_000_000)]);
    expect(rowOf(r, "primary__purchased").transferGain).toBe(-120_000_000);
    expect(r.determinedTax).toBe(109_860_000);
    expect(rowOf(r, "primary").carryoverTaxationDetail?.adoptedScenario).toBe("A");
  });
});

describe("A-9 · 1세대1주택 15억 — §97의2②2호는 집 전체로 판정한다", () => {
  const house = { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 36 };
  const sameHh = { donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: "2000-06-01" };
  it("A도 B도 고가주택 1세대1주택 → ②2호 불발 · ②3호 비교 · A′ 25,909,000(채택 A) vs B 18,685,000", () => {
    const r = agg([card(house, sameHh)]);
    const d = rowOf(r, "primary").carryoverTaxationDetail!;
    expect(d.isEligible).toBe(true);
    expect(d.exclusionReason).toBeUndefined();
    expect(d.adoptedScenario).toBe("A");
    expect(d.filingUnitComparison).toEqual({ determinedTaxWithCarryover: 25_909_000, determinedTaxWithout: 18_685_000 });
    expect(r.determinedTax).toBe(25_909_000);
    expect(rowOf(r, "primary").carryoverTaxationDetail?.scenarioA.purchasedPartSplit).toBeDefined();
    // 조각마다 따로 비과세 판정하지 않는다 — 두 조각 모두 같은 12억 초과분 안분(물건 전체 15억 분모)을 받는다
    expect([rowOf(r, "primary").isExempt, rowOf(r, "primary__purchased").isExempt]).toEqual([false, false]);
  });
  it("세대 통산이 매입분에도 이어진다 — 10억 · 증여 9개월 · 계속 같은 세대(2000-06-01 보유 시작) → 두 조각 모두 비과세 · 결정 0 (매입분을 손조립하면 9개월 보유로 과세된다)", () => {
    const r = agg([card({ ...house, transferPrice: 1_000_000_000, acquisitionDate: "2025-06-01" }, { ...sameHh, giftRegistryDate: "2025-06-01" })]);
    expect(r.properties.map((p) => [p.propertyId, p.isExempt])).toEqual([["primary", true], ["primary__purchased", true]]);
    expect(r.determinedTax).toBe(0);
    expect(rowOf(r, "primary").carryoverTaxationDetail?.adoptedScenario).toBe("A");
  });
  it("A만 1세대1주택이 되는 조합(증여 9개월 · 세대 통산 아님) → 집 전체 ②2호로 배제 · B 채택 · 조각 없음 · 채무 키가 없는 같은 입력과 같은 세액", () => {
    const over = { ...house, transferPrice: 1_000_000_000, acquisitionDate: "2025-06-01" };
    const ct = { giftRegistryDate: "2025-06-01", donorSameHouseholdContinuous: false };
    const r = agg([card(over, ct)]);
    const d = rowOf(r, "primary").carryoverTaxationDetail!;
    expect(d.isEligible).toBe(false);
    expect(d.exclusionReason).toBe("one_house_exemption");
    expect(d.adoptedScenario).toBe("B");
    expect(r.properties).toHaveLength(1);
    expect(d.scenarioA.purchasedPartSplit).toBeUndefined();
    expect(r.determinedTax).toBe(agg([card(over, ct, null)]).determinedTax);
  });
});

describe("A-10~13 · 자산 종류 · 중과 · 미등기", () => {
  it("토지·상업용건물 단순 모드 — 기본과 같은 293,970,000", () => {
    for (const propertyType of ["land", "building"]) expect(agg([card({ propertyType })]).determinedTax).toBe(293_970_000);
  });
  it("비사업용 토지 플래그 — A′ 372,520,000 (증여분 52% · 매입분 48%)", () => {
    const r = agg([card({ propertyType: "land", isNonBusinessLand: true })]);
    expect(r.determinedTax).toBe(372_520_000);
    expect([rowOf(r, "primary").appliedRate, rowOf(r, "primary__purchased").appliedRate]).toEqual([0.52, 0.48]);
  });
  it("조정대상지역 다주택(양도 2026-06-01) — A′ 608,435,000", () => {
    expect(agg([card({ isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2026-06-01" })]).determinedTax).toBe(608_435_000);
  });
  it("미등기 — A′ 728,000,000 (조각 각 70%)", () => {
    expect(agg([card({ isUnregistered: true })]).determinedTax).toBe(728_000_000);
  });
});

describe("A-14·15 · index 대응 — 꼬리 덧붙임", () => {
  const land = (): TransferTaxItemInput => ({
    ...card({ propertyType: "land" }, {}, null, "land"), acquisitionCause: "purchase", carryoverTaxation: undefined,
    acquisitionPrice: 300_000_000, acquisitionDate: new Date("2015-01-01"), transferPrice: 800_000_000,
  } as TransferTaxItemInput);
  it("3카드(토지 · 채무 카드 · 채무 없는 이월과세 카드) — 원래 순서 유지 · 매입분은 맨 끝 · 비교값은 원 index", () => {
    const h2 = card({ transferPrice: 700_000_000 }, { giftDateValuation: 500_000_000, donorAcquisitionPrice: 50_000_000 }, null, "h2");
    const r = agg([land(), card({}, {}, 400_000_000, "h1"), h2]);
    expect(r.properties.map((p) => p.propertyId)).toEqual(["land", "h1", "h2", "h1__purchased"]);
    expect(rowOf(r, "h1").carryoverTaxationDetail?.filingUnitComparison).toBeDefined();
    expect(rowOf(r, "h2").carryoverTaxationDetail?.filingUnitComparison).toBeDefined();
    expect(rowOf(r, "h2").carryoverTaxationDetail?.scenarioA.purchasedPartSplit).toBeUndefined();
  });
  it("채무 카드 둘 — 매입분 둘이 순서대로 꼬리", () => {
    const h2 = card({ transferPrice: 700_000_000 }, { giftDateValuation: 500_000_000, donorAcquisitionPrice: 50_000_000 }, 200_000_000, "h2");
    const r = agg([card({}, {}, 400_000_000, "h1"), h2]);
    expect(r.properties.map((p) => p.propertyId)).toEqual(["h1", "h2", "h1__purchased", "h2__purchased"]);
  });
});

describe("주택부수토지 1세대1주택 단위(집이 두 카드면 단위가 서지 않는다)", () => {
  it("집 카드(oneHouseUnitRole:house)에 채무 + 부수토지 카드가 있으면 던진다 · 부수토지가 없으면 지원(매입분은 역할을 이어받지 않는다)", () => {
    const house = { ...card(), oneHouseUnitRole: "house" } as TransferTaxItemInput;
    const landCard = { ...card({ propertyType: "land" }, {}, null, "land"), oneHouseUnitRole: "appurtenant_land", acquisitionCause: "purchase", carryoverTaxation: undefined, acquisitionPrice: 100_000_000, acquisitionDate: new Date("2015-01-01"), transferPrice: 300_000_000 } as TransferTaxItemInput;
    expect(() => agg([house, landCard])).toThrow(/부수토지|1세대1주택 단위/);
    const r = agg([house]);
    expect(r.determinedTax).toBe(293_970_000);
    expect(r.properties.map((p) => p.propertyId)).toEqual(["primary", "primary__purchased"]);
  });
});

describe("A-19 · G1 — 집계를 우회한 직접 호출은 조용히 계산하지 않는다", () => {
  it("단건 엔진에 채무 카드를 직접 넣으면 INVALID_INPUT", () => {
    const c = card();
    const { propertyId: _a, propertyLabel: _b, ...input } = c as never as Record<string, unknown>;
    void _a; void _b;
    expect(() => calculateTransferTax({ ...input, annualBasicDeductionUsed: 0 } as never, rates)).toThrow(/채무/);
  });
});
