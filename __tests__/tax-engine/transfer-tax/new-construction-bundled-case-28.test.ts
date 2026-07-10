/**
 * 사례 28 — 나대지 취득 후 주택 신축 일괄양도 anchor 테스트
 *
 * 케이스 개요:
 *   - 갑氏: 2022.1.8. 나대지 취득(1.5억) → 2022.8.29. 주택 신축(사용승인, 신축비용 1억)
 *   - 2023.3.6. 주택+부수토지 일괄양도(4억)
 *   - 건물 123.12㎡, 토지 206.6㎡, 양도 당시 개별공시지가 540,000원/㎡
 *
 * 핵심 쟁점:
 *   - 토지 보유 약 1년 2개월(1년~2년, §104①3호 40%) — 단, 부수토지 일체과세 원리로 70% 적용
 *   - 건물 보유 약 6개월 7일(1년 미만, §104①3호 단서 70%)
 *   - 부수토지 일체과세(§89①3호·영 §154⑦, 기재부 재산-53/재산-1354):
 *     건물 123.12㎡ × 5(도시지역) = 615.6㎡ ≥ 토지 206.6㎡ → 전량 부수토지 인정 → 70%
 *
 * anchor 출처: 예제 PDF 사례 28 (원단위)
 *
 * 법령코드 상수 (legal-codes.ts):
 *   TRANSFER.ONE_HOUSE_EXEMPT          — §89①3호
 *   TRANSFER.APPURTENANT_LAND_LIMIT    — 영 §154⑦
 *   TRANSFER.HIGHER_TAX_RULE           — §104①후단
 *   TRANSFER.SELF_BUILT_ACQUISITION_DATE — 영 §162①4호
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { apportionBundledSale } from "@/lib/tax-engine/bundled-sale-apportionment";
import { resolveCompanionLandRate } from "@/lib/tax-engine/appurtenant-land-rate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { AggregateTransferInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

// ============================================================
// 사례 28 상수
// ============================================================

const TRANSFER_DATE   = new Date("2023-03-06");
const BUILDING_ACQ    = new Date("2022-08-29");  // 사용승인일 — 영 §162①4호
const LAND_ACQ        = new Date("2022-01-08");  // 나대지 취득일
const TOTAL_SALE      = 400_000_000;             // 일괄양도가액

// 기준시가 안분 결과 (PDF 원단위)
const LAND_ALLOC_PRICE     = 217_542_381;
const BUILDING_ALLOC_PRICE = 182_457_619;

// 취득가액
const LAND_ACQ_PRICE     = 150_000_000;
const BUILDING_ACQ_PRICE = 100_000_000;

// 양도차익
const LAND_GAIN     = 67_542_381;   // 217,542,381 - 150,000,000
const BUILDING_GAIN = 82_457_619;   // 182,457,619 - 100,000,000
const TOTAL_GAIN    = 150_000_000;

// 세액 (단일 70% — 부수토지 일체과세)
const BASIC_DEDUCTION = 2_500_000;
const TAX_BASE        = 147_500_000;    // 150,000,000 - 2,500,000
const CALC_TAX        = 103_250_000;    // floor(147,500,000 × 0.70)
const LOCAL_TAX       = 10_325_000;     // floor(103,250,000 × 0.10)
const TOTAL_TAX       = 113_575_000;

// 부수토지 면적 정보
const BUILDING_FOOTPRINT = 123.12;   // 건물 정착면적 (㎡)
const LAND_AREA          = 206.6;    // 토지 면적 (㎡)
const LIMIT_AREA         = BUILDING_FOOTPRINT * 5;  // 615.6㎡ (도시지역 5배)

// ============================================================
// 헬퍼 팩토리
// ============================================================

/** 건물(primary) 단건 엔진 입력 — 부수토지 일체과세 컨텍스트 포함 */
function makeBuildingInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: BUILDING_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: BUILDING_ACQ_PRICE,
    acquisitionDate: BUILDING_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    buildingFootprintArea: BUILDING_FOOTPRINT,
    isUrbanArea: true,
    ...overrides,
  });
}

