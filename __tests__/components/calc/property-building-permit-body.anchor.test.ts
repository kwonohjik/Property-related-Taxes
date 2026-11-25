/**
 * PSA-E3 ④⑧ — 본 경로(비철거) 허가·사용승인 칸: 요구될 때만 싣고(④) · 요구될 때만 막는다(⑧). 어댑터 `lib/calc/property-separate-requirements.ts` 단일 술어.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { buildingPermitIssueOf, buildingPermitNeedOf, buildingPermitWireFields } from "@/lib/calc/property-separate-requirements";
import { PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";
import { parseISO } from "@/lib/tax-engine/utc-date";

const form = (over: Partial<FormState>): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: "300,000,000",
  saLandArea: "300",
  saZoningDistrict: "commercial",
  saBuildingFloorArea: "100",
  otherSeparateAggregateValue: "0",
  otherComprehensiveValue: "0",
  ...over,
});
const item = (f: FormState) => buildPropertyTaxRequestBody(f).separateAggregateItem as Record<string, unknown>;

describe("PSA-E3 어댑터 — 술어는 엔진 한 곳", () => {
  it("노출 술어 · ⑧ 결함 · ④ 전송이 같은 시행 경계(2011-05-31 / 2011-06-01)를 따른다", () => {
    const before = parseISO("2011-05-31");
    const first = parseISO("2011-06-01");
    expect([buildingPermitNeedOf(before), buildingPermitNeedOf(first)]).toEqual([false, true]);
    expect(buildingPermitIssueOf("", before)).toBeNull();
    expect(buildingPermitIssueOf("", first)).toEqual({ field: "buildingPermit", message: PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE });
    expect(buildingPermitIssueOf("unknown", first)).toBeNull();
    expect(buildingPermitWireFields("no", before)).toEqual({});
    expect(buildingPermitWireFields("no", first)).toEqual({ buildingPermit: "no" });
    expect(buildingPermitWireFields("", first)).toEqual({ buildingPermit: "" });
  });
});

describe("PSA-E3 ④⑧ — 폼 경로", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z")); // 과세기준일 2026-06-01
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("미선택은 ⑧이 차단(용도지역 → 바닥면적 → 허가 순서) · 3지선다는 모두 통과(no·unknown은 엔진이 접는다)", () => {
    const f = form({});
    expect(validateStep(2, f)).toBe(PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE);
    expect(validateStep(2, { ...f, saBuildingFloorArea: "" })).toBe("건물 바닥면적(㎡)을 입력하세요.");
    expect(validateStep(2, { ...f, saZoningDistrict: "" })).toBe("용도지역을 선택하세요.");
    for (const p of ["yes", "no", "unknown"] as const) expect(validateStep(2, { ...f, saBuildingPermit: p })).toBeNull();
  });

  it("④ — 요구될 때(2026 · 철거 OFF)만 싣는다: 3지선다 그대로 · 공장용지도 같다", () => {
    expect(item(form({ saBuildingPermit: "no" }))).toMatchObject({ buildingPermit: "no" });
    expect(item(form({ saBuildingPermit: "unknown", saIsFactory: true }))).toMatchObject({ buildingPermit: "unknown", isFactory: true });
  });

  it("철거 ON — 본 경로 허가 칸은 묻지도(⑧) 싣지도(④) 않는다(stale 무해 · 철거 허가 칸이 같은 의미를 맡는다)", () => {
    const f = form({
      saDemolished: true,
      saDemolishedDate: "2026-01-01",
      saDemolishedKind: "building",
      saDemolishedPermit: "yes",
      saDemolishedOtherUse: "no",
      saBuildingPermit: "no",
    });
    expect("buildingPermit" in item(f)).toBe(false);
    expect(validateStep(2, { ...f, saBuildingPermit: "" })).toBeNull();
  });

  it("과세기준일 2011.6.1. 전 시행본에서는 ⑧ 통과 · ④ 비전송", () => {
    vi.setSystemTime(new Date("2010-07-15T00:00:00Z"));
    const f = form({ saBuildingPermit: "no" });
    expect("buildingPermit" in item(f)).toBe(false);
    expect(validateStep(2, form({}))).toBeNull();
  });
});
