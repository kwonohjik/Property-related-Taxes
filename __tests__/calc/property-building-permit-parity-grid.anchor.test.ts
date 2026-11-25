/**
 * PSA-E3 — 본 경로(비철거) 허가·사용승인 칸 ⑧(`validateStep(2)`) ↔ ⑫(Zod `superRefine`) 패리티 격자 (계획서 §7.3 K-27~K-29 · §7.4 정신).
 *
 * 격자: 과세기준일 연도 {2009 · 2010 · 2011 · 2016 · 2026} × 허가 칸 {"" · yes · no · unknown} × 철거 {OFF · ON} × 공장용지 {아니오 · 예} × 용도지역·바닥면적 {둘 다 있음 · 둘 다 없음 · 용도지역만 · 바닥면적만}.
 * PSA-S2 — 사슬 순서(허가 → 용도지역 → 바닥면적): 허가 «아니오»·«모름»이면 용도지역·바닥면적이 없거나 한쪽만 있어도(바닥면적만 = N3 함정) 세 입구 모두 통과하고 엔진이 던지지 않는다.
 * 각 셀에서 세 입구를 짝지어 «차단 여부 + 첫 문구»를 대조한다 — 「UI 통과 ↔ 400」·「UI 차단 ↔ 200」 막다른 길 0건.
 *   ⑧  : 폼 → `validateStep(2, form)`
 *   ⑫A : 폼 → ④ `buildPropertyTaxRequestBody`(요구될 때만 싣는다) → Zod
 *   ⑫B : 직접 API — 허가 칸을 요구 여부와 무관하게 항상 실어 보낸 본문 → Zod (요구되지 않은 칸은 400이 아니라 무시)
 * 추가로 ④가 «요구될 때만» 싣는지(과세기준일 2011.6.1. 전 · 철거 ON이면 키 없음) · 통과 셀은 엔진이 던지지 않는지 본다.
 * 시각은 fake Date로 고정한다(화면 경로는 `targetDate`를 보내지 않아 과세기준일 = 지금 UTC 연도 6.1.).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { INITIAL_FORM, buildPropertyTaxRequestBody, validateStep, type FormState } from "@/components/calc/property/shared";
import { propertyTaxInputSchema } from "@/lib/validators/property-input";
import { calculatePropertyTax } from "@/lib/tax-engine/property-tax";
import { PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";
import type { PropertyTaxInput } from "@/lib/tax-engine/types/property.types";

type Fact = "" | "yes" | "no" | "unknown";
const FACTS: Fact[] = ["", "yes", "no", "unknown"];
const YEARS = [2009, 2010, 2011, 2016, 2026];

interface Cell {
  year: number;
  permit: Fact;
  demolished: boolean;
  factory: boolean;
  /** 용도지역·바닥면적 입력 상태 */
  area: Area;
}
type Area = "both" | "none" | "zone" | "floor";
const AREAS: Area[] = ["both", "none", "zone", "floor"];
const hasZone = (a: Area) => a === "both" || a === "zone";
const hasFloor = (a: Area) => a === "both" || a === "floor";

function formOf(c: Cell): FormState {
  return {
    ...INITIAL_FORM,
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: "300,000,000",
    saLandArea: "300",
    saZoningDistrict: hasZone(c.area) ? "commercial" : "",
    saBuildingFloorArea: hasFloor(c.area) ? "100" : "",
    saIsFactory: c.factory,
    saBuildingPermit: c.permit,
    // 철거 ON — 철거 칸은 모두 유효하게 채운다(이 격자의 관심사는 본 경로 허가 칸이 철거 경로에서 읽히지 않는 것)
    saDemolished: c.demolished,
    ...(c.demolished
      ? { saDemolishedDate: `${c.year}-01-01`, saDemolishedKind: "building" as const, saDemolishedPermit: "yes" as const, saDemolishedOtherUse: "no" as const }
      : {}),
    otherSeparateAggregateValue: "0",
    otherComprehensiveValue: "0",
  };
}

/** ⑫B — 직접 API: 허가 칸을 요구 여부와 무관하게 항상 싣는다 */
function rawBodyOf(c: Cell): Record<string, unknown> {
  return {
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: 300_000_000,
    otherSeparateAggregateValue: 0,
    otherComprehensiveValue: 0,
    separateAggregateItem: {
      id: "parcel-1",
      jurisdictionCode: "000000",
      landArea: 300,
      officialLandPrice: 1_000_000,
      ...(hasZone(c.area) ? { zoningDistrict: "commercial" } : {}),
      ...(hasFloor(c.area) ? { buildingFloorArea: 100 } : {}),
      ...(c.factory ? { isFactory: true } : {}),
      buildingPermit: c.permit,
      ...(c.demolished
        ? { demolished: true, demolishedDate: `${c.year}-01-01`, demolishedKind: "building", demolishedPermit: "yes", demolishedOtherUse: "no" }
        : {}),
    },
  };
}

/** Zod가 `separateAggregateItem` 아래에 낸 문구 전체(없으면 []) — 합산 칸 등 다른 경로의 결함은 이 격자의 관심사가 아니다 */
function zodItemIssues(body: Record<string, unknown>): string[] {
  const r = propertyTaxInputSchema.safeParse(body);
  if (r.success) return [];
  return r.error.issues
    .filter((i) => i.path[0] === "separateAggregateItem")
    // ④는 빈 용도지역을 `""`로 싣는다(종전 동작) — Zod enum이 «Invalid option»으로 막는다. 둘 다 차단이라 막다른 길은 아니고, 이 격자는 같은 «차단»으로 센다
    .map((i) => (i.path[1] === "zoningDistrict" && i.code === "invalid_value" ? "용도지역을 선택하세요." : i.message));
}

