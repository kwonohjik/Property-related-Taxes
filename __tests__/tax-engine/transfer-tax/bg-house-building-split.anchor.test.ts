/**
 * anchor — 주택·건물 부담부증여 × 토지·건물 취득일 다름 → 토지·건물 파트별 §159 · 파트별 기산 (V-4 PR-A · 설계서 Q-1 a)
 *
 * 설계서 `docs/00-pm/bg-house-building-split.design.md` §5.1 · §5.4.
 * 「소득세법」 제95조 제4항 — 토지와 건물의 보유기간은 각각 그 자산의 취득일(이월과세면 당초 증여자가 해당 자산을 취득한 날)부터.
 * 「소득세법 시행령」 제159조 제1항 — 파트 양도가액 = 파트 평가액 A × 채무액 B / 증여가액 C(채무 비율 B/C는 두 파트에 같다).
 * 수정 前: 부담부증여 단계가 파트 값을 합쳐 한 카드로 계산했다 — 토지 취득일이 계산에 닿지 않는다(또는 BG-D가 막는다).
 * 화면·⑧·⑫ 차단(BG-D)은 PR-B에서 푼다 — 여기는 엔진 직접 호출이다. 기대값은 손계산(mock 세율 = 「소득세법」 제55조 현행 · 제95조 제2항 표1·표2).
 *
 * 공통 셀: 시가 10억(토지 기준시가 3억 : 건물 2억 → 평가액 토지 6억 · 건물 4억) · 채무 4억(B/C = 0.4) · 양도 2026-03-01.
 *   파트 양도가액: 토지 6억 × 0.4 = 240,000,000 · 건물 4억 × 0.4 = 160,000,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const TRANSFER = new Date("2026-03-01");
const LAND_2000 = new Date("2000-06-01");
const BLD_2022 = new Date("2022-01-10");

/** 본인 취득 K-4(실지) — 파트별 실지취득가액 토지 1억 · 건물 1.5억(채무 비율로 줄이면 4천만 · 6천만). */
function info(over: Partial<BurdenedGiftInfo> = {}, scale = 1): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: 1_000_000_000,
    lendingDepositTotal: 0,
    mortgageDebtAmount: Math.floor(400_000_000 * scale),
    annualRentTotal: 0,
    landStdPriceAtTransfer: 300_000_000,
    buildingStdPriceAtTransfer: 200_000_000,
    landStdPriceAtAcquisition: 100_000_000,
    buildingStdPriceAtAcquisition: 150_000_000,
    acquisitionMethod: "actual",
    actualLandAcquisitionPrice: 100_000_000,
    actualBuildingAcquisitionPrice: 150_000_000,
    ...over,
  } as BurdenedGiftInfo;
}

function input(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferType: "burdened_gift",
    transferDate: TRANSFER,
    transferPrice: 0,
    acquisitionPrice: 0,
    acquisitionDate: BLD_2022,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    burdenedGiftInfo: info(),
    ...over,
  } as Partial<TransferTaxInput>);
}
const run = (over: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(over), rates);
const split = (r: ReturnType<typeof run>) => r.splitDetail;

describe("S1 — 토지·건물 같은 날이면 종전 경로 그대로(회귀 0)", () => {
  /**
   * 양도차익 = (240,000,000 + 160,000,000) − (40,000,000 + 60,000,000) = 300,000,000 · 보유 4년 표1 8% → 24,000,000.
   * 276,000,000 − 2,500,000 = 273,500,000 × 38% − 19,940,000 = 83,990,000.
   */
  it("주택 · 토지 취득일 = 건물 취득일 → 83,990,000 · 분리 상세 없음", () => {
    const r = run({ landAcquisitionDate: BLD_2022 });
    expect(r.determinedTax).toBe(83_990_000);
    expect(split(r)).toBeUndefined();
  });
});

