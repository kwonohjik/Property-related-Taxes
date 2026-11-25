/**
 * PSA-E3 ④⑧ — 본 경로(비철거) 허가·사용승인 칸: 요구될 때만 싣고(④) · 요구될 때만 막는다(⑧). 어댑터 `lib/calc/property-separate-requirements.ts` 단일 술어.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { buildingAreaInputsNeedOf } from "@/lib/calc/property-separate-requirements";
import { buildingChainOf } from "@/lib/calc/property-separate-requirements";
import { buildingFactIssueOf } from "@/lib/calc/property-separate-requirements";
import { buildingPermitNeedOf } from "@/lib/calc/property-separate-requirements";
import { buildingWireFields } from "@/lib/calc/property-separate-requirements";
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

describe("PSA-E3·S2 어댑터 — 술어는 엔진 한 곳", () => {
  it("노출 술어 · ⑧ 결함 · ④ 전송이 같은 시행 경계(2011-05-31 / 2011-06-01)를 따른다", () => {
    const before = parseISO("2011-05-31");
    const first = parseISO("2011-06-01");
    const area = { zoningDistrict: "commercial", buildingFloorArea: 100 as number | undefined };
    expect([buildingPermitNeedOf(before), buildingPermitNeedOf(first)]).toEqual([false, true]);
    expect(buildingFactIssueOf({ permit: "", ...area }, before)).toBeNull();
    expect(buildingFactIssueOf({ permit: "", ...area }, first)).toEqual({ field: "buildingPermit", message: PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE });
    expect(buildingFactIssueOf({ permit: "unknown", zoningDistrict: "", buildingFloorArea: undefined }, first)).toBeNull();
    expect(buildingWireFields({ permit: "no", ...area }, before)).toEqual({ zoningDistrict: "commercial", buildingFloorArea: 100 });
    expect(buildingWireFields({ permit: "yes", ...area }, first)).toEqual({ buildingPermit: "yes", zoningDistrict: "commercial", buildingFloorArea: 100 });
    expect(buildingWireFields({ permit: "", zoningDistrict: "", buildingFloorArea: undefined }, first)).toEqual({ buildingPermit: "" });
  });

  it("PSA-S2 — 사슬: 허가 «예»(또는 허가 칸 없는 시행본)일 때만 용도지역·바닥면적을 묻고, «아니오»·«모름»은 결과 확정", () => {
    const before = parseISO("2011-05-31");
    const first = parseISO("2011-06-01");
    expect(buildingChainOf("", before)).toEqual({ permit: false, areaInputs: true, resolvedFold: false });
    const byPermit = Object.fromEntries((["", "yes", "no", "unknown"] as const).map((p) => [p || "blank", buildingChainOf(p, first)]));
    expect(byPermit).toEqual({
      blank: { permit: true, areaInputs: false, resolvedFold: false },
      yes: { permit: true, areaInputs: true, resolvedFold: false },
      no: { permit: true, areaInputs: false, resolvedFold: true },
      unknown: { permit: true, areaInputs: false, resolvedFold: true },
    });
    expect([buildingAreaInputsNeedOf("no", first), buildingAreaInputsNeedOf("yes", first), buildingAreaInputsNeedOf("", before)]).toEqual([false, true, true]);
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

  it("⑧ 순서 = 허가 → 용도지역 → 바닥면적(사슬) — 허가 미선택이면 면적 칸은 아직 묻지 않는다 · «아니오»·«모름»은 용도지역·바닥면적 없이도 통과(엔진이 접는다)", () => {
    const f = form({});
    expect(validateStep(2, f)).toBe(PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE);
    expect(validateStep(2, { ...f, saBuildingFloorArea: "", saZoningDistrict: "" })).toBe(PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE);
    expect(validateStep(2, { ...f, saBuildingPermit: "yes", saZoningDistrict: "" })).toBe("용도지역을 선택하세요.");
    expect(validateStep(2, { ...f, saBuildingPermit: "yes", saBuildingFloorArea: "" })).toBe("건물 바닥면적(㎡)을 입력하세요.");
    expect(validateStep(2, { ...f, saBuildingPermit: "yes" })).toBeNull();
    for (const p of ["no", "unknown"] as const) {
      expect(validateStep(2, { ...f, saBuildingPermit: p })).toBeNull();
      expect(validateStep(2, { ...f, saBuildingPermit: p, saZoningDistrict: "", saBuildingFloorArea: "" })).toBeNull();
    }
  });

  it("④ — 허가는 요구될 때(2026 · 철거 OFF)만 3지선다 그대로 · 용도지역·바닥면적은 허가 «예»일 때만(숨은 stale 값 미전송) · 공장용지도 같다", () => {
    for (const p of ["no", "unknown"] as const) {
      const it_ = item(form({ saBuildingPermit: p }));
      expect(it_).toMatchObject({ buildingPermit: p });
      expect("zoningDistrict" in it_ || "buildingFloorArea" in it_).toBe(false);
    }
    expect(item(form({ saBuildingPermit: "unknown", saIsFactory: true }))).toMatchObject({ buildingPermit: "unknown", isFactory: true });
    expect(item(form({ saBuildingPermit: "yes" }))).toMatchObject({ buildingPermit: "yes", zoningDistrict: "commercial", buildingFloorArea: 100 });
    // 허가 미선택 — 허가 칸만(⑫가 «값 없음»으로 400) · 면적은 아직 묻지 않는다
    const blank = item(form({ saBuildingPermit: "" }));
    expect(blank).toMatchObject({ buildingPermit: "" });
    expect("zoningDistrict" in blank || "buildingFloorArea" in blank).toBe(false);
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
    expect(item(f)).toMatchObject({ zoningDistrict: "commercial", buildingFloorArea: 100 }); // 허가 칸이 없는 시행본 — 면적은 항상 묻는다
    expect(validateStep(2, form({}))).toBeNull();
    expect(validateStep(2, form({ saBuildingFloorArea: "" }))).toBe("건물 바닥면적(㎡)을 입력하세요.");
  });
});
