/**
 * 사례 34 변형 — 부담부증여 + 일반건물 + 실거래가 모드 (Excel 직접 anchor, 2026-05-12)
 *
 * 출처: 부담부 증여.xlsx (양도코리아 교재 사례 34 동일 케이스, 실거래가 모드)
 *   증여일=양도일 2023-02-19, 취득일 1998-09-07
 *   사용자가 토지+건물 일괄 실거래가 2,500,000,000 입력하지만
 *   §159①1호 단서에 따라 사용자 입력은 무시되고 취득시 기준시가 기반 환산 적용.
 *
 * 본 테스트는 `dispatchGeneralBuilding`(actualPriceMode)이 부담부증여 정보를 받았을 때
 * §159 산식으로 자산별 양도가/취득가/개산공제를 환산하는지 검증.
 *
 * 법령 근거:
 *   - 소득세법 시행령 §159 ① 1·2호 (부담부증여 양도차익)
 *   - 소득세법 시행령 §159 ① 1호 괄호 (양도가액을 §99 기준시가로 산정 시 취득가액도 기준시가)
 *   - 소득세법 시행령 §163 ⑥ (개산공제 3%)
 *   - 소득세법 시행령 §166 ⑥ (자산별 안분 — 양도시 기준시가 비율)
 *
 * 비스코프: 양도시(C31=8,580,831,500) vs 증여시(C37=8,578,295,360) 보충적평가 분리.
 *   엔진은 단일 max(8,580,831,500) 사용 → Excel 1,308,417,573과 약 386K원 차이.
 *   합계(산출세액)는 거의 동일.
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

const TRANSFER_DATE = new Date("2023-02-19");
const ACQUISITION_DATE = new Date("1998-09-07");

const LAND_AREA = 1279;
const TRANSFER_LAND_PRICE_PER_SQM = 6_215_000;        // Excel I31
const ACQUISITION_LAND_PRICE_PER_SQM = 2_130_000;     // Excel I32
const TRANSFER_BUILDING_STD_PRICE = 631_846_500;      // Excel E31 (홈택스 조회 양도시)
const ACQUISITION_BUILDING_STD_PRICE = 424_472_064;   // Excel E32
const BUILDING_FOOTPRINT_AREA = 388.27;

const burdenedGiftInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 1_000_000_000,
  mortgageDebtAmount: 3_120_000_000,
  annualRentTotal: 130_000_000,
  // 본 테스트의 정확 분모는 calculateGeneralBuildingActualTransfer 내부에서
  // transferLandPricePerSqm × landArea / transferBuildingStdPrice 로 재산정.
  landStdPriceAtTransfer: LAND_AREA * TRANSFER_LAND_PRICE_PER_SQM,
  buildingStdPriceAtTransfer: TRANSFER_BUILDING_STD_PRICE,
  landStdPriceAtAcquisition: LAND_AREA * ACQUISITION_LAND_PRICE_PER_SQM,
  buildingStdPriceAtAcquisition: ACQUISITION_BUILDING_STD_PRICE,
  donorRelation: "lineal_descendant",
};

// ============================================================
// 채무 합계·평가 max 자가검증
// ============================================================
//
// 채무 = 보증금 1B + 차입금 3.12B = 4,120,000,000
// 양도시 보충적평가 (engine 분모) = 7,948,985,000 + 631,846,500 = 8,580,831,500
// Excel C31 = 8,580,831,500 ✓
//
// 자산별 양도가액 (§159①2호):
//   land = 4.12B × 7,948,985,000 / 8,580,831,500 = 3,816,625,253
//   building = 4.12B × 631,846,500 / 8,580,831,500 = 303,374,747
//   (Excel D8/E8 정확 일치)
//
// 자산별 취득가액 (§159①1호, 본 엔진은 양도시 분모 단일 사용):
//   land = 2,724,270,000 × 4.12B / 8,580,831,500 = 1,308,030,866
//     (Excel D9 1,308,417,573과 약 386K원 차이 — 양도시 vs 증여시 분모 차이, 비스코프)
//   building = 424,472,064 × 4.12B / 8,580,831,500 = 203,805,937
//     (Excel E9 203,866,249과 약 60K원 차이)
//
// 자산별 개산공제 (§163⑥, 3%):
//   land = 1,308,030,866 × 0.03 = 39,240,925
//   building = 203,805,937 × 0.03 = 6,114,178

describe("부담부증여 + 일반건물 실거래가 모드 — §159①1호 환산", () => {
  function makePayload() {
    return {
      totalTransferPrice: 0, // §159 모드는 totalTransferPrice 무시 (안분 결과로 override)
      transferDate: TRANSFER_DATE,
      acquisitionDate: ACQUISITION_DATE,
      landArea: LAND_AREA,
      buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
      transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
      transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
      zoneType: "general_residential", // 일반주거 (NBL 통과 가정)
      isMetropolitan: false,
      isUnregistered: false,
      // ★ 핵심: 사용자가 실거래가 2.5B 입력하지만 부담부증여 모드에서는 무시됨
      actualAcquisitionPrice: 2_500_000_000,
      actualExpenses: 0,
      // §159 환산용 취득시 기준시가
      acquisitionLandPricePerSqm: ACQUISITION_LAND_PRICE_PER_SQM,
      acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
      burdenedGiftInfo,
    };
  }

  it("§159 분기 진입 — 자산별 양도가액 = Excel D8·E8 정확 일치", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    // apportionment.apportioned는 카드 순서: 토지 → 건물 (NBL 통과 시)
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    const building = result.apportionment.apportioned.find(a => a.assetKind === "building");
    expect(land?.allocatedSalePrice).toBe(3_816_625_253);
    expect(building?.allocatedSalePrice).toBe(303_374_746); // building = total - land (BigInt 안분 차이 1원)
  });

  it("§159①1호 단서 — 사용자 입력 실거래가(2.5B) 무시, 취득시 기준시가 기반 환산", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    const building = result.apportionment.apportioned.find(a => a.assetKind === "building");
    // 엔진 산출값 (양도시 분모 8,580,831,500 사용, BigInt 안분)
    expect(land?.allocatedAcquisitionPrice).toBe(1_308_030_859);
    expect(building?.allocatedAcquisitionPrice).toBe(203_805_995);
    // 사용자 입력 2.5B을 안분한 결과(2,315,913,382 / 184,086,618)가 아님 확인
    expect(land?.allocatedAcquisitionPrice).not.toBe(2_315_913_382);
  });

  it("자산별 개산공제 = 취득가액 × 3% (§163⑥)", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    const building = result.apportionment.apportioned.find(a => a.assetKind === "building");
    expect(land?.allocatedExpenses).toBe(39_240_925);
    expect(building?.allocatedExpenses).toBe(6_114_179);
  });

  it("산출세액 + 지방소득세 — Excel 최종값 근사 (양도시·증여시 분모 차이로 미세 차이)", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    // Excel anchor: 산출세액 740,074,514 / 지방소득세 74,007,451
    // 엔진 산출값은 양도시 분모(8,580,831,500) 단일 사용으로 인해 약 145K원 차이.
    // 정확화는 후속 PR: BurdenedGiftBreakdown.giftDateValuation 추가로 증여시 분모(C37) 분리.
    const calc = result.aggregated.calculatedTax;
    const local = result.aggregated.localIncomeTax;
    // 1% 이내 일치 (계산 정확성 검증 목적)
    expect(Math.abs(calc - 740_074_514)).toBeLessThan(1_000_000);
    expect(Math.abs(local - 74_007_451)).toBeLessThan(100_000);
  });

  it("부담부증여 없이 호출 시 기존 §166⑥ 안분 (사용자 실거래가 사용) — 회귀 보장", () => {
    const result = calculateGeneralBuildingActualTransfer(
      { ...makePayload(), burdenedGiftInfo: undefined }, 2023, undefined, [], rates,
    );
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    // 사용자 실거래가 2,500,000,000을 §166⑥ 양도시 기준시가 비율로 안분.
    // landRatio = 7,948,985,000 / 8,580,831,500 ≈ 0.9263654
    // 2,500,000,000 × 0.9263654 ≈ 2,315,913,382 (Math.floor)
    expect(land?.allocatedAcquisitionPrice).toBe(2_315_913_382);
  });
});

// ============================================================
// 가드: 부담부증여 모드 + 취득시 기준시가 누락 시 명확한 에러
// ============================================================

// ============================================================
// 증여시 건물 기준시가 분리 입력 — Excel C37 정확 일치
// ============================================================
//
// 사용자가 bgGiftBuildingStdPriceAtTransfer = 629,310,360 (Excel E37, 층별 가감율 적용) 입력 시
// 채무비율 분모 = 7,948,985,000 + 629,310,360 = 8,578,295,360 (Excel C37)
// 취득가액 토지 = 2,724,270,000 × 4,120,000,000 / 8,578,295,360 = 1,308,417,573 (Excel D9 정확 일치)
// 취득가액 건물 = 424,472,064 × 4,120,000,000 / 8,578,295,360 = 203,866,249 (Excel E9 정확 일치)

describe("증여시 건물 기준시가 분리 — Excel D9·E9 정확 일치", () => {
  const giftBuildingStdSeparate = 629_310_360; // Excel E37
  const infoWithGiftSeparate: BurdenedGiftInfo = {
    ...burdenedGiftInfo,
    giftBuildingStdPriceAtTransfer: giftBuildingStdSeparate,
  };

  function makePayload() {
    return {
      totalTransferPrice: 0,
      transferDate: TRANSFER_DATE,
      acquisitionDate: ACQUISITION_DATE,
      landArea: LAND_AREA,
      buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
      transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
      transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
      zoneType: "general_residential",
      isMetropolitan: false,
      isUnregistered: false,
      actualAcquisitionPrice: 2_500_000_000,
      actualExpenses: 0,
      acquisitionLandPricePerSqm: ACQUISITION_LAND_PRICE_PER_SQM,
      acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
      burdenedGiftInfo: infoWithGiftSeparate,
    };
  }

  it("취득가액 토지 = 1,308,417,573 / 건물 = 203,866,249 (Excel D9·E9 정확 일치)", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    const building = result.apportionment.apportioned.find(a => a.assetKind === "building");
    expect(land?.allocatedAcquisitionPrice).toBe(1_308_417_573);
    expect(building?.allocatedAcquisitionPrice).toBe(203_866_249);
  });

  it("개산공제 토지 39,252,527 / 건물 6,115,987 (Excel D10·E10 정확 일치)", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    const building = result.apportionment.apportioned.find(a => a.assetKind === "building");
    expect(land?.allocatedExpenses).toBe(39_252_527);
    expect(building?.allocatedExpenses).toBe(6_115_987);
  });

  it("자산별 양도가액은 양도세 분모(C31) 사용 — Excel D8·E8 일치 보존", () => {
    const result = calculateGeneralBuildingActualTransfer(
      makePayload(), 2023, undefined, [], rates,
    );
    const land = result.apportionment.apportioned.find(a => a.assetKind === "land");
    const building = result.apportionment.apportioned.find(a => a.assetKind === "building");
    // 분모 = land 7,948,985,000 + buildingStdPriceAtTransfer 631,846,500 = 8,580,831,500 (Excel C31)
    expect(land?.allocatedSalePrice).toBe(3_816_625_253);
    expect(building?.allocatedSalePrice).toBe(303_374_746);
  });
});

describe("부담부증여 일반건물 — 취득시 기준시가 누락 검증", () => {
  it("acquisitionLandPricePerSqm 누락 시 TaxCalculationError", () => {
    expect(() =>
      calculateGeneralBuildingActualTransfer(
        {
          totalTransferPrice: 0,
          transferDate: TRANSFER_DATE,
          acquisitionDate: ACQUISITION_DATE,
          landArea: LAND_AREA,
          buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
          transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
          transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
          zoneType: "general_residential",
          actualAcquisitionPrice: 2_500_000_000,
          actualExpenses: 0,
          // acquisitionLandPricePerSqm 누락
          acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
          burdenedGiftInfo,
        }, 2023, undefined, [], rates,
      ),
    ).toThrow(/취득시 토지·건물 기준시가/);
  });
});