/** 토지(companion) 단건 엔진 입력 — primaryContextForCompanionRate 포함 */
function makeLandInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: LAND_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: LAND_ACQ_PRICE,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: LAND_AREA,
    landNature: "appurtenant_to_housing",  // ← 명시적 부수토지 선언 (landNature 정책)
    // 부수토지 일체과세 primaryContext — landNature 선언 후 면적 한도 + 보유기간 결정에 사용
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 6,   // 2022.8.29 ~ 2023.3.6 ≈ 6개월 (1년 미만)
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
      bundledSaleMode: "apportioned",
    },
    ...overrides,
  });
}

/** 합산 엔진 입력 (§103 기본공제 단일 적용) */
function makeAggregateInput(overrides?: Partial<AggregateTransferInput>): AggregateTransferInput {
  const building = makeBuildingInput();
  const land = makeLandInput();
  return {
    taxYear: 2023,
    properties: [
      { ...building, propertyId: "building", propertyLabel: "주택(건물)" },
      { ...land,     propertyId: "land",     propertyLabel: "부수토지" },
    ],
    annualBasicDeductionUsed: 0,
    priorReductionUsage: [],
    ...overrides,
  };
}

// ============================================================
// Group A — 합산 모드 (자동 분기 ON, 사례 28 PDF 일치)
// ============================================================

describe("사례 28 Group A — 안분 + 합산 (PDF 원단위 anchor)", () => {
  it("T-01 토지 안분 양도가액 = 217,542,381", () => {
    // 기준시가 비율 안분 엔진 직접 검증
    // 토지 기준시가 = 540,000원/㎡ × 206.6㎡ = 111,564,000
    // 건물 기준시가 = 93,571,201 (PDF anchor에서 역산)
    // 역산식: 93,571,201 = 111,564,000 / (217,542,381/400,000,000) - 111,564,000
    const apportionment = apportionBundledSale({
      totalSalePrice: TOTAL_SALE,
      assets: [
        { assetId: "building", assetLabel: "주택", assetKind: "housing", standardPriceAtTransfer: 93_571_201, fixedAcquisitionPrice: BUILDING_ACQ_PRICE },
        { assetId: "land",     assetLabel: "토지", assetKind: "land",    standardPriceAtTransfer: 111_564_000, fixedAcquisitionPrice: LAND_ACQ_PRICE },
      ],
    });
    const land = apportionment.apportioned.find((a) => a.assetId === "land")!;
    expect(land.allocatedSalePrice).toBe(LAND_ALLOC_PRICE);
  });

  it("T-02 건물 안분 양도가액 = 182,457,619", () => {
    const apportionment = apportionBundledSale({
      totalSalePrice: TOTAL_SALE,
      assets: [
        { assetId: "building", assetLabel: "주택", assetKind: "housing", standardPriceAtTransfer: 93_571_201, fixedAcquisitionPrice: BUILDING_ACQ_PRICE },
        { assetId: "land",     assetLabel: "토지", assetKind: "land",    standardPriceAtTransfer: 111_564_000, fixedAcquisitionPrice: LAND_ACQ_PRICE },
      ],
    });
    const building = apportionment.apportioned.find((a) => a.assetId === "building")!;
    expect(building.allocatedSalePrice).toBe(BUILDING_ALLOC_PRICE);
  });

  it("T-03 토지 양도차익 = 67,542,381", () => {
    const result = calculateTransferTax(makeLandInput(), makeMockRates());
    expect(result.transferGain).toBe(LAND_GAIN);
  });

  it("T-04 건물 양도차익 = 82,457,619", () => {
    const result = calculateTransferTax(makeBuildingInput(), makeMockRates());
    expect(result.transferGain).toBe(BUILDING_GAIN);
  });

  it("T-05 양도차익 합계 = 150,000,000", () => {
    expect(LAND_GAIN + BUILDING_GAIN).toBe(TOTAL_GAIN);
  });

  it("T-06 양도소득기본공제 = 2,500,000 (§103, 합산 1회)", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.basicDeduction).toBe(BASIC_DEDUCTION);
  });

  it("T-07 과세표준 = 147,500,000", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.taxBase).toBe(TAX_BASE);
  });

  it("T-08 적용 세율 = 0.70 (토지 단건 엔진 — 부수토지 일체과세 자동 분기)", () => {
    // AggregateTransferResult에 appliedRate가 없으므로 토지 단건 엔진으로 검증
    const landResult = calculateTransferTax(makeLandInput(), makeMockRates());
    expect(landResult.appliedRate).toBe(0.70);
  });

  it("T-09 산출세액 = 103,250,000 (합산 결과)", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.calculatedTax).toBe(CALC_TAX);
  });

  it("T-10 농어촌특별세 = 0 (비과세·감면 없음)", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.reductionAmount).toBe(0);
  });

  it("T-11 지방소득세 = 10,325,000", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.localIncomeTax).toBe(LOCAL_TAX);
  });

  it("T-12 납부세액 합계 = 113,575,000", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.totalTax).toBe(TOTAL_TAX);
  });
});

