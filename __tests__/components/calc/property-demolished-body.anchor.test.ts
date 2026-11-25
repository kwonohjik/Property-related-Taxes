/**
 * PSA-E2 — ④ 변환(`buildPropertyTaxRequestBody`)·⑧(`validateStep(2)`)이 철거 요건 술어를 따른다.
 * 요구된 칸만 싣는다(숨은 stale 값 미전송) · 철거 OFF에는 철거 칸을 싣지 않는다 · 주택·2024.6.1. 전 철거는 바닥면적·용도지역 요구 0(Q-8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";

const form = (over: Partial<FormState>): FormState => ({
  ...INITIAL_FORM,
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: "300,000,000",
  saLandArea: "300",
  saZoningDistrict: "commercial",
  saBuildingFloorArea: "100",
  saBuildingPermit: "yes", // PSA-E3 — 철거 OFF 사례가 허가 칸에 막히지 않게(철거 ON은 읽지 않음)
  otherSeparateAggregateValue: "0",
  otherComprehensiveValue: "0",
  ...over,
});
const item = (f: FormState) => buildPropertyTaxRequestBody(f).separateAggregateItem as Record<string, unknown>;

describe("PSA-E2 ④⑧ — 철거 요건 칸", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-15T00:00:00Z")); // 과세기준일 2026-06-01
  });
  afterEach(() => vi.useRealTimers());

  it("건축물 · 철거 2026-01-01: 종류·허가·건축 외 용도·바닥면적·용도지역을 싣고 빈집정비·공용·유료 stale 값은 싣지 않는다", () => {
    const f = form({
      saDemolished: true,
      saDemolishedDate: "2026-01-01",
      saDemolishedKind: "building",
      saDemolishedPermit: "yes",
      saDemolishedOtherUse: "no",
      saDemolishedVacantHouse: "yes",
      saDemolishedPublicUse: "yes",
      saDemolishedPublicUsePaid: "yes",
    });
    expect(validateStep(2, f)).toBeNull();
    const i = item(f);
    expect(i).toMatchObject({ demolished: true, demolishedDate: "2026-01-01", demolishedKind: "building", demolishedPermit: "yes", demolishedOtherUse: "no", buildingFloorArea: 100, zoningDistrict: "commercial" });
    for (const k of ["demolishedVacantHouse", "demolishedPublicUse", "demolishedPublicUsePaid"]) expect(k in i, k).toBe(false);
  });

  it("주택 · 철거 2026-01-01: 바닥면적·용도지역이 폼에 남아 있어도 싣지 않고(요구 0) ⑧도 요구하지 않는다", () => {
    const f = form({ saDemolished: true, saDemolishedDate: "2026-01-01", saDemolishedKind: "house", saDemolishedPermit: "yes", saDemolishedOtherUse: "no", saDemolishedVacantHouse: "no" });
    expect(validateStep(2, { ...f, saZoningDistrict: "", saBuildingFloorArea: "" })).toBeNull();
    const i = item(f);
    expect(i).toMatchObject({ demolishedKind: "house", demolishedPermit: "yes", demolishedOtherUse: "no" });
    // PSA-S1 — 건축 외 용도 «아니오»면 빈집정비 단서(2호)를 읽지 않는다 → 폼에 남은 «아니오»도 싣지 않는다
    for (const k of ["demolishedVacantHouse", "buildingFloorArea", "zoningDistrict"]) expect(k in i, k).toBe(false);
  });

  it("주택 · 건축 외 용도 «예» → 빈집정비(단서 하위)를 싣는다 · 허가 «아니오»면 건축 외·빈집정비 stale 값은 싣지 않는다(PSA-S1)", () => {
    const yes = form({ saDemolished: true, saDemolishedDate: "2026-01-01", saDemolishedKind: "house", saDemolishedPermit: "yes", saDemolishedOtherUse: "yes", saDemolishedVacantHouse: "no" });
    expect(validateStep(2, yes)).toBeNull();
    expect(item(yes)).toMatchObject({ demolishedOtherUse: "yes", demolishedVacantHouse: "no" });
    const permitNo = { ...yes, saDemolishedPermit: "no" as const };
    expect(validateStep(2, { ...permitNo, saDemolishedOtherUse: "" as const, saDemolishedVacantHouse: "" as const })).toBeNull();
    const i = item(permitNo);
    expect(i).toMatchObject({ demolishedPermit: "no" });
    for (const k of ["demolishedOtherUse", "demolishedVacantHouse"]) expect(k in i, k).toBe(false);
  });

  it("종류 불요 — 철거일이 가장 긴 한시 기간(빈집 3년) 밖이면 종류를 묻지도 싣지도 않는다(PSA-S1) · ⑧은 종류 미선택을 막지 않는다", () => {
    const f = form({ saDemolished: true, saDemolishedDate: "2023-05-31", saDemolishedKind: "", saZoningDistrict: "", saBuildingFloorArea: "" });
    expect(validateStep(2, f)).toBeNull();
    const i = item(f);
    expect(i).toMatchObject({ demolished: true, demolishedDate: "2023-05-31" });
    for (const k of ["demolishedKind", "demolishedPermit", "demolishedVacantHouse", "buildingFloorArea", "zoningDistrict"]) expect(k in i, k).toBe(false);
    // 종류가 폼에 남아 있어도(숨은 값) 싣지 않는다
    expect("demolishedKind" in item({ ...f, saDemolishedKind: "building" })).toBe(false);
  });

  it("공용·유료 사슬 — 건축 외 yes ∧ 빈집정비 yes일 때 공용 칸, 공용 yes일 때 유료 칸이 실린다", () => {
    const chain = form({ saDemolished: true, saDemolishedDate: "2024-06-15", saDemolishedKind: "house", saDemolishedPermit: "yes", saDemolishedOtherUse: "yes", saDemolishedVacantHouse: "yes", saDemolishedPublicUse: "yes", saDemolishedPublicUsePaid: "no" });
    expect(validateStep(2, chain)).toBeNull();
    expect(item(chain)).toMatchObject({ demolishedPublicUse: "yes", demolishedPublicUsePaid: "no" });
    const closed = { ...chain, saDemolishedPublicUse: "no" as const };
    expect("demolishedPublicUsePaid" in item(closed)).toBe(false);
    expect(item(closed)).toMatchObject({ demolishedPublicUse: "no" });
  });

  it("철거 1년 초과: 종류만 요구(사실 칸·바닥면적·용도지역 비요구 · 비전송)", () => {
    const f = form({ saDemolished: true, saDemolishedDate: "2025-05-31", saDemolishedKind: "building", saDemolishedPermit: "no", saZoningDistrict: "", saBuildingFloorArea: "" });
    expect(validateStep(2, f)).toBeNull();
    const i = item(f);
    expect(i).toMatchObject({ demolishedKind: "building" });
    for (const k of ["demolishedPermit", "demolishedOtherUse", "buildingFloorArea", "zoningDistrict"]) expect(k in i, k).toBe(false);
  });

  it("미선택은 ⑧이 차단 — 종류 → 허가 → 건축 외 용도 순(엔진 `propertyDemolishedFactIssue` 문구)", () => {
    const base = form({ saDemolished: true, saDemolishedDate: "2026-01-01" });
    expect(validateStep(2, base)).toContain("주택인지 주택이 아닌 건축물인지");
    const k = { ...base, saDemolishedKind: "building" as const };
    expect(validateStep(2, k)).toContain("허가·사용승인");
    // PSA-S1 — 허가 «모름»은 접힘 확정이라 뒤 칸(건축 외 용도)을 묻지 않는다 · «예»여야 건축 외 용도로 이어진다
    expect(validateStep(2, { ...k, saDemolishedPermit: "unknown" as const })).toBeNull();
    expect(validateStep(2, { ...k, saDemolishedPermit: "yes" as const })).toContain("건축을 위한 용도 외");
    expect(validateStep(2, { ...k, saDemolishedPermit: "yes" as const, saDemolishedOtherUse: "unknown" as const })).toBeNull();
  });

  it("철거 OFF — 철거 칸 비전송(stale 무해) · 용도지역·바닥면적은 항상 필수(종전 규칙)", () => {
    const f = form({ saDemolished: false, saDemolishedKind: "house", saDemolishedPermit: "no" });
    const i = item(f);
    for (const k of ["demolished", "demolishedKind", "demolishedPermit"]) expect(k in i, k).toBe(false);
    expect(i).toMatchObject({ zoningDistrict: "commercial", buildingFloorArea: 100 });
    expect(validateStep(2, { ...f, saZoningDistrict: "" })).toBe("용도지역을 선택하세요.");
    expect(validateStep(2, { ...f, saBuildingFloorArea: "" })).toBe("건물 바닥면적(㎡)을 입력하세요.");
  });

  it("철거일 없음 → 철거일 결함이 종류 결함보다 먼저", () => {
    expect(validateStep(2, form({ saDemolished: true }))).toContain("철거ㆍ멸실일");
  });
});