function* cells(): Generator<Cell> {
  for (const year of YEARS)
    for (const permit of FACTS)
      for (const demolished of [false, true])
        for (const factory of [false, true])
          for (const area of AREAS) yield { year, permit, demolished, factory, area };
}

describe("PSA-E3 ⑧↔⑫ 본 경로 허가 칸 패리티 격자 — 요구 ≡ 차단 ≡ 400 (같은 문구)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const year of YEARS) {
    it(`과세기준일 ${year}-06-01 — 전 셀 ⑧ = ⑫A(④ 본문) = ⑫B(직접 API) · 차단이면 첫 문구 일치`, () => {
      vi.setSystemTime(new Date(`${year}-07-15T00:00:00Z`));
      const mismatches: string[] = [];
      let total = 0;
      let blocked = 0;
      let passed = 0;
      let permitBlocked = 0;
      let foldPassed = 0;
      for (const c of cells()) {
        if (c.year !== year) continue;
        total++;
        const form = formOf(c);
        const ui = validateStep(2, form);
        const viaBody = zodItemIssues(buildPropertyTaxRequestBody(form))[0] ?? null;
        const viaRaw = zodItemIssues(rawBodyOf(c))[0] ?? null;
        if (ui === null) passed++;
        else blocked++;
        if (ui === PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE) permitBlocked++;
        // 허가 칸 문구 규칙 — 요구(2011.6.1.~ ∧ 철거 OFF) ∧ 미선택일 때만, 허가가 사슬의 첫 칸이라 용도지역·바닥면적 상태와 무관하게 첫 결함이다
        const expectPermit = year >= 2011 && !c.demolished && c.permit === "";
        if ((ui === PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE) !== expectPermit) mismatches.push(`허가 문구 규칙 위반 ${JSON.stringify(c)} ⑧=${ui}`);
        // 사슬 — 비철거 ∧ 허가 요건 시행본 ∧ 허가 «아니오»·«모름»은 용도지역·바닥면적을 요구하지 않는다(요구 칸 = 엔진이 읽는 칸)
        if (!c.demolished && year >= 2011 && (c.permit === "no" || c.permit === "unknown")) {
          if (ui !== null || viaBody !== null || viaRaw !== null) mismatches.push(`허가 «${c.permit}» 확정인데 면적을 요구 ${JSON.stringify(c)} ⑧=${ui} ⑫A=${viaBody} ⑫B=${viaRaw}`);
          if (zodItemIssues(rawBodyOf(c)).length > 0) mismatches.push(`⑫B 400 ${JSON.stringify(c)}`);
          foldPassed++;
        }
        if (ui !== viaBody || ui !== viaRaw) mismatches.push(`${JSON.stringify(c)} ⑧=${ui} ⑫A=${viaBody} ⑫B=${viaRaw}`);
        // ④는 요구될 때만 싣는다
        const item = buildPropertyTaxRequestBody(form).separateAggregateItem as Record<string, unknown>;
        const wired = "buildingPermit" in item;
        if (wired !== (year >= 2011 && !c.demolished)) mismatches.push(`④ 전송 규칙 위반 ${JSON.stringify(c)} wired=${wired}`);
        // ④ 비철거 용도지역·바닥면적 — 사슬이 읽을 때(허가 칸 없는 시행본 또는 허가 «예»)만 싣는다(숨은 stale 값 미전송)
        if (!c.demolished) {
          const areaWired = "zoningDistrict" in item || "buildingFloorArea" in item;
          const expectAreaWired = year < 2011 || c.permit === "yes";
          if (areaWired !== expectAreaWired) mismatches.push(`④ 면적 전송 규칙 위반 ${JSON.stringify(c)} areaWired=${areaWired}`);
        }
        // 직접 API(⑫B)도 같다 — Zod 통과 본문은 엔진이 던지지 않는다(N3: 허가 «아니오» + 바닥면적만이 throw → 합산 칸 요구 침묵 소실이던 입력)
        if (viaRaw === null) {
          const rawParsed = propertyTaxInputSchema.safeParse(rawBodyOf(c));
          if (rawParsed.success) {
            try {
              calculatePropertyTax(rawParsed.data as PropertyTaxInput);
            } catch (e) {
              mismatches.push(`⑫B 통과 ↔ 엔진 던짐 ${JSON.stringify(c)} ${(e as Error).message}`);
            }
          }
        }
        // 통과 셀은 ⑫ 전체 통과 + 엔진이 던지지 않는다(UI 통과 ↔ 200)
        if (ui === null) {
          const parsed = propertyTaxInputSchema.safeParse(buildPropertyTaxRequestBody(form));
          if (!parsed.success) mismatches.push(`UI 통과 ↔ 400 ${JSON.stringify(c)} ${parsed.error.issues[0]?.message}`);
          else {
            try {
              calculatePropertyTax(parsed.data as PropertyTaxInput);
            } catch (e) {
              mismatches.push(`UI 통과 ↔ 엔진 던짐 ${JSON.stringify(c)} ${(e as Error).message}`);
            }
          }
        }
      }
      expect(mismatches, mismatches.slice(0, 5).join("\n")).toEqual([]);
      // 비공허 — 두 방향을 모두 지나고, 허가 문구로 막히는 셀이 요구 시행본에만 있다
      expect(total).toBe(64);
      expect(passed).toBeGreaterThan(0);
      expect(blocked).toBeGreaterThan(0);
      expect(permitBlocked > 0).toBe(year >= 2011);
      expect(foldPassed > 0).toBe(year >= 2011);
    });
  }
});
