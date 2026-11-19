/**
 * NBL2611-B2 (R06) Pre-Do anchor — 결과 표시 정합의 엔진 echo.
 *   V10-P  `periodEvaluation`(기간기준 처리 방식) · `areaProportioning.legalBasis`(면적 안분 근거) echo
 *   V10-K  판정 사유·단계의 enum 원문 제거 · 재산세 분류 단계의 근거 = 법 §104의3①4호 가·나목
 *   V2-PR04(B1 인계)  별도합산 기타토지가 소유일수 0으로 비사업용이 될 때 사유가 「종합합산」으로 오표기
 *   V4-R   영 §168의12 후단 수용 용도지역 기준일 고지
 *   V8-VL04 별장 부속토지 범위 고지
 *   V2-C2  양도일 현재 상태 일괄 적용 고지(기타토지·주택부수토지·별장)
 * 세액 계약(`isNonBusinessLand`·`nonBusinessAreaRatio`)은 불변이다 — 아래 «불변» 단언.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ENUM_RAW = /\b(separate|special_sum|comprehensive|exempt)\b/;

function housing(over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "housing_site",
    landArea: 1000,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    housingFootprint: 100,
    isMetropolitanArea: false,
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  };
}

function other(over: Partial<NonBusinessLandInput> = {}, ol: Partial<NonNullable<NonBusinessLandInput["otherLand"]>> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 500,
    zoneType: "general_residential",
    acquisitionDate: d("2008-01-01"),
    transferDate: d("2024-06-01"),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, ...ol },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  };
}

describe("V10-P — periodEvaluation echo", () => {
  it("주택부수토지(배율 초과): not_judged + 근거 영 §168의12", () => {
    const j = judgeNonBusinessLand(housing(), R);
    expect(j.periodEvaluation).toEqual({ basis: "not_judged", legalBasis: [NBL.HOUSING_MULTIPLIER] });
  });

  it("주택부수토지(배율 이내): not_judged", () => {
    const j = judgeNonBusinessLand(housing({ landArea: 300 }), R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.periodEvaluation?.basis).toBe("not_judged");
  });

  it("기타토지: 사업용·비사업용 모두 state_at_transfer (소유기간 전체에 양도일 상태 적용)", () => {
    const nonBiz = judgeNonBusinessLand(other(), R);
    expect(nonBiz.isNonBusinessLand).toBe(true);
    expect(nonBiz.periodEvaluation?.basis).toBe("state_at_transfer");
    const biz = judgeNonBusinessLand(other({}, { propertyTaxType: "separate", hasBuilding: true, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 }), R);
    expect(biz.isNonBusinessLand).toBe(false);
    expect(biz.periodEvaluation?.basis).toBe("state_at_transfer");
  });

  it("농지(자경 기간으로 기간기준 판정): usage_periods", () => {
    const j = judgeNonBusinessLand(
      {
        landType: "farmland", landArea: 1000, zoneType: "agriculture_forest",
        acquisitionDate: d("2015-01-01"), transferDate: d("2024-01-01"),
        farmingSelf: true, businessUsePeriods: [], gracePeriods: [],
      } as NonBusinessLandInput,
      R,
    );
    expect(j.periodEvaluation?.basis).toBe("usage_periods");
  });

  it("무조건 사업용 의제로 조기 확정: not_judged", () => {
    const j = judgeNonBusinessLand(
      {
        landType: "farmland", landArea: 1000, zoneType: "agriculture_forest",
        acquisitionDate: d("1985-01-01"), transferDate: d("2009-06-01"),
        businessUsePeriods: [], gracePeriods: [],
        unconditionalExemption: { ownedOver20YearsBefore2007: true },
      } as NonBusinessLandInput,
      R,
    );
    expect(j.unconditionalExemption?.isApplied).toBe(true);
    expect(j.periodEvaluation?.basis).toBe("not_judged");
  });

  it("별장 농어촌주택 경로(전 기간 일괄): state_at_transfer · 재분류 경로(주택부수 판정): not_judged", () => {
    const rural = judgeNonBusinessLand(
      {
        landType: "villa_land", landArea: 500, zoneType: "agriculture_forest",
        acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
        villa: {
          villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }],
          isEupMyeon: true, isRuralHousing: true, buildingFloorArea: 140, attachedLandArea: 600, combinedStdValue: 180_000_000, isInRestrictedArea: false,
        },
        businessUsePeriods: [], gracePeriods: [],
      },
      R,
    );
    expect(rural.isNonBusinessLand).toBe(false);
    expect(rural.periodEvaluation?.basis).toBe("state_at_transfer");

    const redirected = judgeNonBusinessLand(
      {
        landType: "villa_land", landArea: 500, zoneType: "general_residential",
        acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
        housingFootprint: 100, isMetropolitanArea: false,
        villa: { villaUsePeriods: [], isEupMyeon: false, isRuralHousing: false },
        businessUsePeriods: [], gracePeriods: [],
      },
      R,
    );
    expect(redirected.periodEvaluation?.basis).toBe("not_judged");
  });
});

describe("V10-P — areaProportioning.legalBasis echo (영 §168의12 · 「지방세법 시행령」 §101①2호 본문 포함)", () => {
  it("주택부수토지: 영 §168의12", () => {
    const j = judgeNonBusinessLand(housing(), R);
    expect(j.areaProportioning?.legalBasis).toEqual([NBL.HOUSING_MULTIPLIER]);
    expect(j.areaProportioning?.legalBasis?.join()).toContain("§168조의12");
  });

  it("기타토지 건물 부수토지 배율 초과: 「지방세법 시행령」 §101①2호", () => {
    const j = judgeNonBusinessLand(
      other({ landArea: 1000 }, { propertyTaxType: "separate", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.areaProportioning?.legalBasis).toEqual([NBL.BUILDING_SITE_MULTIPLIER]);
  });

  it("기타토지 2% 미달 바닥면적 안분: 「지방세법 시행령」 §101①2호 나목", () => {
    const j = judgeNonBusinessLand(
      other({ landArea: 1000 }, { propertyTaxType: "separate", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 1_000_000, landStandardValue: 100_000_000 }),
      R,
    );
    expect(j.areaProportioning?.legalBasis).toEqual([NBL.OTHER_LAND_FOOTPRINT_CARVEOUT]);
  });

  it("안분이 없는 판정은 legalBasis도 없다", () => {
    const j = judgeNonBusinessLand(other(), R);
    expect(j.areaProportioning).toBeUndefined();
  });

  it("불변 — 두 값 계약(비사업용 여부·면적 비율)은 echo와 무관하다", () => {
    const j = judgeNonBusinessLand(housing(), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.nonBusinessAreaRatio).toBeCloseTo(0.5, 4);
    expect(j.areaProportioning?.nonBusinessRatio).toBeCloseTo(0.5, 4);
  });
});

describe("V10-K — 사유·단계 문구의 enum 원문 제거, 재산세 분류 근거", () => {
  const cases: Array<[string, NonBusinessLandInput]> = [
    ["종합합산 선언", other()],
    ["별도합산 선언(건축물 2% 이상 · 배율 이내)", other({ landArea: 300 }, { propertyTaxType: "separate", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 })],
    ["분리과세 선언(건축물 있음)", other({}, { propertyTaxType: "special_sum", hasBuilding: true, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 })],
    ["비과세·면제 선언(건축물 있음)", other({}, { propertyTaxType: "exempt", hasBuilding: true, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 })],
  ];
  it.each(cases)("%s — judgmentReason·steps.detail에 enum 원문이 없다", (_n, input) => {
    const j = judgeNonBusinessLand(input, R);
    expect(j.judgmentReason).not.toMatch(ENUM_RAW);
    for (const st of j.judgmentSteps) expect(`${st.label} ${st.detail}`).not.toMatch(ENUM_RAW);
  });

  it("분리과세 선언 사업용 사유는 한국어 라벨을 쓴다", () => {
    const j = judgeNonBusinessLand(
      other({}, { propertyTaxType: "special_sum", hasBuilding: true, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.judgmentReason).toContain(PROPERTY_TAX_TYPE_LABEL.special_sum);
  });

  it("재산세 분류 단계(other_bare_land · other_tax_type_criteria)의 근거는 법 §104의3①4호 가·나목이다 (다목 위임조문 아님)", () => {
    const j = judgeNonBusinessLand(
      other({}, { propertyTaxType: "separate", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 }),
      R,
    );
    for (const id of ["other_bare_land", "other_tax_type_criteria"]) {
      const st = j.judgmentSteps.find((s) => s.id === id);
      expect(st, id).toBeDefined();
      expect(st?.legalBasis).toBe(NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION);
      expect(st?.legalBasis).not.toBe(NBL.OTHER_LAND);
    }
  });

  it("수입금액비율 충족 사유도 업종 enum 원문 대신 한국어 라벨을 쓴다", () => {
    const j = judgeNonBusinessLand(
      other({ revenueTest: { businessType: "parking_operation", currentRevenue: 50_000_000, currentLandValue: 100_000_000 } }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.judgmentReason).toContain("주차장운영업");
    expect(j.judgmentReason).not.toContain("parking_operation");
  });

  it("V2-PR04 인계 — 별도합산 선언이 소유일수 0(의제일=취득일)으로 비사업용이 돼도 사유는 「종합합산」이 아니다", () => {
    const j = judgeNonBusinessLand(
      other(
        { landArea: 300, deemedTransferReason: "auction", deemedTransferDate: d("2008-01-01") },
        { propertyTaxType: "separate", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000 },
      ),
      R,
    );
    expect(j.isNonBusinessLand).toBe(true); // 판정(세액)은 불변 — 고지·사유만 바로잡는다
    expect(j.judgmentReason).not.toContain("종합합산");
    expect(j.judgmentReason).toContain(PROPERTY_TAX_TYPE_LABEL.separate);
    expect(j.judgmentReason).toContain("기간기준 미충족");
  });
});

describe("V4-R — 영 §168의12 후단 수용 용도지역 기준일 고지 (주택부수토지 경로)", () => {
  const expr = (transferDate: string) =>
    housing({
      acquisitionDate: d("2024-06-01"), // 고시일(2025-03-01)부터 5년 이내 취득 → 무조건 의제 불성립 → 배율 판정 진행
      transferDate: d(transferDate),
      unconditionalExemption: { isPublicExpropriation: true, publicNoticeDate: d("2025-03-01") },
    });
  it("수용 + 양도일 2025.11.28. 이후 → 「사업인정 고시일 전날 현재 해당 토지의 용도지역」 고지", () => {
    const j = judgeNonBusinessLand(expr("2026-02-01"), R);
    expect(j.warnings.some((w) => w.includes("사업인정 고시일 전날 현재 해당 토지의 용도지역") && w.includes("확인 필요"))).toBe(true);
  });
  it("양도일이 시행일(2025.11.28.) 전이면 고지하지 않는다 (부칙 제35878호 제2조)", () => {
    const j = judgeNonBusinessLand(expr("2025-11-27"), R);
    expect(j.warnings.some((w) => w.includes("사업인정 고시일 전날"))).toBe(false);
  });
  it("수용이 아니면 고지하지 않는다", () => {
    const j = judgeNonBusinessLand(housing({ transferDate: d("2026-02-01") }), R);
    expect(j.warnings.some((w) => w.includes("사업인정 고시일 전날"))).toBe(false);
  });
  it("사업인정 고시일 이후에 취득한 토지는 후단의 대상이 아니다(「사업인정 고시일 전에 취득한 경우로 한정」)", () => {
    const j = judgeNonBusinessLand(
      housing({
        acquisitionDate: d("2025-06-01"), transferDate: d("2026-02-01"),
        unconditionalExemption: { isPublicExpropriation: true, publicNoticeDate: d("2025-03-01") },
      }),
      R,
    );
    expect(j.warnings.some((w) => w.includes("사업인정 고시일 전날"))).toBe(false);
  });
});

describe("V8-VL04 · V2-C2 — 고지", () => {
  const villaRural = (): NonBusinessLandInput => ({
    landType: "villa_land", landArea: 500, zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
    villa: {
      villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }],
      isEupMyeon: true, isRuralHousing: true, buildingFloorArea: 140, attachedLandArea: 600, combinedStdValue: 180_000_000, isInRestrictedArea: false,
    },
    businessUsePeriods: [], gracePeriods: [],
  });

  it("별장: 부속토지 경계 불명확 시 바닥면적 10배 — 판정하지 않았다는 고지 (법 §104의3①6호 후단)", () => {
    const j = judgeNonBusinessLand(villaRural(), R);
    const w = j.warnings.find((x) => x.includes("바닥면적의 10배"));
    expect(w).toBeDefined();
    expect(w).toContain("확인 필요");
    expect(w).toContain(`${NBL.MAIN} ① 6호`);
  });

  it.each([
    ["기타토지", judgeNonBusinessLand(other(), R)],
    ["주택부수토지", judgeNonBusinessLand(housing(), R)],
    ["별장(농어촌주택 경로)", judgeNonBusinessLand(villaRural(), R)],
  ] as const)("%s: 양도일 현재 상태 일괄 적용 고지(C1 상수 재사용)", (_n, j) => {
    expect(j.warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it("농지(기간 판정 지목)에는 달지 않는다", () => {
    const j = judgeNonBusinessLand(
      {
        landType: "farmland", landArea: 1000, zoneType: "agriculture_forest",
        acquisitionDate: d("2015-01-01"), transferDate: d("2024-01-01"),
        farmingSelf: true, businessUsePeriods: [], gracePeriods: [],
      } as NonBusinessLandInput,
      R,
    );
    expect(j.warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });
});
