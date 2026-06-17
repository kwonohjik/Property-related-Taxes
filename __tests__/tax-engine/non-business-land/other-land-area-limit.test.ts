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

// ============================================================
// F2 Phase B (B-1) — 별표4(운동경기업)·별표5(종업원) 체육시설 유형 분기
// 별표4·5 정본 실측(KoreanLaw mst=286379 §83의4③④ · 별표4·5).
// ============================================================
describe("F2 Phase B (B-1) — 별표4·5 체육시설 유형 분기", () => {
  // [Pre-Do] 별표4 운동경기업 축구장 16,500㎡ 자동 lookup → 초과분 비사업용.
  it("AT-F2B-1: business 축구장 18,000㎡ · 별표4 기준 16,500 → 초과 1,500 비사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 18000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "business",
          sportsFacilityType: "soccer",
        } as never,
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(16500);
    expect(r.areaProportioning?.nonBusinessArea).toBe(1500);
  });

  // 별표5 종업원 운동장 선형보간 (300인 → 1,000+200×9=2,800).
  it("AT-F2B-2a: employee [field] 300인 → 2,800 (선형보간)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 5000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "employee",
          employeeCount: 300,
          employeeFacilityKinds: ["field"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(2800);
  });

  // 별표5 선형보간 600인 → 4,600+100×3=4,900.
  it("AT-F2B-2b: employee [field] 600인 → 4,900 (선형보간)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 6000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "employee",
          employeeCount: 600,
          employeeFacilityKinds: ["field"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(4900);
  });

  // 비고2: 종업원 50인 이하 → 코트면적만(970), field 무시.
  it("AT-F2B-3: employee [field] 40인(≤50) → 970 (코트강제)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 2000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "employee",
          employeeCount: 40,
          employeeFacilityKinds: ["field"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(970);
  });

  // 보유시설 합산: [field, court] 600인 → 4,900+1,940=6,840.
  it("AT-F2B-9: employee [field,court] 600인 → 6,840 (합산)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 8000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "employee",
          employeeCount: 600,
          employeeFacilityKinds: ["field", "court"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(6840);
  });

  // 회귀: workplace(별표3) 축구장 → 11,000 불변 (Phase A).
  it("AT-F2B-4: workplace 축구장 → 11,000 (별표3 회귀)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 12000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "soccer",
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(11000);
  });

  // sportsCategory 미설정 → workplace default(별표3 11,000) 회귀.
  it("AT-F2B-4b: sportsCategory 미설정 축구장 → 11,000 (default workplace)", () => {
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
    expect(r.areaProportioning?.businessArea).toBe(11000);
  });

  // fallback: employee 시설 미선택 + standardAreaLimit 직접입력.
  it("AT-F2B-7: employee 시설 미선택 + standardAreaLimit 3,000 → 직접입력", () => {
    const r = judgeOtherLand(
      base({
        landArea: 5000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "employee",
          standardAreaLimit: 3000,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(3000);
  });
});

// ============================================================
// F2 Phase B (B-3) — 6호 휴양시설 §83의4⑫ 3요소 합산
// (옥외 방목장·식물원 + 부설주차장×2 + 건축물 부속토지). KoreanLaw mst=286379 §83의4⑫ 실측.
// ============================================================
describe("F2 Phase B (B-3) — 6호 휴양 3요소 합산", () => {
  // [Pre-Do] 옥외 5,000 + 부설주차 1,000(×2) + 건축물 부속 2,000 = 9,000.
  it("AT-F2B-6: resort 옥외5000+주차1000(×2)+건축2000 → 기준 9,000, landArea 12,000 초과 3,000", () => {
    const r = judgeOtherLand(
      base({
        landArea: 12000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "resort",
          resortOutdoorArea: 5000,
          resortParkingStdArea: 1000,
          resortBuildingAttachedArea: 2000,
        } as never,
      }),
      R,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(9000);
    expect(r.areaProportioning?.nonBusinessArea).toBe(3000);
  });

  // 부분 입력: 부설주차장만 1,500(×2=3,000).
  it("AT-F2B-6c: resort 주차장만 1,500(×2) → 3,000", () => {
    const r = judgeOtherLand(
      base({
        landArea: 5000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "resort",
          resortParkingStdArea: 1500,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(3000);
  });

  // fallback: 3요소 미입력 + standardAreaLimit 직접입력 유지(회귀).
  it("AT-F2B-6b: resort 3요소 미입력 + standardAreaLimit 8,000 → 직접입력 유지", () => {
    const r = judgeOtherLand(
      base({
        landArea: 10000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "resort",
          standardAreaLimit: 8000,
        },
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(8000);
  });
});

// ============================================================
// F2 Phase B (B-2) — 선수가산(테니스·연식정구)·실내미설치 (별표3·4 비고)
// 별표3 비고5(483㎡)·별표4 비고4(725㎡)·별표3 비고4(실내미설치 800). KoreanLaw mst=286379 실측.
// ============================================================
describe("F2 Phase B (B-2) — 선수가산·실내미설치", () => {
  // [Pre-Do] 별표3 비고5: 선수 2인 초과 2인마다 483㎡ 가산.
  it("AT-F2B-5a: workplace 테니스 6인 → 650+2×483=1,616", () => {
    const r = judgeOtherLand(
      base({
        landArea: 3000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "tennis",
          sportsPlayerCount: 6,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(1616);
  });

  // 별표4 비고4: 선수 2인 초과 2인마다 725㎡ 가산.
  it("AT-F2B-5b: business 테니스 6인 → 975+2×725=2,425", () => {
    const r = judgeOtherLand(
      base({
        landArea: 4000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "business",
          sportsFacilityType: "tennis",
          sportsPlayerCount: 6,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(2425);
  });

  // 별표3 비고4: 실내 운동경기부 시설 미설치 → 800㎡(workplace).
  it("AT-F2B-5c: workplace 실내(수영) 미설치 → 800", () => {
    const r = judgeOtherLand(
      base({
        landArea: 2000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "swimming",
          indoorNotInstalled: true,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(800);
  });

  // 선수 2인 이하 → 가산 없음(회귀).
  it("AT-F2B-5d: workplace 테니스 2인 → 가산 없음 650", () => {
    const r = judgeOtherLand(
      base({
        landArea: 3000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "tennis",
          sportsPlayerCount: 2,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(650);
  });

  // 종목합산(비고2 원칙): 합산이 default·5종목군만 max1. 법 근거 없이 불리(단일만) 적용 금지.
  it("AT-F2B-AGG-1: workplace 축구+테니스 → 11,000+650=11,650(합산)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 13000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "soccer",
          sportsExtraEvents: ["tennis"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(11650);
  });

  it("AT-F2B-AGG-2: workplace 축구+야구 → max(11,000,14,000)=14,000(비고2 5종목군 max1)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 16000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "soccer",
          sportsExtraEvents: ["baseball"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(14000);
  });

  it("AT-F2B-AGG-3: workplace 축구+야구+테니스 → 14,000(군max)+650=14,650", () => {
    const r = judgeOtherLand(
      base({
        landArea: 16000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "soccer",
          sportsExtraEvents: ["baseball", "tennis"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(14650);
  });

  it("AT-F2B-AGG-4: business 축구+테니스 → 16,500+975=17,475(별표4 합산)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 19000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "business",
          sportsFacilityType: "soccer",
          sportsExtraEvents: ["tennis"],
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(17475);
  });
});

// ============================================================
// F2 Phase B — §101② 용도지역별 배율 자동(지방세법 시행령 §101② 정본: 전용주거5·준주거상업3·일반주거공업4·녹지7·미계획4·도시외7)
// 6호 휴양 3호: 건축물 바닥면적 × zoneType 배율.
// ============================================================
describe("F2 Phase B — §101② 용도지역별 배율 자동 (6호 3호)", () => {
  // [Pre-Do] 일반주거(4배): 건물 바닥 1,000 × 4 = 4,000 + 옥외 2,000 = 6,000.
  it("AT-F2B-ZONE-1: resort 옥외2000+건물바닥1000×4배(일반주거) → 6,000", () => {
    const r = judgeOtherLand(
      base({
        landArea: 8000,
        zoneType: "general_residential",
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "resort",
          resortOutdoorArea: 2000,
          resortBuildingFloorArea: 1000,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(6000);
  });

  // 녹지지역 7배: 건물 바닥 1,000 × 7 = 7,000.
  it("AT-F2B-ZONE-2: resort 건물바닥1000×7배(녹지) → 7,000", () => {
    const r = judgeOtherLand(
      base({
        landArea: 9000,
        zoneType: "green",
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "resort",
          resortBuildingFloorArea: 1000,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(7000);
  });

  // residential(§101② 6구분 외) → 배율 자동 제외, resortBuildingAttachedArea 직접입력 fallback.
  it("AT-F2B-ZONE-3: residential(매핑불가)+바닥1000 → 직접입력(attachedArea 3000) fallback", () => {
    const r = judgeOtherLand(
      base({
        landArea: 5000,
        zoneType: "residential",
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "resort",
          resortBuildingFloorArea: 1000,
          resortBuildingAttachedArea: 3000,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(3000);
  });
});

// ============================================================
// F2 Phase B — 실내 종목 부속토지 §101② 배율 (별표3·4·5 비고1·3): min(바닥, 표값) × 배율
// ============================================================
describe("F2 Phase B — 실내 부속토지 §101② 배율 (비고1·3)", () => {
  // [Pre-Do] 수영(표값 1000) · 바닥 800 · 녹지 7배 → min(800,1000)×7 = 5,600.
  it("AT-F2B-INDOOR-1: workplace 수영 바닥800 × 녹지7배 → 5,600", () => {
    const r = judgeOtherLand(
      base({
        landArea: 8000,
        zoneType: "green",
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "swimming",
          indoorFloorArea: 800,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(5600);
  });

  // 바닥 1500 > 표값 1000 → min=1000 × 4배(일반주거) = 4,000.
  it("AT-F2B-INDOOR-2: 바닥1500>표값1000 → min(1000)×4배(일반주거) = 4,000", () => {
    const r = judgeOtherLand(
      base({
        landArea: 6000,
        zoneType: "general_residential",
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "swimming",
          indoorFloorArea: 1500,
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(4000);
  });

  // indoorFloorArea 미입력 → 표값 1000 (회귀, Phase A 유지).
  it("AT-F2B-INDOOR-3: 수영 바닥 미입력 → 표값 1,000 (회귀)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1500,
        zoneType: "general_residential",
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: false,
          relatedBusinessType: "sports",
          sportsCategory: "workplace",
          sportsFacilityType: "swimming",
        } as never,
      }),
      R,
    );
    expect(r.areaProportioning?.businessArea).toBe(1000);
  });
});