describe("S2·S3 — 본인 취득 · 토지 2000 · 건물 2022 → 파트별 §159 · 파트별 기산", () => {
  /**
   * 토지: 240,000,000 − 40,000,000 = 200,000,000 · 보유 25년 표1 30% → 60,000,000.
   * 건물: 160,000,000 − 60,000,000 = 100,000,000 · 보유 4년 표1 8% → 8,000,000.
   * 232,000,000 − 2,500,000 = 229,500,000 × 38% − 19,940,000 = 67,270,000. (한 날짜(2022)로 세던 S1보다 −16,720,000)
   */
  it("S2 주택 → 67,270,000 · 파트 양도가액·취득가액·보유연수", () => {
    const r = run({ landAcquisitionDate: LAND_2000 });
    expect(r.determinedTax).toBe(67_270_000);
    const s = split(r)!;
    expect([s.land.transferPrice, s.land.acquisitionPrice, s.land.gain, s.land.holdingYears]).toEqual([240_000_000, 40_000_000, 200_000_000, 25]);
    expect([s.building.transferPrice, s.building.acquisitionPrice, s.building.gain, s.building.holdingYears]).toEqual([160_000_000, 60_000_000, 100_000_000, 4]);
    expect([s.land.longTermDeduction, s.building.longTermDeduction]).toEqual([60_000_000, 8_000_000]);
  });

  it("S3 건물(토지 제외) → 같은 축(표1) 67,270,000", () => {
    const r = run({ propertyType: "building", landAcquisitionDate: LAND_2000 });
    expect(r.determinedTax).toBe(67_270_000);
    expect(split(r)?.land.holdingYears).toBe(25);
  });

  it("K-1~K-3(기준시가 평가) — 파트 취득가액 = 파트 취득시 기준시가 × 채무 비율 · 개산공제 파트별", () => {
    /**
     * 기준시가 평가: C = 기준시가 합 5억 · B/C = 4억/5억 = 0.8 → 양도가액 토지 2.4억 · 건물 1.6억.
     * 취득가액 토지 1억 × 0.8 = 80,000,000 · 건물 1.5억 × 0.8 = 120,000,000.
     * 개산공제 3%: 토지 2,400,000 · 건물 3,600,000.
     * 토지 240,000,000 − 80,000,000 − 2,400,000 = 157,600,000 × 30% = 47,280,000.
     * 건물 160,000,000 − 120,000,000 − 3,600,000 = 36,400,000 × 8% = 2,912,000.
     * 194,000,000 − 50,192,000 = 143,808,000 − 2,500,000 = 141,308,000 × 35% − 15,440,000 = 34,017,800.
     */
    const r = run({
      landAcquisitionDate: LAND_2000,
      burdenedGiftInfo: info({ valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined, actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined }),
    });
    const s = split(r)!;
    expect([s.land.transferPrice, s.land.acquisitionPrice, s.land.appraisalDeduction]).toEqual([240_000_000, 80_000_000, 2_400_000]);
    expect([s.building.transferPrice, s.building.acquisitionPrice, s.building.appraisalDeduction]).toEqual([160_000_000, 120_000_000, 3_600_000]);
    expect(r.determinedTax).toBe(34_017_800);
  });

  it("K-4 파트 실지취득가액이 총액뿐이면 던진다 — 다른 날 따로 취득했으니 기준시가로 나누지 않는다(자동 안분 금지)", () => {
    expect(() =>
      run({ landAcquisitionDate: LAND_2000, burdenedGiftInfo: info({ actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined, actualAcquisitionTotal: 250_000_000 }) }),
    ).toThrow(/토지·건물 실지취득가액을 따로/);
  });
});

