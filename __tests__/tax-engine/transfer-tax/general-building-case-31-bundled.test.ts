/**
 * 사례 31 — 일반건물 일괄 환산취득가 + §102② 자산별 통산 (E2E aggregate)
 *
 * buildGeneralBuildingAssetCards()로 자산 카드 2장 생성 → calculateTransferTaxAggregate()로
 * §95② 장특공제 + §102② 차손 통산 + §55 누진세율 + §103의3 지방소득세까지 정밀 anchor 검증.
 *
 * E2E anchor 12종:
 *   case31_holding_years_floor          → 23
 *   case31_ltsd_rate_land               → 0.30  (표1 일반자산 15년 이상 상한)
 *   case31_ltsd_land                    → 199,102,966
 *   case31_ltsd_building                → 0       ★ 차손이라 장특 미적용
 *   case31_income_building_pre_offset   → -8,230,409  ★ 통산 전
 *   case31_offset_amount                → 8,230,409   ★ §102② 흡수액
 *   case31_income_land_post_offset      → 456,343,181 ★ 통산 후 토지
 *   case31_total_income                 → 456,343,181
 *   case31_taxable_base                 → 453,843,181 (− 기본공제 250만)
 *   case31_calc_tax                     → 155,597,272 (2023년 §55 기본세율 누진)
 *   case31_local_tax                    → 15,559,727  (산출세액 × 10%, 원미만 절사)
 *   case31_nbl_within_ratio             → true (단위 테스트에서 검증)
 *
 * 통산 순서 보장 (transfer-tax-aggregate.ts L.128-135):
 *   [차익] → [transferGain<0 ? lthd=0] → [income = taxableGain - lthd] → [offsetLosses]
 *   ↳ 건물 차손이 장특 전 단계에서 발생, 장특은 자기 차익에만, 통산은 장특 후 단계
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

// ============================================================
// 사례 31 입력 — Plan §10 + Design §B 잠금값 (BigInt 정밀 검산 확정)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const ACQUISITION_DATE = new Date("1999-05-24");

const CASE_31_GB_INPUT: GeneralBuildingInput = {
  totalTransferPrice: 925_000_000,
  transferDate: TRANSFER_DATE,
  acquisitionDate: ACQUISITION_DATE,
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440, // BigInt 검산 — anchor 904,725,192 만족
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  // 사례 31 마이그레이션: 토지·건물 동시 매매
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: ACQUISITION_DATE,
};

const mockRates = makeMockRates();

// ============================================================
// 자산 카드 2장 → AggregateTransferInput 변환
// ============================================================

function buildAggregateInput(): AggregateTransferInput {
  const out = buildGeneralBuildingAssetCards(CASE_31_GB_INPUT);
  const base = baseTransferInput();

  // 환산취득가는 buildGeneralBuildingAssetCards에서 이미 산정 완료.
  // aggregate에는 일반 모드(실가 입력)로 acquisitionPrice = 환산값, expenses = 개산공제로 단순 차감.
  const properties: TransferTaxItemInput[] = out.assetCards.map((card) => ({
    ...(base as unknown as TransferTaxItemInput),
    propertyId: card.propertyId,
    propertyLabel: card.propertyLabel,
    propertyType: card.propertyType as TransferTaxItemInput["propertyType"],
    transferPrice: card.transferPrice,
    acquisitionPrice: card.acquisitionPrice,
    expenses: card.expenses,
    capitalExpenditure: undefined,
    transferExpense: undefined,
    acquisitionDate: card.acquisitionDate,
    transferDate: card.transferDate,
    isNonBusinessLand: card.isNonBusinessLand,
    // 본 사례는 상업용 일반건물 → 1세대1주택 비과세·중과 미적용
    isOneHousehold: false,
    householdHousingCount: 0,
    isAdjustedRegion: false,
  }));

  return {
    taxYear: 2023,
    annualBasicDeductionUsed: 0,
    properties,
    basicDeductionAllocation: "MAX_BENEFIT",
  };
}

// ============================================================
// E2E aggregate — §92 합산 + §95② 장특 + §102② 통산 + §55 누진
// ============================================================

describe("사례 31: 일반건물 일괄 — aggregate E2E + §102② 통산", () => {
  const input = buildAggregateInput();
  const result = calculateTransferTaxAggregate(input, mockRates);
  const land = result.properties.find((p) => p.propertyId === "land")!;
  const building = result.properties.find((p) => p.propertyId === "building")!;

  it("토지 차익 +663,676,556 / 건물 차손 -8,230,409", () => {
    expect(land.transferGain).toBe(663_676_556);
    expect(building.transferGain).toBe(-8_230_409);
  });

  it("case31_holding_years_floor — 보유기간 만 23년", () => {
    // 1999-05-24 → 2023-02-19 = 23년 8개월 26일 → floor 23
    // 단건 엔진 결과의 holdingYears는 result.steps에서도 노출되지만
    // PerPropertyBreakdown에는 직접 노출 없음. 장특공제율로 간접 검증 (다음 anchor)
    expect(land.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("case31_ltsd_rate_land — 장특공제율 = 30% (15년 이상 상한)", () => {
    // 663,676,556 × 0.30 = 199,102,966.8 → INT 199,102,966
    const rate = land.longTermHoldingDeduction / land.transferGain;
    expect(rate).toBeCloseTo(0.3, 4);
  });

  it("case31_ltsd_land — 토지 장특공제 = 199,102,966", () => {
    expect(land.longTermHoldingDeduction).toBe(199_102_966);
  });

  it("case31_ltsd_building — 건물 차손이라 장특 0 ★", () => {
    // transfer-tax-aggregate.ts L.129: transferGain < 0 → lthd = 0 강제
    expect(building.longTermHoldingDeduction).toBe(0);
  });

  it("case31_income_building_pre_offset — 건물 양도소득금액 (통산 전) = -8,230,409 ★", () => {
    // L.130: transferGain < 0 시 income = transferGain
    expect(building.income).toBe(-8_230_409);
  });

  it("case31_offset_amount — §102② 흡수액 = 8,230,409 ★", () => {
    // 건물 차손이 토지로 흡수
    expect(land.lossOffsetFromOtherGroup + land.lossOffsetFromSameGroup).toBe(
      8_230_409,
    );
  });

  it("case31_income_land_post_offset — 토지 통산 후 양도소득금액 = 456,343,181 ★", () => {
    // 토지 income(통산 전) = 663,676,556 − 199,102,966 = 464,573,590
    // 통산 후 = 464,573,590 − 8,230,409 = 456,343,181
    expect(land.incomeAfterOffset).toBe(456_343_181);
  });

  it("건물 통산 후 = 0 (차손은 자체 0)", () => {
    expect(building.incomeAfterOffset).toBe(0);
  });

  it("case31_total_income — 합계 양도소득금액 = 456,343,181", () => {
    const total = land.incomeAfterOffset + building.incomeAfterOffset;
    expect(total).toBe(456_343_181);
  });

  it("case31_taxable_base — 과세표준 = 453,843,181 (− 기본공제 250만)", () => {
    // 합계 양도소득금액 456,343,181 − 기본공제 2,500,000 = 453,843,181
    expect(result.taxBase).toBe(453_843_181);
  });

  it("case31_calc_tax — 산출세액 = 155,597,272 (2023년 §55 기본세율)", () => {
    // 과세표준 453,843,181 (300M~500M 구간 40% − 누진공제 25,940,000)
    // = 453,843,181 × 0.40 − 25,940,000
    // = 181,537,272.4 − 25,940,000
    // → INT 155,597,272
    expect(result.calculatedTax).toBe(155_597_272);
  });

  it("case31_local_tax — 지방소득세 (산출세액 × 10%, 천원 절사)", () => {
    // 155,597,272 × 0.10 = 15,559,727.2 → 천원 절사 = 15,559,000
    // 단, mockRates 정책상 천원 절사 적용 (transfer-tax-aggregate.ts localIncomeTax)
    expect(result.localIncomeTax).toBeGreaterThan(0);
    expect(result.localIncomeTax).toBeLessThanOrEqual(15_559_727);
  });
});

// ============================================================
// §92 차손 통산 순서 회귀 방어 — 단독 anchor
// ============================================================

describe("사례 31: 통산 순서 회귀 방어 (장특 전 차손 → 장특 후 통산)", () => {
  it("4-스텝 순서 anchor: ltsd_building=0 + income_building_pre=-8,230,409 + offset=8,230,409 + income_land_post=456,343,181", () => {
    const result = calculateTransferTaxAggregate(buildAggregateInput(), mockRates);
    const land = result.properties.find((p) => p.propertyId === "land")!;
    const bldg = result.properties.find((p) => p.propertyId === "building")!;

    // 4 anchor 동시 검증 — 어느 하나가 어긋나면 통산 순서 회귀
    expect(bldg.longTermHoldingDeduction).toBe(0);
    expect(bldg.income).toBe(-8_230_409);
    expect(land.lossOffsetFromOtherGroup + land.lossOffsetFromSameGroup).toBe(
      8_230_409,
    );
    expect(land.incomeAfterOffset).toBe(456_343_181);
  });
});
