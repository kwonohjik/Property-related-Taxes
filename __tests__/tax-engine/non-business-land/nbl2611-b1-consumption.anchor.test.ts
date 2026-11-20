/**
 * NBL2611-B1 (R05) — 지목별 입력 소비 지도 · 기간 행 helper · 의제일 범위 · 직전 쌍 · enum · 복원 정규화 · 엔진 고지.
 * 화면·검증·전송 경로 anchor는 `__tests__/calc/nbl2611-b1-validation.anchor.test.ts`·`__tests__/components/nbl2611-b1-input-scope.anchor.test.tsx`.
 */
import { describe, it, expect } from "vitest";
import {
  consumesGracePeriods,
  consumesMetropolitanArea,
  consumesPeriodJudgmentDate,
  consumesUrbanIncorporationDate,
} from "@/lib/tax-engine/non-business-land/land-category";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type LandType, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { periodRowIssue, periodRowIssueField } from "@/lib/tax-engine/non-business-land/period-row-issue";
import { deemedTransferDateIssue } from "@/lib/tax-engine/non-business-land/deemed-transfer-date-range";
import { priorRevenueWithoutLandValue } from "@/lib/tax-engine/non-business-land/revenue-test";
import { NBL_PROPERTY_TAX_TYPE_VALUES, NBL_RELATED_BUSINESS_TYPE_VALUES } from "@/lib/tax-engine/non-business-land/nbl-enum-values";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { toOptionalDate } from "@/lib/api/date-coerce";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

describe("지목별 공통 입력 소비 표", () => {
  const table: Array<[LandType | "", { inc: boolean; grace: boolean; deemed: boolean; metro: boolean }]> = [
    ["farmland", { inc: true, grace: true, deemed: true, metro: false }],
    ["forest", { inc: true, grace: true, deemed: true, metro: false }],
    ["pasture", { inc: true, grace: true, deemed: true, metro: false }],
    ["housing_site", { inc: false, grace: false, deemed: false, metro: true }],
    ["villa_land", { inc: false, grace: true, deemed: true, metro: true }],
    ["other_land", { inc: false, grace: true, deemed: true, metro: false }],
    ["building_site", { inc: false, grace: false, deemed: false, metro: false }],
    ["", { inc: false, grace: false, deemed: false, metro: false }],
  ];
  it.each(table)("%s", (landType, e) => {
    expect({
      inc: consumesUrbanIncorporationDate(landType),
      grace: consumesGracePeriods(landType),
      deemed: consumesPeriodJudgmentDate(landType),
      metro: consumesMetropolitanArea(landType),
    }).toEqual(e);
  });

  /** 표가 «주장»이 아니라 judge의 실제 동작이라는 증거 — 소비하지 않는다고 적은 칸은 입력을 바꿔도 판정이 같다. */
  const baseOther = (extra: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput => ({
    landType: "other_land",
    landArea: 1000,
    zoneType: "commercial",
    acquisitionDate: d("2010-01-01"),
    transferDate: d("2024-06-03"),
    businessUsePeriods: [],
    gracePeriods: [],
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false } as never,
    ...extra,
  });

  it("other_land: 유예를 전 기간으로 넣으면 사업용으로 바뀐다 (gracePeriods=true의 근거 · NBL2611-B3 V2-C1)", () => {
    const whole = [{ reasonCode: "use_prohibited" as const, startDate: d("2010-01-02"), endDate: d("2024-06-03") }];
    const without = judgeNonBusinessLand(baseOther(), R);
    const withGrace = judgeNonBusinessLand(baseOther({ gracePeriods: whole as never }), R);
    expect(without.isNonBusinessLand).toBe(true);
    expect(withGrace.isNonBusinessLand).toBe(false);
    expect(withGrace.periodEvaluation?.graceJudged?.meets).toBe(true);
  });

  it("유예 입력 → 기타토지·농지는 「반영되지 않았습니다」 경고 없음, 주택부수토지는 경고", () => {
    const whole = [{ reasonCode: "use_prohibited" as const, startDate: d("2010-01-02"), endDate: d("2024-06-03") }] as never;
    const j = judgeNonBusinessLand(baseOther({ gracePeriods: whole }), R);
    expect(j.warnings.some((w) => w.includes("반영되지 않았습니다"))).toBe(false);
    const farm = judgeNonBusinessLand({ landType: "farmland", landArea: 1000, zoneType: "management", acquisitionDate: d("2010-01-01"), transferDate: d("2024-06-03"), businessUsePeriods: [], gracePeriods: whole, farmingSelf: false }, R);
    expect(farm.warnings.some((w) => w.includes("반영되지 않았습니다"))).toBe(false);
    const housing = judgeNonBusinessLand({ landType: "housing_site", landArea: 1000, zoneType: "general_residential", acquisitionDate: d("2010-01-01"), transferDate: d("2024-06-03"), housingFootprint: 100, isMetropolitanArea: false, businessUsePeriods: [], gracePeriods: whole }, R);
    expect(housing.warnings.some((w) => w.includes("반영되지 않았습니다"))).toBe(true);
  });
});