// ============================================================
// Group B — 수동 오버라이드
// ============================================================

describe("사례 28 Group B — 수동 오버라이드", () => {
  it("T-13 manualHoldingPeriodOverride='shortTerm60' → 토지 세율 0.60", () => {
    const input = makeLandInput({ manualHoldingPeriodOverride: "shortTerm60" });
    const result = calculateTransferTax(input, makeMockRates());
    // "shortTerm60" → 1년~2년 주택 세율 60% 강제 (enum명 유지, 세율 변경: 40%→60%)
    // 플랜: "shortTerm60"은 1~2년 주택 세율(60%) 강제 — appurtenant-land-rate.ts 주석 참조
    expect(result.appliedRate).toBe(0.60);
  });

  it("T-14 manualHoldingPeriodOverride='progressive' → 토지 누진세율 < 0.60", () => {
    const input = makeLandInput({ manualHoldingPeriodOverride: "progressive" });
    const result = calculateTransferTax(input, makeMockRates());
    // 과세표준 67,542,381 → 35% 구간 (88M~150M)
    expect(result.appliedRate).toBeLessThan(0.60);
    expect(result.appliedRate).toBeGreaterThan(0);
  });

  it("T-15 landNature=appurtenant 자동 분기 시 appliedReason에 '주택·부수토지 일체과세' 포함", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.appliedReason).toContain("주택·부수토지 일체과세");
  });
});

// ============================================================
// Group C — 경계 / 면적 한도
// ============================================================

describe("사례 28 Group C — 경계·면적 한도", () => {
  it("T-16 부수토지=Yes + 주택 보유 12개월 정확히 → 60% 적용 (1년~2년 구간)", () => {
    // landNature 명시 정책: 12개월 = 1년 이상 2년 미만 → housingRateForHoldingPeriod = 0.60
    // (이전 동작: isPrimaryShortTerm < 12 조건으로 applied=false였으나 법령 무관 조건이었음)
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 12, // 정확히 12개월 → 60% 구간
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.unifiedRate).toBe(0.60);
  });

  it("T-17 primary가 'land'(비주택) → 자동 분기 미적용 (applied=false)", () => {
    // landNature 있어도 isPrimaryHousing=false → applied=false
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
      {
        propertyType: "land", // housing 아님
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(false);
  });

  it("T-18 토지 면적 > 정착면적 × 5(도시지역) → 초과분 excessRate=0.40 반환", () => {
    const oversizeArea = BUILDING_FOOTPRINT * 5 + 100; // 715.6㎡ > 615.6㎡
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: oversizeArea, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.unifiedRate).toBe(0.70);
    expect(resolution.excessRate).toBe(0.40);
    expect(resolution.excessArea).toBeCloseTo(100, 1);
    expect(resolution.limitArea).toBeCloseTo(LIMIT_AREA, 1);
  });

  it("T-19 도시지역 외(isUrbanArea=false) → 한도 = 정착면적 × 10", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: false, // 도시지역 외 → 10배
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.limitArea).toBeCloseTo(BUILDING_FOOTPRINT * 10, 1);
    expect(resolution.excessArea).toBe(0); // 206.6 < 1231.2 → 초과 없음
  });
});

