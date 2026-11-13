/**
 * anchor — 부담부증여 × 토지·건물 소유자 분리(본인 소유분만 증여) → 증여한 파트만 §159 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` PR-2)
 *
 * 「소득세법 시행령」 제159조 제1항 — A(평가액)·C(증여가액)는 **증여한 자산**의 값이다. 건물만 소유해 건물만 증여했으면 건물분 값이다.
 * 엔진 입력 계약(Q-2 a): ④가 본인 몫만 싣는다 — 비소유 파트의 양도·취득시 기준시가는 0. 엔진은 자동으로 0으로 바꾸지 않고 던진다.
 * 화면·⑧·⑫는 아직 막혀 있다(#3272 · PR-3에서 범위 안을 연다) — 여기는 엔진 직접 호출이다.
 *
 * 공통: 건물(비주택) · 기준시가 평가 · 매매 2015-01-01 → 양도 2026-02-16(보유 11년 표1 22%) · 중과 없음 · mock 세율.
 * 기대값은 계획서 §9 손계산 = §9.1 오라클 실측(「소유자 같음」에 건물분 값을 넣은 route 결과).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const ACQ = new Date("2015-01-01");
const TRANSFER = new Date("2026-02-16");
/** 채무 1억 = 보증금 5천만 + 차입 5천만(설정 5천만). */
const DEBT_A = { lendingDepositTotal: 50_000_000, mortgageDebtAmount: 50_000_000, mortgageSetAmount: 50_000_000 };

function info(std: { landT: number; bldT: number; landA: number; bldA: number }, over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_standard",
    annualRentTotal: 0,
    ...DEBT_A,
    landStdPriceAtTransfer: std.landT,
    buildingStdPriceAtTransfer: std.bldT,
    landStdPriceAtAcquisition: std.landA,
    buildingStdPriceAtAcquisition: std.bldA,
    ownerSplitDebtConfirmed: true,
    ...over,
  } as BurdenedGiftInfo;
}

function input(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building",
    transferType: "burdened_gift",
    transferDate: TRANSFER,
    transferPrice: 0,
    acquisitionPrice: 0,
    acquisitionDate: ACQ,
    landAcquisitionDate: ACQ,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}
const run = (over: Partial<TransferTaxInput>) => calculateTransferTax(input(over), rates);
const bldgOnly = (std: { bldT: number; bldA: number }, over: Partial<BurdenedGiftInfo> = {}) =>
  run({ selfOwns: "building_only", burdenedGiftInfo: info({ landT: 0, bldT: std.bldT, landA: 0, bldA: std.bldA }, over) });

describe("A1 — 건물만 본인 · 건물분 양도 2억 · 취득 2.5억 (전체 값이면 4,039,500)", () => {
  /** 취득가액 2.5억 × 1억 ÷ 2억 = 1.25억 · 개산공제 375만 → 1억 − 1.25억 − 375만 = −28,750,000 → 0. */
  it("양도차익 −28,750,000 · 결정세액 0 · 분리 상세는 건물만", () => {
    const r = bldgOnly({ bldT: 200_000_000, bldA: 250_000_000 });
    expect(r.splitDetail?.selfOwns).toBe("building_only");
    expect(r.splitDetail?.building.transferPrice).toBe(100_000_000);
    expect(r.splitDetail?.building.acquisitionPrice).toBe(125_000_000);
    expect(r.splitDetail?.land.transferPrice).toBe(0);
    expect(r.transferGain).toBe(-28_750_000);
    expect(r.determinedTax).toBe(0);
  });
});

describe("A2 — 건물만 본인 · 양도 2억 · 취득 8천만 (양의 세액)", () => {
  /** 취득가액 8천만 × 0.5 = 4천만 · 개산공제 120만 → 58,800,000 · 장특 22% 12,936,000 · 과표 43,364,000 × 15% − 126만 = 5,244,600. */
  it("양도차익 58,800,000 · 장특 12,936,000 · 결정세액 5,244,600", () => {
    const r = bldgOnly({ bldT: 200_000_000, bldA: 80_000_000 });
    expect(r.transferGain).toBe(58_800_000);
    expect(r.longTermHoldingDeduction).toBe(12_936_000);
    expect(r.determinedTax).toBe(5_244_600);
  });
});

describe("A3 — §66 담보 승(채무가 증여한 건물분만 담보)", () => {
  /** 보충적 8천만 < 담보 1억 → C = 1억 · B/C = 1 → 양도가액 1억 · 취득가액 4천만 · 개산공제 120만 → A2와 같은 5,244,600. */
  it("C = 1억 · 결정세액 5,244,600", () => {
    const r = bldgOnly({ bldT: 80_000_000, bldA: 40_000_000 }, { lendingDepositTotal: 0, mortgageDebtAmount: 100_000_000, mortgageSetAmount: 100_000_000 });
    expect(r.splitDetail?.building.transferPrice).toBe(100_000_000);
    expect(r.transferGain).toBe(58_800_000);
    expect(r.determinedTax).toBe(5_244_600);
  });
});

