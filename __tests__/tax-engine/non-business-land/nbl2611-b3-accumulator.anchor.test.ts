/**
 * NBL2611-B3 (R08) Pre-Do anchor — 기타토지 판정 흐름: 나·다목 합성 · 유예 소비 · 호 인정 정합.
 *   V1-B   다목 호의 부분 결과가 나목(배율·공장·2% 바닥면적)이 인정한 사업용 면적을 버린다 → 목별 사업용 면적을 후보로 모아 max로 합성
 *   V2-C1  영 §168의14① 유예기간이 기타토지 판정에 쓰이지 않는다 → 비사업용 잔여분 확정 직전에 «빈 사업기간 + 유예»로 기간기준 판정
 *   V6-D   레거시 「거주·사업 직접 관련」 boolean이 호 「해당 없음」 명시까지 덮는 OR
 * 세액 계약(`isNonBusinessLand`·`nonBusinessAreaRatio`)의 형태는 불변이다.
 *
 * 금액은 모의 세율(`makeMockRates`) 기준이라 방향·규모만 유효하다. 판정·비율로 단언하고, 세액은 독립 경로로 검산한다.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { consumesGracePeriods } from "@/lib/tax-engine/non-business-land/land-category";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { NBL_EXCLUSION_RANGE_POSITION_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { GracePeriod, NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);

type OL = NonNullable<NonBusinessLandInput["otherLand"]>;

/** V1-B 리뷰 실측 시료: 녹지 7배 · 1,000㎡ · 별도합산 · 건축물 시가표준액 ≥ 토지 2%(2% 통과). 2014-01-01 → 2024-01-01. */
function sample(ol: Partial<OL> = {}, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 1000,
    zoneType: "green",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType: "separate",
      hasBuilding: true,
      buildingFloorArea: 142, // × 7배 = 994㎡ → 나목 사업용 994㎡
      buildingStandardValue: 500_000_000,
      landStandardValue: 1_000_000_000,
      isRelatedToResidenceOrBusiness: false,
      ...ol,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

const parkingAttached200: Partial<OL> = { relatedBusinessType: "parking_attached", standardAreaLimit: 200 };

/** F30과 같은 거래: 양도 10억 · 취득 3억 · 보유 10년(장특 20%) — 비사업용 전량 253,960,000 / 사업용 198,210,000(모의 세율). */
function tax(nbl: NonBusinessLandInput) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: nbl.acquisitionDate,
      transferDate: nbl.transferDate,
      isOneHousehold: false,
      nonBusinessLandDetails: nbl,
    }),
    makeMockRates(),
  );
}