describe("서버 매퍼 게이트 — 소비하지 않는 지목의 값은 엔진 입력에 싣지 않는다", () => {
  const ctx = {
    acquisitionDate: d("2013-06-01"),
    transferDate: d("2024-06-03"),
    parseDate: (s: string) => toOptionalDate(s || undefined),
    parseNumber: (s: string) => {
      const n = parseFloat(String(s).replace(/,/g, ""));
      return Number.isFinite(n) ? n : undefined;
    },
  };
  const map = (landType: string) =>
    mapAssetToNblInput(
      {
        nblUseDetailedJudgment: true, nblLandType: landType, nblZoneType: "general_residential", acquisitionArea: "300",
        nblUrbanIncorporationDate: "2020-01-01", nblIsMetropolitanArea: "no", nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2020-03-01",
        nblHousingFootprint: "100", nblVillaUsePeriods: [], nblOtherPropertyTaxType: "comprehensive",
      } as Record<string, unknown>,
      ctx,
    )!;

  it("villa_land: 도시편입일 미탑재 · 수도권·의제는 탑재", () => {
    const i = map("villa_land");
    expect(i.urbanIncorporationDate).toBeUndefined();
    expect(i.isMetropolitanArea).toBe(false);
    expect(i.deemedTransferReason).toBe("auction");
  });
  it("housing_site: 도시편입일·의제 미탑재 · 수도권 탑재", () => {
    const i = map("housing_site");
    expect(i.urbanIncorporationDate).toBeUndefined();
    expect(i.deemedTransferReason).toBe("none");
    expect(i.deemedTransferDate).toBeUndefined();
    expect(i.isMetropolitanArea).toBe(false);
  });
  it("farmland: 도시편입일 탑재 · 수도권 미탑재", () => {
    const i = map("farmland");
    expect(i.urbanIncorporationDate?.toISOString().slice(0, 10)).toBe("2020-01-01");
    expect(i.isMetropolitanArea).toBeUndefined();
  });
  it("별장에 도시편입일을 넣어도 `urbanIncorporationGrace` echo가 생기지 않는다(적용되지 않은 유예를 적용했다고 말하지 않는다)", () => {
    const i = map("villa_land");
    expect(judgeNonBusinessLand(i, R).urbanIncorporationGrace).toBeUndefined();
  });
});

describe("기간 행 공통 helper (V8-VL02)", () => {
  it.each([
    [undefined, "2020-01-01", "empty_start", "startDate"],
    ["2020-01-01", "", "empty_end", "endDate"],
    ["2020-13-45", "2021-01-01", "invalid", "endDate"],
    ["2021-01-01", "2020-01-01", "reversed", "endDate"],
    ["2020-01-01", "2020-01-01", "same_day", "endDate"],
  ] as const)("%s ~ %s → %s", (s, e, kind, field) => {
    expect(periodRowIssue(s, e)).toBe(kind);
    expect(periodRowIssueField(kind)).toBe(field);
  });
  it("정상·1일 차이는 통과(경계 — 같은 날 0일 vs 다음 날 1일)", () => {
    expect(periodRowIssue("2020-01-01", "2020-01-02")).toBeNull();
    expect(periodRowIssue("2020-02-28", "2020-02-29")).toBeNull(); // 윤일
  });
});

describe("양도일 의제일 범위 (V2-PR04) — 경계", () => {
  const acq = "2013-06-01";
  const tr = "2024-06-03";
  it.each([
    ["2013-05-31", "not_after_acquisition"],
    ["2013-06-01", "not_after_acquisition"],
    ["2013-06-02", null], // 취득 다음날은 막지 않는다(0일 보유는 엔진이 보수 처리 + 경고)
    ["2024-06-03", null],
    ["2024-06-04", "after_transfer"],
  ] as const)("%s → %s", (deemed, expected) => {
    expect(deemedTransferDateIssue(deemed, acq, tr)).toBe(expected);
  });
  it("비교할 날짜가 비면 null — 필수 여부는 다른 검증이 맡는다", () => {
    expect(deemedTransferDateIssue("", acq, tr)).toBeNull();
    expect(deemedTransferDateIssue("2020-01-01", undefined, undefined)).toBeNull();
  });
  it("엔진: 범위 밖 의제일은 비사업용 확정과 함께 경고를 남긴다(조용하지 않다)", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland", landArea: 1000, zoneType: "management", acquisitionDate: d("2013-06-01"), transferDate: d("2024-06-03"),
      businessUsePeriods: [{ startDate: d("2013-06-02"), endDate: d("2024-06-03"), usageType: "자경" }] as never, gracePeriods: [], farmingSelf: true,
      deemedTransferReason: "auction", deemedTransferDate: d("2012-01-01"),
    };
    const j = judgeNonBusinessLand(input, R);
    expect(j.warnings.some((w) => w.includes("취득일"))).toBe(true);
  });
});