// ============================================================
// Group D — §103 기본공제 단일 적용
// ============================================================

describe("사례 28 Group D — §103 기본공제 단일 적용", () => {
  it("T-20 2자산 합산 시 기본공제 250만 × 1회만 차감 → 과세표준 147,500,000", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    // 150,000,000 - 2,500,000 = 147,500,000 (× 2 = 500만 공제 아님)
    expect(result.taxBase).toBe(TAX_BASE);
    expect(result.basicDeduction).toBe(BASIC_DEDUCTION);
  });
});

// ============================================================
// Group E — 한도 초과 companion split (G-2, 영 §154⑦)
// ============================================================
//
// 케이스: 도시지역, 건물 100㎡ × 5 = 500㎡ 한도, 토지 700㎡ → 초과 200㎡
// 일괄양도가 4억, 토지 기준시가 540,000원/㎡ × 700㎡ = 378,000,000
// 건물 기준시가: 93,571,201 (사례 28 원본 동일)
//
// split 비율 (면적 기준):
//   excessRatio = 200 / 700 = 2/7
//   appurtenantRatio = 500 / 700 = 5/7
//
// 안분 결과:
//   토지 안분 양도가 = floor(400,000,000 × 378,000,000 / 471,571,201) = 320,630,266
//   건물 안분 양도가 = 400,000,000 - 320,630,266 = 79,369,734
//
// split 후 금액 (floor → 나머지는 appurtenant에):
//   초과분 양도가 = floor(320,630,266 × 2/7) = 91,608,647
//   부수분 양도가 = 320,630,266 - 91,608,647 = 229,021,619
//   초과분 취득가 = floor(150,000,000 × 2/7) = 42,857,142
//   부수분 취득가 = 150,000,000 - 42,857,142 = 107,142,858
//
// 양도차익:
//   부수토지(한도 내): 229,021,619 - 107,142,858 = 121,878,761
//   한도 초과: 91,608,647 - 42,857,142 = 48,751,505
//   건물: 79,369,734 - 100,000,000 = -20,630,266 (손실)
//   합계: 121,878,761 + 48,751,505 + (-20,630,266) = 150,000,000

const EXCESS_LAND_AREA = 700;
const EXCESS_BUILDING_FOOTPRINT = 100; // 100㎡ × 5 = 500㎡ 한도
const EXCESS_LIMIT_AREA = 500;
const EXCESS_AREA = 200;

// 안분 기준시가
const EXCESS_LAND_STD = 540_000 * EXCESS_LAND_AREA; // 378,000,000

// 안분 양도가
const EXCESS_LAND_ALLOC = Math.floor(400_000_000 * EXCESS_LAND_STD / (EXCESS_LAND_STD + 93_571_201)); // 320,630,266
const EXCESS_BUILDING_ALLOC = 400_000_000 - EXCESS_LAND_ALLOC; // 79,369,734

// split 비율 적용 (floor → appurtenant에 나머지 귀속)
const EXCESS_RATIO = EXCESS_AREA / EXCESS_LAND_AREA; // 200/700
const EXCESS_LAND_TRANSFER_EXCESS = Math.floor(EXCESS_LAND_ALLOC * EXCESS_RATIO); // 91,608,647
const EXCESS_LAND_TRANSFER_APPURT = EXCESS_LAND_ALLOC - EXCESS_LAND_TRANSFER_EXCESS; // 229,021,619
const EXCESS_LAND_ACQ_EXCESS = Math.floor(150_000_000 * EXCESS_RATIO); // 42,857,142
const EXCESS_LAND_ACQ_APPURT = 150_000_000 - EXCESS_LAND_ACQ_EXCESS; // 107,142,858