describe("A4 — 초과부담부: 채무가 증여한 건물분 가액보다 크다", () => {
  /** C = max(8천만, 담보 2천만, 임대 6천만) = 8천만 < B 1.2억 → 던진다. 물건 전체 값(4억)이면 통과하던 입력이다. */
  it("[EXCESS_BURDENED_GIFT]", () => {
    expect(() =>
      bldgOnly({ bldT: 80_000_000, bldA: 40_000_000 }, { lendingDepositTotal: 60_000_000, mortgageDebtAmount: 60_000_000, mortgageSetAmount: 20_000_000 }),
    ).toThrow(/EXCESS_BURDENED_GIFT/);
  });
});

describe("L — 토지만 본인(토지만 증여)", () => {
  it("토지분 양도 2억 · 취득 8천만 → A2와 같은 5,244,600 · 분리 상세는 토지만", () => {
    const r = run({ selfOwns: "land_only", burdenedGiftInfo: info({ landT: 200_000_000, bldT: 0, landA: 80_000_000, bldA: 0 }) });
    expect(r.splitDetail?.selfOwns).toBe("land_only");
    expect(r.splitDetail?.land.transferPrice).toBe(100_000_000);
    expect(r.splitDetail?.building.transferPrice).toBe(0);
    expect(r.transferGain).toBe(58_800_000);
    expect(r.determinedTax).toBe(5_244_600);
  });
});

describe("C — 입력 계약: 비소유 파트 기준시가는 0이어야 한다(엔진이 0으로 바꾸지 않는다)", () => {
  // 픽스처는 채무 확인 true — 아래 단언은 각자의 계약 문구로 맞춘다(채무 확인 위반이 먼저 던져 «증여한 부분»만으로는 가려진다).
  it("건물만 본인인데 토지 기준시가가 있으면 던진다", () => {
    expect(() => run({ selfOwns: "building_only", burdenedGiftInfo: info({ landT: 800_000_000, bldT: 200_000_000, landA: 0, bldA: 250_000_000 }) })).toThrow(
      /토지는 본인 소유가 아니므로/,
    );
    expect(() => run({ selfOwns: "building_only", burdenedGiftInfo: info({ landT: 0, bldT: 200_000_000, landA: 250_000_000, bldA: 250_000_000 }) })).toThrow(
      /토지는 본인 소유가 아니므로/,
    );
  });
  it("토지만 본인인데 건물 기준시가가 있으면 던진다", () => {
    expect(() => run({ selfOwns: "land_only", burdenedGiftInfo: info({ landT: 200_000_000, bldT: 50_000_000, landA: 80_000_000, bldA: 0 }) })).toThrow(/건물은 본인 소유가 아니므로/);
  });
  it("소유 파트 양도시 기준시가가 0이면 던진다", () => {
    expect(() => run({ selfOwns: "building_only", burdenedGiftInfo: info({ landT: 0, bldT: 0, landA: 0, bldA: 250_000_000 }) })).toThrow(/양도시 건물 기준시가를 입력하세요/);
  });
});

describe("D — 입력 계약: 채무가 증여한 부분에만 관련된다는 확인(ownerSplitDebtConfirmed: true)", () => {
  const A2_STD = { landT: 0, bldT: 200_000_000, landA: 0, bldA: 80_000_000 };
  it("건물만 본인 · 확인 없음 → 던진다(공동저당 안분 칸이 없어 계산하지 않는다)", () => {
    expect(() => run({ selfOwns: "building_only", burdenedGiftInfo: info(A2_STD, { ownerSplitDebtConfirmed: undefined }) })).toThrow(/ownerSplitDebtConfirmed: true/);
  });
  it("토지만 본인 · 확인 false → 던진다 · 문구는 증여한 토지", () => {
    expect(() => run({ selfOwns: "land_only", burdenedGiftInfo: info({ landT: 200_000_000, bldT: 0, landA: 80_000_000, bldA: 0 }, { ownerSplitDebtConfirmed: false }) })).toThrow(
      /증여한 토지에만 관련된다는 확인/,
    );
  });
  it("소유자 같음(both)은 확인을 읽지 않는다 — 없어도 계산한다", () => {
    expect(() => run({ selfOwns: "both", burdenedGiftInfo: info({ landT: 0, bldT: 200_000_000, landA: 0, bldA: 80_000_000 }, { ownerSplitDebtConfirmed: undefined }) })).not.toThrow();
  });
});

