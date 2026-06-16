/**
 * 갭 3a — §168의11① 호별 면적기준 정밀판정 anchor
 *
 * 구 엔진은 isRelatedToResidenceOrBusiness 단일 boolean + 기간충족이면 면적 무관 전량 사업용.
 * §168의11①은 호별로 기준면적이 있고, 초과분은 비사업용(면적 안분)이어야 한다.
 * 면적기준 자동산출: 2호나목 ×1.5·4호 ×200㎡·7호 ×1.2·13호 660㎡ (KoreanLaw 본문 검증).
 */
import { describe, it, expect } from "vitest";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 500,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"), // 보유 10년 → 기간기준 충족(사업 0이라도 면적분기 진입은 호별 분기 우선)
    otherLand: {
      propertyTaxType: "comprehensive",
      hasBuilding: false,
      isRelatedToResidenceOrBusiness: false,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("갭 3a — §168의11① 호별 면적기준 정밀판정", () => {
  // [Pre-Do] 2호 가목 부설주차장 설치기준면적 초과분 비사업용.
  it("AT-AREA-PARKING: 부설주차장 2000㎡ · 설치기준 1200㎡ → 초과 800㎡ 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 2000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 1200,
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning).toEqual({
      totalArea: 2000,
      businessArea: 1200,
      nonBusinessArea: 800,
      nonBusinessRatio: 0.4,
      buildingMultiplier: 1,
    });
  });

  // 7호 하치장 매년 최대면적 ×120% 한도 초과분.
  it("AT-AREA-HATCHANG: 하치장 1500㎡ · 최대면적 1000㎡(×1.2=1200) → 초과 300㎡ 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1500,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "hatchang",
          maxAnnualArea: 1000,
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning).toEqual({
      totalArea: 1500,
      businessArea: 1200,
      nonBusinessArea: 300,
      nonBusinessRatio: 0.2,
      buildingMultiplier: 1,
    });
  });

  // 4호 청소년수련시설 수용정원 ×200㎡ 초과분.
  it("AT-AREA-YOUTH: 청소년수련시설 3000㎡ · 정원 10명(×200=2000) → 초과 1000㎡ 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 3000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "youth_training",
          youthCapacity: 10,
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(2000);
    expect(r.areaProportioning?.nonBusinessArea).toBe(1000);
  });

  // 2호 나목 업무용자동차 주차장 최저차고기준면적 ×1.5 초과분.
  it("AT-AREA-GARAGE: 업무용 주차장 900㎡ · 최저차고 400㎡(×1.5=600) → 초과 300㎡ 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 900,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "parking_garage",
          minGarageArea: 400,
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(600);
    expect(r.areaProportioning?.nonBusinessArea).toBe(300);
  });

  // 13호 무주택1세대 나지 660㎡ 한도: 이내는 전량 사업용, 초과는 안분.
  it("AT-AREA-VACANT-WITHIN: 나지 500㎡ ≤ 660㎡ → 전량 사업용(안분 없음)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 500,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "vacant_lot_1household",
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
  });

  it("AT-AREA-VACANT-OVER: 나지 800㎡ > 660㎡ → 초과 140㎡ 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 800,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "vacant_lot_1household",
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(660);
    expect(r.areaProportioning?.nonBusinessArea).toBe(140);
  });

  // 14호 유사토지 — 면적기준 없음, boolean 유지(전량 사업용). 회귀 보호.
  it("AT-AREA-ETC14: etc_14호 + 기간충족 → 전량 사업용(면적 안분 없음)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 5000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "etc_14호",
        },
      }),
      R,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
  });
});

// ============================================================
// F2 Phase A — 별표3(체육시설)·별표6(예비군) 자동 기준면적 lookup
// 별표3·6 정본 실측(KoreanLaw mst=286379 §83의4①④⑨⑩ · 별표3·6).
// ============================================================
describe("F2 Phase A — 별표3·6 자동 기준면적 (체육시설·예비군)", () => {
  // [Pre-Do] 별표3 실외 축구장 11,000㎡ 자동 lookup → 초과분 비사업용.
  it("AT-F2-SPORTS-SOCCER: 체육시설 축구장 12,000㎡ · 별표3 기준 11,000 → 초과 1,000 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 12000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsFacilityType: "soccer",
        } as never,
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(11000);
    expect(r.areaProportioning?.nonBusinessArea).toBe(1000);
  });

  // 별표3 실내 수영장 1,000㎡ lookup.
  it("AT-F2-SPORTS-SWIM: 실내 수영장 1,500㎡ · 별표3 기준 1,000 → 초과 500 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1500,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsFacilityType: "swimming",
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(1000);
    expect(r.areaProportioning?.nonBusinessArea).toBe(500);
  });

  // 별표6 예비군 부대편성 le2400 [전술교육장 30,000 + 사격장 2,475] = 32,475 합산.
  it("AT-F2-RESERVE: 예비군 le2400 [전술교육장+사격장] 50,000㎡ → 기준 32,475 초과", () => {
    const r = judgeOtherLand(
      base({
        landArea: 50000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "reserve_forces",
          reserveForcesUnitSize: "le2400",
          reserveForcesFacilities: ["tactical", "range"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(32475);
  });

  // fallback: sports 종목 미선택 + standardAreaLimit 직접입력 유지 (3중 fallback).
  it("AT-F2-SPORTS-FALLBACK: sports 종목 미선택 + standardAreaLimit 3,000 → 직접입력 유지", () => {
    const r = judgeOtherLand(
      base({
        landArea: 5000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          standardAreaLimit: 3000,
        },
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(3000);
    expect(r.areaProportioning?.nonBusinessArea).toBe(2000);
  });
});