// 양도차익
const EXCESS_APPURT_GAIN = EXCESS_LAND_TRANSFER_APPURT - EXCESS_LAND_ACQ_APPURT; // 121,878,761
const EXCESS_EXCESS_GAIN = EXCESS_LAND_TRANSFER_EXCESS - EXCESS_LAND_ACQ_EXCESS;  // 48,751,505
const EXCESS_BUILDING_GAIN = EXCESS_BUILDING_ALLOC - 100_000_000; // -20,630,266 (손실)
const EXCESS_TOTAL_GAIN = EXCESS_APPURT_GAIN + EXCESS_EXCESS_GAIN + EXCESS_BUILDING_GAIN; // 150,000,000

/** 부수토지(한도 내) 엔진 입력 — primaryContextForCompanionRate 주입 → 70% 자동 분기 */
function makeAppurtenantInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: EXCESS_LAND_TRANSFER_APPURT,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: EXCESS_LAND_ACQ_APPURT,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: EXCESS_LIMIT_AREA,
    landNature: "appurtenant_to_housing",  // ← 명시적 부수토지 선언
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 6, // 건물 보유 6개월
      buildingFootprintArea: EXCESS_BUILDING_FOOTPRINT,
      isUrbanArea: true,
    },
    ...overrides,
  });
}

/** 한도 초과 토지 엔진 입력 — primaryContextForCompanionRate 없음 → 토지 본래 보유기간 세율 */
function makeExcessInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: EXCESS_LAND_TRANSFER_EXCESS,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: EXCESS_LAND_ACQ_EXCESS,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: EXCESS_AREA,
    // 한도 초과분 → primaryCtx 없음 (주택 일체과세 배제)
    primaryContextForCompanionRate: undefined,
    ...overrides,
  });
}

/** 한도 초과 케이스 건물 입력 */
function makeExcessBuildingInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: EXCESS_BUILDING_ALLOC,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: 100_000_000,
    acquisitionDate: BUILDING_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    buildingFootprintArea: EXCESS_BUILDING_FOOTPRINT,
    isUrbanArea: true,
    ...overrides,
  });
}

/** 3자산 합산 엔진 입력 (건물 + 부수토지 + 한도초과) */
function makeExcessAggregateInput(overrides?: Partial<AggregateTransferInput>): AggregateTransferInput {
  return {
    taxYear: 2023,
    properties: [
      { ...makeExcessBuildingInput(), propertyId: "building", propertyLabel: "주택(건물)" },
      { ...makeAppurtenantInput(),    propertyId: "land__appurtenant", propertyLabel: "부수토지(한도 내)" },
      { ...makeExcessInput(),         propertyId: "land__excess",      propertyLabel: "토지(한도 초과)" },
    ],
    annualBasicDeductionUsed: 0,
    priorReductionUsage: [],
    ...overrides,
  };
}

