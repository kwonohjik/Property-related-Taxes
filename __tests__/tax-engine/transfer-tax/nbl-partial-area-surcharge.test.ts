/**
 * F3 — 비사업용 토지 부분 면적안분 중과 (목장 §168의10③·기타토지 §168의11①)
 *
 * 기준면적 초과분만 비사업용(중과), 이내분은 사업용(일반세율).
 * 판정 엔진이 산출하는 areaProportioning.nonBusinessRatio를 본 세액 계산에 연결 →
 * 중과분(+10%p)만 면적비율 안분. 누진 기본세액은 전체 taxBase. ratio=1이면 회귀.
 *
 * 동일 양도가/취득가(taxBase 동일)에서 전량 비사업용(나대지 ratio=1) vs
 * 목장 면적초과(ratio=0.333) 의 calculatedTax 비교로 부분안분 실증.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land";
import { makeMockRates, baseTransferInput as baseInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

const common = {
  propertyType: "land" as const,
  transferPrice: 500_000_000,
  acquisitionPrice: 200_000_000,
  acquisitionDate: new Date("2020-01-01"),
  transferDate: new Date("2025-01-01"),
  isOneHousehold: false,
  isNonBusinessLand: false,
};

// 전량 비사업용 — 나대지 사용현황 미입력 → 면적안분 없음 (ratio = 1)
const vacantLotNbl: NonBusinessLandInput = {
  landType: "vacant_lot",
  landArea: 1000,
  zoneType: "residential",
  acquisitionDate: new Date("2020-01-01"),
  transferDate: new Date("2025-01-01"),
  businessUsePeriods: [],
  gracePeriods: [],
};

// 목장 기준면적 1,000㎡·보유 1,500㎡ → 초과분 500㎡ 비사업용 (nonBusinessRatio = 0.3333)
const pastureOverAreaNbl: NonBusinessLandInput = {
  landType: "pasture",
  landArea: 1500,
  zoneType: "residential",
  acquisitionDate: new Date("2020-01-01"),
  transferDate: new Date("2025-01-01"),
  pasture: {
    isLivestockOperator: true,
    standardArea: 1000,
    livestockPeriods: [{ startDate: new Date("2020-01-02"), endDate: new Date("2025-01-01"), usageType: "축산" }],
  },
  businessUsePeriods: [],
  gracePeriods: [],
};

// 기타토지 §101①2호나목 footprint carve-out — 2% 미달·바닥면적 200㎡·부속토지 1,000㎡ → 잔여 800㎡ 비사업용 (ratio 0.8)
const footprintCarveoutNbl: NonBusinessLandInput = {
  landType: "other_land",
  landArea: 1000,
  zoneType: "residential",
  acquisitionDate: new Date("2020-01-01"),
  transferDate: new Date("2025-01-01"),
  otherLand: {
    propertyTaxType: "comprehensive",
    hasBuilding: true,
    buildingStandardValue: 5_000_000,
    landStandardValue: 1_000_000_000, // 2% = 20M, 5M < 20M → 2% 미달
    buildingFloorArea: 200,
    isRelatedToResidenceOrBusiness: false,
  },
  businessUsePeriods: [],
  gracePeriods: [],
};

// 기타토지 §168의11⑥1호 복합용도 — 특정용도분 연면적 300/전체 1000 → 부속토지 30% 사업용·70% 비사업용 (ratio 0.7)
const mixedUseNbl: NonBusinessLandInput = {
  landType: "other_land",
  landArea: 1000,
  zoneType: "residential",
  acquisitionDate: new Date("2018-01-01"),
  transferDate: new Date("2025-01-01"),
  otherLand: {
    propertyTaxType: "comprehensive",
    hasBuilding: true,
    isRelatedToResidenceOrBusiness: true,
    mixedUseBuildingMode: "single_building",
    specificUseFloorArea: 300,
    totalFloorArea: 1000,
  },
  businessUsePeriods: [],
  gracePeriods: [],
};

describe("F3 — 비사업용 토지 부분 면적안분 중과 (목장 §168의10③·기타토지 §168의11①)", () => {
  it("AT-F3-1: 목장 면적초과 33.3% → 중과분만 안분 (전량 비사업용보다 세액 작음)", () => {
    const refFull = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: vacantLotNbl }), mockRates);
    const testPartial = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: pastureOverAreaNbl }), mockRates);

    expect(refFull.surchargeType).toBe("non_business_land");
    expect(testPartial.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(true);
    expect(testPartial.nonBusinessLandJudgmentDetail!.areaProportioning!.nonBusinessRatio).toBeCloseTo(0.3333, 3);
    // 부분안분(중과분 33.3%) < 전량중과 (동일 taxBase·동일 LTHD)
    expect(testPartial.calculatedTax).toBeLessThan(refFull.calculatedTax);
  });

  it("AT-F3-2: 전량 비사업용(ratio=1) 중과는 회귀 불변 (전체 +10%p)", () => {
    const refFull = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: vacantLotNbl }), mockRates);
    expect(refFull.surchargeRate).toBe(0.1);
    expect(refFull.surchargeType).toBe("non_business_land");
  });

  it("AT-F3-7: 부분안분 surcharge.nonBusinessAreaRatio 노출 (목장 0.3333)", () => {
    const testPartial = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: pastureOverAreaNbl }), mockRates);
    expect(testPartial.nonBusinessLandJudgmentDetail!.surcharge.nonBusinessAreaRatio).toBeCloseTo(0.3333, 3);
  });

  it("AT-A-N6: §101①2호나목 footprint carve-out 80% → 중과분만 안분 (전량 비사업용보다 세액 작음)", () => {
    const refFull = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: vacantLotNbl }), mockRates);
    const testFootprint = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: footprintCarveoutNbl }), mockRates);

    expect(testFootprint.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(true);
    expect(testFootprint.nonBusinessLandJudgmentDetail!.areaProportioning!.nonBusinessRatio).toBeCloseTo(0.8, 3);
    expect(testFootprint.nonBusinessLandJudgmentDetail!.surcharge.nonBusinessAreaRatio).toBeCloseTo(0.8, 3);
    // 바닥면적분(200㎡) 별도합산 유지 → 중과분 80%만 안분 → 전량중과보다 세액 작음
    expect(testFootprint.calculatedTax).toBeLessThan(refFull.calculatedTax);
  });

  it("AT-B-M6: §168의11⑥ 복합용도 안분 70% → 중과분만 안분 (전량 비사업용보다 세액 작음)", () => {
    const refFull = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: vacantLotNbl }), mockRates);
    const testMixed = calculateTransferTax(baseInput({ ...common, nonBusinessLandDetails: mixedUseNbl }), mockRates);

    expect(testMixed.nonBusinessLandJudgmentDetail!.isNonBusinessLand).toBe(true);
    expect(testMixed.nonBusinessLandJudgmentDetail!.areaProportioning!.nonBusinessRatio).toBeCloseTo(0.7, 3);
    expect(testMixed.nonBusinessLandJudgmentDetail!.areaProportioning!.mixedUseBuildingRatio).toBeCloseTo(0.3, 3);
    expect(testMixed.nonBusinessLandJudgmentDetail!.surcharge.nonBusinessAreaRatio).toBeCloseTo(0.7, 3);
    // 특정용도분(30%)만 사업용 → 중과분 70%만 안분 → 전량중과보다 세액 작음
    expect(testMixed.calculatedTax).toBeLessThan(refFull.calculatedTax);
  });
});