describe("S4 — 이월과세 · 당초 증여자 토지 2000 · 건물 2015 → A 파트별 기산 · B 증여일", () => {
  /**
   * 증여 2023-06-01 · 당초 증여자 실지 토지 5천만 · 건물 1억 · 양도인(B) = 증여일 평가액 토지 6억 · 건물 4억.
   * A: 토지 240,000,000 − 20,000,000 = 220,000,000 × 30%(25년) = 66,000,000
   *    건물 160,000,000 − 40,000,000 = 120,000,000 × 22%(2015-01-01 → 11년) = 26,400,000
   *    340,000,000 − 92,400,000 = 247,600,000 − 2,500,000 = 245,100,000 × 38% − 19,940,000 = 73,198,000.
   * B: 취득가액 = 양도가액(240,000,000 · 160,000,000) → 양도차익 0 → 0. A ≥ B → A 채택.
   * (토글을 무시하고 둘 다 2000부터 세면 69,550,000 — 건물 기산이 법문과 다르다.)
   */
  const carry = (bDate: Date) => ({
    acquisitionCause: "carryover_gift",
    acquisitionDate: new Date("2023-06-01"),
    carryoverTaxation: {
      giftRegistryDate: new Date("2023-06-01"),
      donorAcquisitionDate: LAND_2000,
      donorAcquisitionPrice: 150_000_000,
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: 1_000_000_000,
      donorRelation: "lineal",
    },
    burdenedGiftInfo: info({
      actualLandAcquisitionPrice: 600_000_000,
      actualBuildingAcquisitionPrice: 400_000_000,
      carryoverDonorBasis: { actualLandAcquisitionPrice: 50_000_000, actualBuildingAcquisitionPrice: 100_000_000, buildingDonorAcquisitionDate: bDate },
    }),
  }) as unknown as Partial<TransferTaxInput>;

  it("A 73,198,000 채택 · A 파트 기산 토지 25년 · 건물 11년", () => {
    const r = run(carry(new Date("2015-01-01")));
    const d = r.carryoverTaxationDetail!;
    expect([d.adoptedScenario, d.scenarioA.determinedTax, d.scenarioB.determinedTax]).toEqual(["A", 73_198_000, 0]);
    expect(r.determinedTax).toBe(73_198_000);
    expect([split(r)?.land.holdingYears, split(r)?.building.holdingYears]).toEqual([25, 11]);
  });

  it("S4b 증여세 상당액 5천만 → 파트 양도가액 비율로 나눠 실비 칸에 — 67,634,800", () => {
    /**
     * 5천만 × 0.4 = 20,000,000 → 토지 240/400 = 12,000,000 · 건물 8,000,000(영 §163의2② — 파트 평가액 칸이 없으면 양도가액 비율).
     * 토지 220,000,000 − 12,000,000 = 208,000,000 × 30% = 62,400,000 · 건물 120,000,000 − 8,000,000 = 112,000,000 × 22% = 24,640,000.
     * 320,000,000 − 87,040,000 = 232,960,000 − 2,500,000 = 230,460,000 × 38% − 19,940,000 = 67,634,800.
     */
    const base = carry(new Date("2015-01-01")) as unknown as { carryoverTaxation: Record<string, unknown> };
    const r = run({ ...base, carryoverTaxation: { ...base.carryoverTaxation, giftTaxAmount: 50_000_000 } } as unknown as Partial<TransferTaxInput>);
    expect([split(r)?.land.directExpenses, split(r)?.building.directExpenses]).toEqual([12_000_000, 8_000_000]);
    expect(r.determinedTax).toBe(67_634_800);
  });

  it("S4c 기준시가 평가(개산공제) + 증여세 상당액 — 개산공제와 증여세 상당액을 칸별로 가른다", () => {
    /**
     * 기준시가 평가: C = 5억 · B/C = 0.8. 당초 증여자 취득시 기준시가 토지 5천만 · 건물 8천만 → 개산공제 토지 50,000,000 × 0.8 × 3% = 1,200,000 · 건물 1,920,000.
     * 증여세 상당액 5천만 × 0.8 = 40,000,000 → 토지 240/400 = 24,000,000 · 건물 16,000,000 — 실비 칸(결과 항등식 규약).
     */
    const base = carry(new Date("2015-01-01")) as unknown as { carryoverTaxation: Record<string, unknown> };
    const r = run({
      ...base,
      carryoverTaxation: { ...base.carryoverTaxation, giftTaxAmount: 50_000_000 },
      burdenedGiftInfo: info({
        valuationMode: "sangjeungbeop_standard", marketValueAtTransfer: undefined, acquisitionMethod: undefined,
        actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined,
        // 양도인(B) 취득시 기준시가 = 증여일 무렵 값(양도시와 비슷) → B 양도차익이 작아 A가 채택된다
        landStdPriceAtAcquisition: 290_000_000, buildingStdPriceAtAcquisition: 190_000_000,
        carryoverDonorBasis: { landStdPriceAtAcquisition: 50_000_000, buildingStdPriceAtAcquisition: 80_000_000, buildingDonorAcquisitionDate: new Date("2015-01-01") },
      }),
    } as unknown as Partial<TransferTaxInput>);
    expect(r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    const sd = split(r)!;
    expect([sd.land.directExpenses, sd.land.appraisalDeduction, sd.building.directExpenses, sd.building.appraisalDeduction]).toEqual([24_000_000, 1_200_000, 16_000_000, 1_920_000]);
  });

  it("회귀 — 건물 날짜가 토지와 같으면 분리하지 않는다(종전 69,550,000)", () => {
    const r = run(carry(LAND_2000));
    expect(r.determinedTax).toBe(69_550_000);
    expect(split(r)).toBeUndefined();
  });
});

describe("S5 — 1세대1주택 · 고가주택 · 토지 2000 · 건물 2022 → 표2 파트별 · 12억 파트 양도가액 비율 안분(영 §160① 후단)", () => {
  /**
   * 시가 20억(토지 12억 · 건물 8억) · 채무 8억(B/C 0.4) → 양도가액 토지 480,000,000 · 건물 320,000,000.
   * 실지 토지 2억 · 건물 3억 → 80,000,000 · 120,000,000. 양도차익 토지 400,000,000 · 건물 200,000,000.
   * 고가 안분(분모 C = 20억): 과세 양도차익 = 양도차익 × (20억 − 12억) / 20억 → 토지 160,000,000 · 건물 80,000,000.
   * 장특: 건물 표2 = 보유 4년 16% + 거주 4년 16% = 32% → 25,600,000.
   *   토지(부수토지)는 기본통칙 95-0…1 — max(표1 토지 자신 25년 30%, 표2 「주택 부수토지로서의 보유기간」 = 주택 4년 16% + 거주 16% = 32%) = 32% → 51,200,000
   *   (기존 leaf `resolveAppurtenantLandLthdRate` — 일반 양도 분리와 같다).
   * 240,000,000 − 76,800,000 = 163,200,000 − 2,500,000 = 160,700,000 × 38% − 19,940,000 = 41,126,000.
   */
  it("41,126,000 · 파트 과세 양도차익·장특", () => {
    const r = run({
      landAcquisitionDate: LAND_2000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 48,
      burdenedGiftInfo: info({
        marketValueAtTransfer: 2_000_000_000,
        mortgageDebtAmount: 800_000_000,
        actualLandAcquisitionPrice: 200_000_000,
        actualBuildingAcquisitionPrice: 300_000_000,
      }),
    });
    const s = split(r)!;
    expect([s.land.taxableGainAfterProration, s.building.taxableGainAfterProration]).toEqual([160_000_000, 80_000_000]);
    expect([s.land.longTermRate, s.building.longTermRate]).toEqual([0.32, 0.32]);
    expect(r.determinedTax).toBe(41_126_000);
  });
});

describe("S6 — 지분 50/50(축 B 카드 2장) → 합계 = 단건 S2 67,270,000", () => {
  it("지분마다 같은 파트 계산 · 신고 합계는 단건과 같다", () => {
    const card = (id: string) => ({
      propertyId: id,
      propertyLabel: id,
      ...input({ landAcquisitionDate: LAND_2000, ownershipRatio: 0.5, burdenedGiftInfo: info({}, 0.5) }),
    });
    const agg = calculateTransferTaxAggregate({ properties: [card("a"), card("b")], taxYear: 2026, annualBasicDeductionUsed: 0 } as never, rates);
    expect(agg.determinedTax).toBe(67_270_000);
  });
});