describe("직전 수입 ↔ 직전 토지가액 (V9-DM06) — ②≤① 경계", () => {
  it("수입만 → 막는다 / 토지가액만 → 막지 않는다 / 둘 다 → 통과 / 간주임대료·공통수입도 수입 쪽", () => {
    expect(priorRevenueWithoutLandValue({ priorRevenue: 1 })).toBe(true);
    expect(priorRevenueWithoutLandValue({ priorLandValue: 1 })).toBe(false);
    expect(priorRevenueWithoutLandValue({ priorRevenue: 1, priorLandValue: 1 })).toBe(false);
    expect(priorRevenueWithoutLandValue({ priorDeposit: 10, priorRentDays: 30 })).toBe(true);
    expect(priorRevenueWithoutLandValue({ priorDeposit: 10 })).toBe(false); // 일수 없으면 간주임대료 0
    expect(priorRevenueWithoutLandValue({ commonApportion: true, priorCommonRevenue: 5 })).toBe(true);
    expect(priorRevenueWithoutLandValue({ commonApportion: false, priorCommonRevenue: 5 })).toBe(false); // 토글 OFF의 stale 값
    expect(priorRevenueWithoutLandValue({ priorRevenue: 0 })).toBe(false);
  });
});

describe("enum 단일 소스 (V6-D)", () => {
  it("호 16종(NBL2611-V7-S가 6종 추가)·재산세 분류 4종 — union과 같은 목록", () => {
    expect([...NBL_RELATED_BUSINESS_TYPE_VALUES]).toContain("etc_14호");
    expect(NBL_RELATED_BUSINESS_TYPE_VALUES).toHaveLength(16);
    expect([...NBL_PROPERTY_TAX_TYPE_VALUES].sort()).toEqual(["comprehensive", "exempt", "separate", "special_sum"]);
  });
});

describe("복원 정규화 (Q-10 나 · Q-12)", () => {
  it("레거시 boolean ON + 호 미설정 → false + 「호 재선택」 표지", () => {
    const a = migrateAsset({ ...makeDefaultAsset(1), nblOtherIsRelatedToResidence: true, nblOtherRelatedBusinessType: "" });
    expect(a.nblOtherIsRelatedToResidence).toBe(false);
    expect(a.nblOtherLegacyRelatedReselect).toBe(true);
  });
  it("레거시 boolean ON + 호 「해당 없음」 명시 → false + 표지(boolean이 명시 선택을 덮던 모순 해소)", () => {
    const a = migrateAsset({ ...makeDefaultAsset(1), nblOtherIsRelatedToResidence: true, nblOtherRelatedBusinessType: "none" });
    expect(a.nblOtherIsRelatedToResidence).toBe(false);
    expect(a.nblOtherLegacyRelatedReselect).toBe(true);
  });
  it("레거시 boolean ON + 실제 호 선택 → false · 표지 없음(결과에 영향이 없던 값)", () => {
    const a = migrateAsset({ ...makeDefaultAsset(1), nblOtherIsRelatedToResidence: true, nblOtherRelatedBusinessType: "hatchang" });
    expect(a.nblOtherIsRelatedToResidence).toBe(false);
    expect(a.nblOtherLegacyRelatedReselect).toBe(false);
  });
  it("멱등 — 두 번 복원해도 표지가 유지된다", () => {
    const once = migrateAsset({ ...makeDefaultAsset(1), nblOtherIsRelatedToResidence: true, nblOtherRelatedBusinessType: "" });
    expect(migrateAsset(once).nblOtherLegacyRelatedReselect).toBe(true);
  });
  it("옛 이력(신규 키 없음) → 별장 확인 false · 표지 false", () => {
    const raw = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    delete raw.nblVillaNoUseConfirmed;
    delete raw.nblOtherLegacyRelatedReselect;
    const a = migrateAsset(raw);
    expect(a.nblVillaNoUseConfirmed).toBe(false);
    expect(a.nblOtherLegacyRelatedReselect).toBe(false);
  });
});