describe("V1-B — 나목·다목 사업용 면적 max 합성", () => {
  it("VB-1: 🔴 리뷰 시료(나목 994㎡ · 다목 부설주차장 200㎡) → 큰 쪽 994㎡ 채택, 비율 0.006 (정정 전 0.8)", () => {
    const j = judgeNonBusinessLand(sample(parkingAttached200), R);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.areaProportioning?.businessArea).toBe(994);
    expect(j.areaProportioning?.nonBusinessArea).toBe(6);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.006);
    // 합성했다는 사실과 위치 가정은 감추지 않는다
    expect(j.warnings).toContain(NBL_EXCLUSION_RANGE_POSITION_NOTICE);
  });

  it("VB-2: 대조군 — 나목만(다목 없음)과 같은 비율·같은 세액, 합산(994+200>1000)으로 전량 사업용이 되지 않는다", () => {
    const withHo = judgeNonBusinessLand(sample(parkingAttached200), R);
    const naMokOnly = judgeNonBusinessLand(sample(), R);
    expect(naMokOnly.surcharge.nonBusinessAreaRatio).toBe(0.006);
    expect(withHo.surcharge.nonBusinessAreaRatio).toBe(naMokOnly.surcharge.nonBusinessAreaRatio);
    // 단순 합산이었다면 비사업용 면적이 0이 되어 isNonBusinessLand=false였을 것이다
    expect(withHo.isNonBusinessLand).toBe(true);
    // 세액: 정정 전 220,570,000(비율 0.8) → 나목만과 같은 값
    expect(tax(sample(parkingAttached200)).calculatedTax).toBe(tax(sample()).calculatedTax);
    expect(tax(sample(parkingAttached200)).calculatedTax).toBe(198_210_000);
  });

  it("VB-3: 다목이 나목보다 넓으면 다목 결과(기존 동작) — 하치장 900㎡ vs 나목 700㎡", () => {
    const j = judgeNonBusinessLand(
      sample({ buildingFloorArea: 100, relatedBusinessType: "hatchang", maxAnnualArea: 750 }),
      R,
    );
    expect(j.areaProportioning?.businessArea).toBe(900); // 750 × 1.2
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.1);
    expect(j.warnings).toContain(NBL_EXCLUSION_RANGE_POSITION_NOTICE);
  });

  it("VB-4: 나목 전량 PASS면 다목 단계를 아예 거치지 않는다 (step 부재 단언 유지)", () => {
    const r = judgeOtherLand(sample({ ...parkingAttached200, buildingFloorArea: 200 }), R); // 200 × 7 = 1,400 ≥ 1,000
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "other_area_limit")).toBeUndefined();
    expect(r.warnings ?? []).not.toContain(NBL_EXCLUSION_RANGE_POSITION_NOTICE);
  });

  it("VB-5: 다목 전량 PASS(기준면적 이내)면 나목 단계를 거치지 않는다", () => {
    const r = judgeOtherLand(sample({ relatedBusinessType: "parking_attached", standardAreaLimit: 1000 }), R);
    expect(r.isBusiness).toBe(true);
    expect(r.steps.find((s) => s.id === "other_building_multiplier_apply")).toBeUndefined();
  });

  it("VB-6: 나목이 없으면(별도합산 아님·건물 없음) 다목 결과 그대로 — 고지도 없다", () => {
    const j = judgeNonBusinessLand(
      sample({ propertyTaxType: "comprehensive", hasBuilding: false, buildingFloorArea: undefined, ...parkingAttached200 }),
      R,
    );
    expect(j.areaProportioning?.businessArea).toBe(200);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.8);
    expect(j.warnings).not.toContain(NBL_EXCLUSION_RANGE_POSITION_NOTICE);
  });

  it("VB-7: 2% 미달 바닥면적(나목) 300㎡ vs 다목 200㎡ → 300㎡ 채택", () => {
    const j = judgeNonBusinessLand(
      sample({ buildingFloorArea: 300, buildingStandardValue: 10_000_000, landStandardValue: 1_000_000_000, ...parkingAttached200 }),
      R,
    );
    expect(j.areaProportioning?.businessArea).toBe(300);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.7); // 정정 전 0.8
  });

  it("VB-8: 2% 미달 바닥면적이 부속토지 전부면 다목 부분 결과가 있어도 전량 사업용", () => {
    const j = judgeNonBusinessLand(
      sample({ buildingFloorArea: 1000, buildingStandardValue: 10_000_000, landStandardValue: 1_000_000_000, ...parkingAttached200 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("VB-9: 공장 기준면적 초과(나목 400㎡) vs 다목 300㎡ → 400㎡ 채택 · 다목 500㎡면 다목", () => {
    const factory = (over: Partial<OL> = {}) =>
      sample({
        propertyTaxType: "comprehensive",
        factory: { locationCategory: "urban_other", totalAppurtenantLandArea: 1000, totalFootprintArea: 100, zoneType: "general_residential", segments: [] },
        ...over,
      }, { zoneType: "general_residential" });
    const naMokWide = judgeNonBusinessLand(factory({ relatedBusinessType: "parking_attached", standardAreaLimit: 300 }), R);
    expect(naMokWide.areaProportioning?.businessArea).toBe(400); // 100 × 4배
    expect(naMokWide.surcharge.nonBusinessAreaRatio).toBe(0.6); // 정정 전 0.7
    const daMokWide = judgeNonBusinessLand(factory({ relatedBusinessType: "parking_attached", standardAreaLimit: 500 }), R);
    expect(daMokWide.areaProportioning?.businessArea).toBe(500);
    expect(daMokWide.surcharge.nonBusinessAreaRatio).toBe(0.5);
  });

  it("VB-10: 다목 ⑤ 연접 다필지·⑥ 복합용도의 부분 결과도 나목과 합성된다", () => {
    // ⑥ 복합용도: 특정용도분 30% → 사업용 300㎡ — 나목 994㎡가 더 넓다
    const mixed = judgeNonBusinessLand(
      sample({
        relatedBusinessType: "none",
        mixedUseBuildingMode: "single_building",
        specificUseFloorArea: 300,
        totalFloorArea: 1000,
      }),
      R,
    );
    expect(mixed.areaProportioning?.businessArea).toBe(994);
  });
});

/** 유예기간 — 영 §168의14①. 소유기간 2014-01-01 → 2024-01-01(3,652일). */
const grace = (startDate: string, endDate: string): GracePeriod => ({ reasonCode: "use_prohibited", startDate: d(startDate), endDate: d(endDate) });
const bare = (gracePeriods: GracePeriod[], ol: Partial<OL> = {}): NonBusinessLandInput =>
  ({
    landType: "other_land",
    landArea: 1000,
    zoneType: "commercial",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, ...ol },
    businessUsePeriods: [],
    gracePeriods,
  }) as NonBusinessLandInput;

describe("V2-C1 — 유예기간(영 §168의14①)을 기타토지 판정에 쓴다", () => {
  it("VC-1: 🔴 나대지 + 「법령상 사용 금지」 유예 전 기간 → 사업용 (정정 전 비사업용), 세액 198,210,000 (정정 전 253,960,000)", () => {
    const nbl = bare([grace("2014-01-02", "2024-01-01")]);
    const j = judgeNonBusinessLand(nbl, R);
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0);
    expect(j.gracePeriodDays).toBeGreaterThan(0);
    expect(tax(nbl).calculatedTax).toBe(198_210_000);
    // 대조군(유예 없음)은 그대로 비사업용 전량
    expect(tax(bare([])).calculatedTax).toBe(253_960_000);
  });

  it("VC-2: 유예가 비사업용 잔여분(다목 부분 결과)까지 전량 사업용으로 돌린다", () => {
    const j = judgeNonBusinessLand(
      bare([grace("2014-01-02", "2024-01-01")], { ...parkingAttached200 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.areaProportioning).toBeUndefined();
  });

  it("VC-3: 경계 — 양도일 직전 3년 중 유예 730일 → 사업용 · 729일 → 비사업용 (§168의6 1호 나목 「직전 3년 중 1년(365일) 초과」)", () => {
    // 소유 10년 · 양도일 2024-01-01. 직전 3년 창 1,095일 − 유예 730일 = 비사업 365일(초과 아님 → 나목 미충족 → 사업용).
    const at730 = judgeNonBusinessLand(bare([grace("2022-01-01", "2024-01-01")]), R);
    expect(at730.gracePeriodDays).toBe(730);
    expect(at730.isNonBusinessLand).toBe(false);
    const at729 = judgeNonBusinessLand(bare([grace("2022-01-02", "2024-01-01")]), R);
    expect(at729.gracePeriodDays).toBe(729);
    expect(at729.isNonBusinessLand).toBe(true);
  });

  it("VC-4: 유예를 판정에 썼으면 echo가 사실대로 — 일수·충족 여부(거짓 금지)", () => {
    const meets = judgeNonBusinessLand(bare([grace("2014-01-02", "2024-01-01")]), R);
    expect(meets.periodEvaluation?.basis).toBe("state_at_transfer");
    expect(meets.periodEvaluation?.graceJudged).toEqual({
      gracePeriodDays: meets.gracePeriodDays,
      totalOwnershipDays: meets.totalOwnershipDays,
      meets: true,
    });
    const fails = judgeNonBusinessLand(bare([grace("2023-01-02", "2024-01-01")]), R); // 364일
    expect(fails.isNonBusinessLand).toBe(true);
    expect(fails.periodEvaluation?.graceJudged?.meets).toBe(false);
    expect(fails.periodEvaluation?.graceJudged?.gracePeriodDays).toBeGreaterThan(0);
    // 유예 입력이 없으면 echo에 흔적도 없다
    expect(judgeNonBusinessLand(bare([]), R).periodEvaluation).toEqual({ basis: "state_at_transfer" });
  });

  it("VC-5: 소비 술어·엔진 고지 — 기타토지는 유예를 읽는다(「반영되지 않았습니다」 경고 없음), 건물(비주택) 부수토지는 그대로 (주택부수토지는 NBL2611-D1부터 읽는다)", () => {
    expect(consumesGracePeriods("other_land")).toBe(true);
    expect(consumesGracePeriods("building_site")).toBe(false);
    const j = judgeNonBusinessLand(bare([grace("2014-01-02", "2024-01-01")]), R);
    expect(j.warnings.some((w) => w.includes("반영되지 않았습니다"))).toBe(false);
  });

  it("VC-6: V3-PR05(9호 멸실 연혁) 선행 반영 확인 — 2025.3.21. 전 양도는 2년, 이후 5년", async () => {
    const { demolitionGraceYears } = await import("@/lib/tax-engine/data/nbl-historical-values-era");
    expect(demolitionGraceYears(d("2024-01-01"))).toBe(2);
    expect(demolitionGraceYears(d("2025-03-21"))).toBe(5);
  });
});

describe("V6-D — 호를 명시하면 레거시 boolean이 덮지 못한다", () => {
  it("VD-1: 🔴 호 「해당 없음」 명시 + 레거시 true → 비사업용 (정정 전 레거시 true가 사업용으로 덮음)", () => {
    const j = judgeNonBusinessLand(
      bare([], { relatedBusinessType: "none", isRelatedToResidenceOrBusiness: true }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(true);
  });

  it("VD-2: 호 미설정(undefined) + 레거시 true → 기존 fallback 유지(사업용) — Q-10 migrate 이전 직접 API 호환", () => {
    const j = judgeNonBusinessLand(bare([], { isRelatedToResidenceOrBusiness: true }), R);
    expect(j.isNonBusinessLand).toBe(false);
  });

  it("VD-3: 호를 명시(인정 호)하면 그 호가 판정한다 — 레거시 true는 무관", () => {
    const j = judgeNonBusinessLand(bare([], { ...parkingAttached200, isRelatedToResidenceOrBusiness: true }), R);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(0.8);
  });
});
