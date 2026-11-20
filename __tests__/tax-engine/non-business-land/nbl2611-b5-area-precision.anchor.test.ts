/**
 * NBL2611-B5 (R11) Pre-Do anchor — 면적 경계 정밀도 단일 헬퍼 (V9-I + 신규 #15·#23·#25) + 결정 Q-7.
 *
 * 결함: 면적 × 배율을 부동소수로 비교한다 — `33.3 × 3 = 99.89999999999999`라 «한도와 정확히 같은 토지(99.9㎡)»가
 *   초과(비사업용)로 뒤집힌다. 면적은 소수 2자리 입력이라 이 부류는 정수 배율에서 약 10%의 소수 시료에서 일어난다.
 *   비율은 4자리 반올림이라 «비사업용인데 비율 0» 모순이 생기고, 연접 다필지 면적 합은 입력 순서에 따라 값이 다르다.
 *
 * 이 파일은 «경계 시료(한도와 정확히 같은 면적)»의 판정·비율로 단언한다. 세액은 같은 세율 출처(모의 세율)의 독립 경로로만 비교한다.
 *
 *   시료 한도 (소수 2자리 면적 × 배율):
 *     · 100.1 × 3 = 300.29999999999995 (상업·준주거 3배 / 수도권 주·상·공 3배) → 한도 300.3㎡
 *     · 500.4 × 1.2 = 600.4799999999999 (하치장 §168의11① 연 최대 보관면적 × 1.2) → 한도 600.48㎡
 *     · 2015 양도(2016.1.1. 전) 경계 — 마스터에서 산출세액 257,010,000 vs 한도 이내 169,060,000 = +87,950,000 (리뷰 V9-I 실측과 일치, TX-2)
 *     · 57/800 = 0.07125 — 비율 4자리 반올림이 float 잡음으로 0.0712(정답 half-up 0.0713)
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { judgeBuildingSiteLand } from "@/lib/tax-engine/non-business-land/building-site-land";
import { judgeHousingLand } from "@/lib/tax-engine/non-business-land/housing-land";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { computeAreaProportioning } from "@/lib/tax-engine/non-business-land/utils/area-proportioning";
import { computeContiguousParcelNblAttribution } from "@/lib/tax-engine/non-business-land/utils/contiguous-parcel-proportioning";
import { judgeAppurtenantLandExcess } from "@/lib/tax-engine/appurtenant-land-excess";
import { calcExcessLandRatio } from "@/lib/tax-engine/transfer-tax-mixed-use-helpers";
import { appurtenantCardLimitShare } from "@/lib/tax-engine/appurtenant-land-rate";
import { areaTimes } from "@/lib/tax-engine/area-limit";
import { housingExcessAreaM2 } from "@/lib/tax-engine/housing-excess-split";
import { resolveAppurtenantLandExcess } from "@/lib/tax-engine/transfer-tax-appurtenant-land";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NblParcel, NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function nbl(over: Partial<NonBusinessLandInput>): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 300.3,
    zoneType: "commercial",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

describe("P-1 건물 부수토지(§101①2호) — 한도와 정확히 같은 면적", () => {
  it("BS-1: 바닥 100.1 × 3(상업) = 300.3 · 토지 300.3㎡ → 사업용·초과 0·비율 0", () => {
    const r = judgeBuildingSiteLand(nbl({ landType: "building_site", buildingFootprint: 100.1 }), R);
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning?.nonBusinessArea).toBe(0);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0);
  });

  it("BS-2: 한도 + 0.01㎡ → 비사업용 · 초과 정확히 0.01㎡ (부동소수 잡음 없음)", () => {
    const r = judgeBuildingSiteLand(nbl({ landType: "building_site", buildingFootprint: 100.1, landArea: 300.31 }), R);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(0.01);
  });

  it("BS-3: 공용 헬퍼 judgeAppurtenantLandExcess — 한도 300.3 · 이내 · 초과 0", () => {
    const j = judgeAppurtenantLandExcess({ landArea: 300.3, buildingFootprintArea: 100.1, zoneType: "commercial", context: "t" });
    expect(j.allowedLandArea).toBe(300.3);
    expect(j.isWithinLimit).toBe(true);
    expect(j.nonBusinessArea).toBe(0);
  });
});

describe("P-2 주택 부수토지(§168의12) — 한도와 정확히 같은 면적", () => {
  const housing = (over: Partial<NonBusinessLandInput> = {}) =>
    nbl({ landType: "housing_site", zoneType: "general_residential", housingFootprint: 100.1, isMetropolitanArea: true, ...over });

  it("HS-1: 정착 100.1 × 3(수도권 주거) = 300.3 · 토지 300.3㎡ → 사업용", () => {
    const r = judgeHousingLand(housing(), R);
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning?.nonBusinessArea).toBe(0);
  });

  it("HS-2: 한도 + 0.01㎡ → 초과 0.01㎡", () => {
    const r = judgeHousingLand(housing({ landArea: 300.31 }), R);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(0.01);
  });
});

describe("P-3 기타토지 — 나목 배율(Step 0.6) · 다목 호별 기준면적", () => {
  const sepOl = {
    propertyTaxType: "separate" as const,
    hasBuilding: true,
    buildingFloorArea: 100.1,
    buildingStandardValue: 500_000_000,
    landStandardValue: 1_000_000_000,
    isRelatedToResidenceOrBusiness: false,
  };

  it("OL-1: 별도합산 · 바닥 100.1 × 3 = 300.3 · 토지 300.3㎡ → 전량 사업용(별도합산 유지)", () => {
    const r = judgeOtherLand(nbl({ otherLand: sepOl }), R);
    expect(r.isBusiness).toBe(true);
  });

  it("OL-2: 하치장 연 최대 500.4 × 1.2 = 600.48 · 토지 600.48㎡ → 전량 사업용", () => {
    const r = judgeOtherLand(
      nbl({
        landArea: 600.48,
        zoneType: "green",
        otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, relatedBusinessType: "hatchang", maxAnnualArea: 500.4 },
      }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
  });

  it("OL-3: 하치장 한도 + 0.01㎡ → 비사업용 · 초과 0.01㎡", () => {
    const r = judgeOtherLand(
      nbl({
        landArea: 600.49,
        zoneType: "green",
        otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, relatedBusinessType: "hatchang", maxAnnualArea: 500.4 },
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(0.01);
  });
});

describe("P-3b 기타토지 — 나목(배율)과 다목(호별)이 동시에 걸릴 때", () => {
  it("DM-1: 나목 한도 100.1 × 3 = 300.3 = 토지 300.3㎡(전량 사업용) + 다목 부설주차장 200㎡(부분) → 넓은 쪽(나목) 채택 · 사업용", () => {
    const j = judgeNonBusinessLand(
      nbl({
        otherLand: {
          propertyTaxType: "separate",
          hasBuilding: true,
          buildingFloorArea: 100.1,
          buildingStandardValue: 500_000_000,
          landStandardValue: 1_000_000_000,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 200,
        },
      }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0);
  });
});

describe("P-4 비율 4자리 반올림 — half-up 정확 · Q-7(반올림 0이면 사업용)", () => {
  it("RT-1: 초과 57 / 전체 800 = 0.07125 → 0.0713 (float 잡음으로 0.0712가 되지 않는다)", () => {
    expect(computeAreaProportioning(800, 743).nonBusinessRatio).toBe(0.0713);
  });

  it("RT-2: Q-7 — 초과 0.10㎡ / 200,000.10㎡ = 5e-7 → 4자리 반올림 0 → 사업용 (비사업용인데 비율 0 모순 없음)", () => {
    const j = judgeNonBusinessLand(
      nbl({ landType: "building_site", zoneType: "exclusive_residential", buildingFootprint: 40000, landArea: 200000.1 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0);
    expect(j.surcharge.additionalRate).toBe(0);
  });

  it("RT-3: 대조군 — 초과 비율이 0.005% 이상(0.0001로 반올림)이면 비사업용 · 비율 0.0001", () => {
    // 초과 10㎡ / 100,010㎡ = 0.0000999… → 0.0001
    const j = judgeNonBusinessLand(
      nbl({ landType: "building_site", zoneType: "exclusive_residential", buildingFootprint: 20000, landArea: 100010 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.0001);
  });
});

describe("P-5 연접 다필지 — 면적 합이 입력 순서에 의존하지 않는다", () => {
  const parcel = (id: string, landArea: number, acq: string): NblParcel =>
    ({ id, landArea, acquisitionDate: d(acq), hasBuilding: false }) as NblParcel;
  const base = [parcel("a", 33.3, "2010-01-01"), parcel("b", 33.3, "2011-01-01"), parcel("c", 33.4, "2012-01-01"), parcel("d", 0.1, "2013-01-01"), parcel("e", 0.2, "2014-01-01")];
  const permute = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));

  it("CP-1: 합 100.3㎡ = 기준면적 100.3㎡ — 120가지 입력 순서 모두 초과 0", () => {
    const results = permute(base).map((ps) => computeContiguousParcelNblAttribution(ps, 100.3));
    expect(new Set(results.map((r) => r.totalArea)).size).toBe(1);
    expect(results.every((r) => r.totalArea === 100.3 && r.excessArea === 0 && r.nonBusinessArea === 0)).toBe(true);
  });
});

describe("P-6 GB·겸용·주택 분리 경로 — 같은 헬퍼의 한도", () => {
  it("GB-1: 주택 초과분(round2 경로) — 한도 정확히 같음 → 초과 0 (회귀 고정)", () => {
    expect(housingExcessAreaM2({ zone: "metropolitan_residential", footprintM2: 100.1, landAreaM2: 300.3, transferDate: d("2024-06-01") })).toBe(0);
  });

  it("GB-2: 겸용주택 calcExcessLandRatio — 정착 100.1 × 3 = 300.3 · 토지 300.3 → 초과 0 · 비율 0", () => {
    const res = calcExcessLandRatio(
      { zoneType: "general_residential", isMetropolitanArea: true } as never,
      { residentialFootprintArea: 100.1, residentialLandArea: 300.3 } as never,
      d("2024-06-01"),
    );
    expect(res.multiplier).toBe(3);
    expect(res.excessArea).toBe(0);
    expect(res.nonBizRatio).toBe(0);
  });

  it("GB-3: resolveAppurtenantLandExcess(주택 부수토지 G-2) — 한도 정확히 같음 → 초과 없음(null)", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferDate: d("2024-06-01"),
      isSeparateAcquisition: true,
      appurtenantLandZone: "metropolitan_residential",
      buildingFootprintArea: 100.1,
      acquisitionArea: 300.3,
    } as Partial<TransferTaxInput>);
    expect(resolveAppurtenantLandExcess(input)).toBeNull();
  });
});

describe("P-6b 함께 양도 부수토지 카드 — 남은 한도(한도 − 주택 카드 토지)와 정확히 같은 카드", () => {
  it("CS-1: 한도 300.3 − 주택 100.1 = 남은 200.2 · 부수토지 카드 200.2㎡ → 초과 0 (float는 200.19999999999996)", () => {
    const r = appurtenantCardLimitShare(areaTimes(100.1, 3), 200.2, { houseLandAreaM2: 100.1 });
    expect(r.excessArea).toBe(0);
    expect(r.limitArea).toBe(200.2);
  });

  it("CS-2: 카드 200.21㎡ → 초과 정확히 0.01㎡", () => {
    const r = appurtenantCardLimitShare(areaTimes(100.1, 3), 200.21, { houseLandAreaM2: 100.1 });
    expect(r.excessArea).toBe(0.01);
  });
});

describe("P-7 상가 STEP 0.62 — 한도와 정확히 같은 대지는 중과하지 않는다", () => {
  const rates = makeMockRates();
  const common = {
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    acquisitionDate: d("2014-06-01"),
    transferDate: d("2024-06-01"),
  };
  const cb = (cal: object) =>
    baseTransferInput({
      ...common,
      propertyType: "commercial_building",
      transferPrice: 1_200_000_000,
      acquisitionPrice: 600_000_000,
      commercialAppurtenantLand: cal,
    } as Partial<TransferTaxInput>);
  const basis = { acquisitionLandStd: 600_000_000, acquisitionBuildingStd: 400_000_000, transferLandStd: 600_000_000, transferBuildingStd: 400_000_000 };

  it("CB-1: 바닥 100.1 × 3(상업) = 300.3 · 대지 300.3㎡ → 비사업용 아님 · 세액은 초과 없는 같은 상가와 같다", () => {
    const edge = calculateTransferTax(cb({ totalLandArea: 300.3, totalBuildingFootprintArea: 100.1, zoneType: "commercial", partBasis: basis }), rates);
    const clearlyWithin = calculateTransferTax(cb({ totalLandArea: 300, totalBuildingFootprintArea: 100.1, zoneType: "commercial", partBasis: basis }), rates);
    expect(edge.calculatedTax).toBe(clearlyWithin.calculatedTax);
    expect(edge.steps.some((s) => s.label.includes("부수토지 기준면적 초과분 비사업용 판정"))).toBe(false);
  });
});

describe("P-8 세액 — 한도와 정확히 같은 토지는 한도 이내 토지와 같은 세액이다 (같은 모의 세율 출처)", () => {
  const rates = makeMockRates();
  const tax = (landArea: number, transferDate: string, acquisitionDate: string, zoneType = "commercial", footprint = 100.1) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: d(acquisitionDate),
        transferDate: d(transferDate),
        isOneHousehold: false,
        nonBusinessLandDetails: nbl({
          landType: "building_site",
          zoneType: zoneType as never,
          buildingFootprint: footprint,
          landArea,
          acquisitionDate: d(acquisitionDate),
          transferDate: d(transferDate),
        }),
      }),
      rates,
    );

  it("TX-1: 2024 양도 — 경계(300.3㎡)와 한도 이내(300㎡)의 산출세액이 같다", () => {
    expect(tax(300.3, "2024-06-01", "2014-06-01").calculatedTax).toBe(tax(300, "2024-06-01", "2014-06-01").calculatedTax);
  });

  it("TX-2: 2015 양도(2016.1.1. 전 — 비사업용이면 장특 배제 연혁) — 경계와 한도 이내가 같은 세액이다", () => {
    expect(tax(300.3, "2015-06-01", "2005-06-01").calculatedTax).toBe(tax(300, "2015-06-01", "2005-06-01").calculatedTax);
  });

  it("TX-3: 대조군 — 한도를 실제로 크게 넘으면(1,000㎡ · 초과 비율 0.7) 세액이 커진다 (비교가 항상 같은 값이 아님)", () => {
    expect(tax(1000, "2024-06-01", "2014-06-01").calculatedTax).toBeGreaterThan(tax(300, "2024-06-01", "2014-06-01").calculatedTax);
  });
});