describe("V-6 — 비소유 파트의 취득일은 세액에 닿지 않는다(보유연수·세율 기산은 증여한 파트)", () => {
  const A2 = { landT: 200_000_000, bldT: 0, landA: 80_000_000, bldA: 0 };
  it("건물만 본인 · 토지 취득일이 양도 8개월 전이어도 A2와 같은 5,244,600", () => {
    const r = run({ selfOwns: "building_only", landAcquisitionDate: new Date("2025-06-01"), burdenedGiftInfo: info({ landT: 0, bldT: 200_000_000, landA: 0, bldA: 80_000_000 }) });
    expect(r.splitDetail?.building.holdingYears).toBe(11);
    expect(r.determinedTax).toBe(5_244_600);
  });
  it("토지만 본인 · 건물 취득일(자산 취득일)이 양도 8개월 전이어도 토지 2015 기산으로 5,244,600", () => {
    const r = run({ selfOwns: "land_only", acquisitionDate: new Date("2025-06-01"), landAcquisitionDate: ACQ, burdenedGiftInfo: info(A2) });
    expect(r.splitDetail?.land.holdingYears).toBe(11);
    expect(r.longTermHoldingDeduction).toBe(12_936_000);
    expect(r.determinedTax).toBe(5_244_600);
  });
  it("토지 취득일을 보내지 않으면 자산 취득일로 센다(④ 후퇴와 같다) — 분리 상세는 남는다", () => {
    const r = run({ selfOwns: "land_only", landAcquisitionDate: undefined, burdenedGiftInfo: info(A2) });
    expect(r.splitDetail?.selfOwns).toBe("land_only");
    expect(r.determinedTax).toBe(5_244_600);
  });
});

describe("M — 시가 × 실지: 증여한 부분 양도시 기준시가를 쓰지 않는다 · 안분 잔액은 증여한 파트로 접는다(`foldOwnerSplitBreakdown`)", () => {
  /** 시가 2억 · 채무 1억 · 실지취득가액 8천만 → 양도가액 1억 − 취득가액 4천만 = 60,000,000 · 결정세액 5,385,000(기준시가를 넣은 같은 입력과 같다). */
  const mkt = (over: Partial<BurdenedGiftInfo> = {}) =>
    info({ landT: 0, bldT: 0, landA: 0, bldA: 0 }, { valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 200_000_000, acquisitionMethod: "actual", actualAcquisitionTotal: 80_000_000, ...over });
  it("건물만 · 양도·취득시 기준시가 모두 0 → 5,385,000 (계약 위반 아님)", () => {
    const r = run({ selfOwns: "building_only", burdenedGiftInfo: mkt() });
    expect(r.determinedTax).toBe(5_385_000);
    expect(r.splitDetail?.building).toMatchObject({ transferPrice: 100_000_000, acquisitionPrice: 40_000_000 });
  });
  it("토지만 · 기준시가 모두 0 → 5,385,000 · 양도가액·취득가액이 토지에 실린다(접기 전: 건물로 가 12,360,000)", () => {
    const r = run({ selfOwns: "land_only", burdenedGiftInfo: mkt() });
    expect(r.determinedTax).toBe(5_385_000);
    expect(r.splitDetail?.land).toMatchObject({ transferPrice: 100_000_000, acquisitionPrice: 40_000_000 });
    expect(r.splitDetail?.building).toMatchObject({ transferPrice: 0, acquisitionPrice: 0 });
    expect(r.transferBurdenedGiftBreakdown?.perAsset.land).toMatchObject({ sangjeungbeopValue: 200_000_000, transferPrice: 100_000_000, actualAcquisition: 80_000_000 });
    expect(r.transferBurdenedGiftBreakdown?.perAsset.building).toMatchObject({ sangjeungbeopValue: 0, transferPrice: 0, acquisitionPrice: 0 });
  });
  it("토지만 · 양도시 기준시가는 있고 취득시 기준시가만 0 → 5,385,000 (실지취득가액이 비소유 건물로 가던 결함)", () => {
    const r = run({ selfOwns: "land_only", burdenedGiftInfo: mkt({ landStdPriceAtTransfer: 200_000_000 }) });
    expect(r.determinedTax).toBe(5_385_000);
    expect(r.splitDetail?.land).toMatchObject({ acquisitionPrice: 40_000_000 });
  });
  it("시가 × 환산은 양도시 기준시가가 분모라 계속 요구한다 — 0이면 던진다", () => {
    expect(() => run({ selfOwns: "building_only", burdenedGiftInfo: mkt({ acquisitionMethod: "converted", actualAcquisitionTotal: undefined, buildingStdPriceAtAcquisition: 80_000_000 }) })).toThrow(
      /양도시 건물 기준시가를 입력하세요/,
    );
  });
});