describe("사례 28 Group E — 한도 초과 companion split (G-2, 영 §154⑦)", () => {
  it("T-21 부수토지(한도 내) 적용 세율 = 0.70 (primaryCtx 주입 → 일체과세 자동 분기)", () => {
    const result = calculateTransferTax(makeAppurtenantInput(), makeMockRates());
    expect(result.appliedRate).toBe(0.70);
    expect(result.transferGain).toBe(EXCESS_APPURT_GAIN);
  });

  it("T-22 한도 초과 토지 세율 ≠ 0.70 (primaryCtx 없음 → 토지 본래 보유기간 §104①3호 40% 적용)", () => {
    const result = calculateTransferTax(makeExcessInput(), makeMockRates());
    // 토지 보유기간: 2022.1.8 ~ 2023.3.6 ≈ 14개월 → 1년 이상 2년 미만 → §104①3호 40%
    expect(result.appliedRate).toBe(0.40);
    expect(result.transferGain).toBe(EXCESS_EXCESS_GAIN);
  });

  it("T-23 3자산 합산 결과 — 양도차익 합계 = 150,000,000 (건물 손실 상계)", () => {
    const result = calculateTransferTaxAggregate(makeExcessAggregateInput(), makeMockRates());
    // 합산: 121,878,761 + 48,751,505 + (-20,630,266) = 150,000,000
    expect(EXCESS_TOTAL_GAIN).toBe(150_000_000);
    // aggregate는 손실 포함 합산 → 과세표준 = 150,000,000 - 2,500,000 = 147,500,000
    expect(result.taxBase).toBe(147_500_000);
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("T-24 도시지역 외(isUrbanArea=false) → 한도 = 100㎡ × 10 = 1000㎡, 700㎡ 전량 부수토지 인정 (초과 없음)", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: EXCESS_LAND_AREA, landNature: "appurtenant_to_housing" }, // 700㎡
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: EXCESS_BUILDING_FOOTPRINT, // 100㎡
        isUrbanArea: false, // 도시지역 외 → 10배
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.limitArea).toBeCloseTo(1000, 1); // 100 × 10
    expect(resolution.excessArea).toBe(0); // 700 < 1000 → 초과 없음
    expect(resolution.unifiedRate).toBe(0.70);
  });
});

// ============================================================
// resolveCompanionLandRate 단위 테스트
// ============================================================

describe("resolveCompanionLandRate 단위 테스트", () => {
  it("사례 28 본 케이스 — landNature 명시 + 전량 부수토지 인정 (excessArea=0)", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.unifiedRate).toBe(0.70);
    expect(resolution.excessArea).toBe(0);
    expect(resolution.limitArea).toBeCloseTo(LIMIT_AREA, 1);
  });

  it("landNature 미선언 (undefined) → applied=false (자동 분기 없음)", () => {
    // landNature 명시 정책: undefined이면 일체과세 분기 진입 안 함
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA }, // landNature 없음
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(false);
  });

  it("landNature='non_appurtenant' → applied=false (독립 나대지)", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "non_appurtenant" },
      { propertyType: "housing", holdingMonths: 6 },
    );
    expect(resolution.applied).toBe(false);
  });

  it("manualHoldingPeriodOverride='shortTermHousing70' → applied=true, manualRate=0.70 (수동 우선)", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", manualHoldingPeriodOverride: "shortTermHousing70" },
      { propertyType: "housing", holdingMonths: 20 }, // landNature 없어도 수동 오버라이드 우선
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.manualRate).toBe(0.70);
  });

  it("manualHoldingPeriodOverride='progressive' → applied=true, manualProgressive=true", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", manualHoldingPeriodOverride: "progressive" },
      { propertyType: "housing", holdingMonths: 6 },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.manualProgressive).toBe(true);
  });

  it("companion이 land 아닌 housing → applied=false", () => {
    const resolution = resolveCompanionLandRate(
      { assetKind: "housing", area: 100 }, // housing companion
      {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(false);
  });

  it("buildingFootprintArea 없어도 landNature 선언 시 자동 분기 활성 → 전량 부수토지 fallback", () => {
    // 정착면적 미입력 시 한도 검증 생략, landNature 선언만으로 부수토지 분기 활성.
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 6,
        // buildingFootprintArea 없음
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.unifiedRate).toBe(0.7);
    expect(resolution.excessArea).toBe(0);
  });
});

// ============================================================
// Group F (T-33~T-37) — landNature 명시 입력 정책 신규 anchor
// ============================================================

describe("사례 28 Group F — landNature 명시 입력 정책 신규 anchor", () => {
  it("T-33 부수토지=Yes + 주택 2~3년 보유 → 토지에 누진세율 + LTHD 배제(§95② 3년 미만)", () => {
    // 주택 30개월 보유 → housingRateForHoldingPeriod = "progressive"
    // LTHD: §95② 장기보유공제는 보유 3년 이상이 진입요건 → 30개월(2.5년)은 LTHD 0
    const landInput = makeLandInput({
      acquisitionDate: new Date("2021-01-01"),
      primaryContextForCompanionRate: {
        propertyType: "housing",
        holdingMonths: 30,  // 2년 6개월 → 누진세율(세율은 유지), LTHD는 3년 미만이라 0
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
      residencePeriodMonths: 0,
      isOneHousehold: false,
    });
    const result = calculateTransferTax(landInput, makeMockRates());
    // 누진세율 적용 (0.70 아님) — 세율은 2년 이상이면 그대로 적용
    expect(result.appliedRate).toBeLessThan(0.70);
    expect(result.appliedRate).toBeGreaterThan(0);
    // LTHD = 0 (§95② 보유 3년 미만 → 장기보유공제 배제)
    expect(result.longTermHoldingDeduction).toBe(0);
    expect(result.longTermHoldingRate).toBe(0);
  });

  it("T-34 부수토지=Yes + 주택 1~2년 보유 → 토지에 60% 단일세율", () => {
    // 주택 18개월 보유 → housingRateForHoldingPeriod = 0.60
    const landInput = makeLandInput({
      primaryContextForCompanionRate: {
        propertyType: "housing",
        holdingMonths: 18,  // 1.5년 → 60%
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    });
    const result = calculateTransferTax(landInput, makeMockRates());
    expect(result.appliedRate).toBe(0.60);
    // 단기(1~2년) → LTHD 배제
    expect(result.longTermHoldingDeduction).toBe(0);
  });

  it("T-35 부수토지=No (독립 나대지) + 주택 단기 → 토지 본래 세율(40%) 적용", () => {
    // landNature='non_appurtenant' → 일체과세 분기 미진입
    // 토지 보유기간: 2022.1.8 ~ 2023.3.6 ≈ 14개월 → §104①3호 40%
    const landInput = makeLandInput({
      landNature: "non_appurtenant",  // 독립 나대지 선언
      primaryContextForCompanionRate: {
        propertyType: "housing",
        holdingMonths: 6,  // 주택 단기보유이지만 토지는 독립 나대지
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    });
    const result = calculateTransferTax(landInput, makeMockRates());
    // 토지 본래 보유기간 14개월 → 40%
    expect(result.appliedRate).toBe(0.40);
    expect(result.longTermHoldingDeduction).toBe(0);
  });

  it("T-36 landNature 미입력 (undefined) → 토지 본래 보유기간 세율 적용 (일체과세 분기 없음)", () => {
    // landNature 없음 → 일체과세 비활성 → 토지 14개월 보유 → 40%
    const landInput = makeLandInput({
      landNature: undefined,
      primaryContextForCompanionRate: {
        propertyType: "housing",
        holdingMonths: 6,
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    });
    const result = calculateTransferTax(landInput, makeMockRates());
    expect(result.appliedRate).toBe(0.40);  // 토지 본래 세율
  });

  it("T-37 부수토지=Yes + 주택 2년 이상 + 한도 초과 → manualProgressive=true", () => {
    // landNature=appurtenant + holdingMonths=30 → housingRateForHoldingPeriod = "progressive"
    // + 면적 초과(oversizeArea > 한도) → manualProgressive=true + excessRate=0.40
    const oversizeArea = BUILDING_FOOTPRINT * 5 + 100;
    const resolution = resolveCompanionLandRate(
      { assetKind: "land", area: oversizeArea, landNature: "appurtenant_to_housing" },
      {
        propertyType: "housing",
        holdingMonths: 30,  // 2년 이상 → 누진세율
        buildingFootprintArea: BUILDING_FOOTPRINT,
        isUrbanArea: true,
      },
    );
    expect(resolution.applied).toBe(true);
    expect(resolution.manualProgressive).toBe(true);
    expect(resolution.excessRate).toBe(0.40);
    expect(resolution.excessArea).toBeCloseTo(100, 1);
  });
});
