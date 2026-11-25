/**
 * PSA-S2 — 비철거 허가 우선(사슬) 엔진 anchor (계획서 property-separate-demolished-sequential.engine.plan.md §2.6 · §4.2 SN-1~8 · §5.1 T1·T2·T9).
 *   · 판정 동치(T1): 동결 복제본(master e9ab93fb0 비철거 분기)과 격자 — 허가 요건을 통과하는 입력(허가 «예» · 2011.6.1. 전)은 결과 JSON 바이트 동일(throw도 동일),
 *     허가 «아니오»·«모름»·미선택은 판정(접힘 · 인정·이관 면적)이 같고 **throw 0**(N3)이며 고지만 허가 고지로 정정된다(N2).
 *   · 사슬(`propertyBuildingChain`·`propertyBuildingFactIssue`): 허가 → 용도지역 → 바닥면적, 허가 «아니오»·«모름»은 면적 비요구(SN-1~7).
 *   · T9: 허가 «아니오» + 바닥면적만(용도지역 없음) 입력에서도 Step 3 합산 칸 요구가 사라지지 않는다.
 */
import { describe, expect, it } from "vitest";
import { isSeparateAggregateLand } from "../../../lib/tax-engine/separate-aggregate-land";
import type { SeparateAggregateLandItem } from "../../../lib/tax-engine/separate-aggregate-land";
import { propertyLandSplitRequiredFor } from "../../../lib/tax-engine/property-land-split-tax";
import { PROPERTY_BUILDING_AREA_ISSUE_MESSAGE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_BUILDING_PERMIT_NO_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyBuildingChain } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyBuildingFactIssue } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyRequirementFact } from "../../../lib/tax-engine/property-separate-requirements";
import { frozenIsSeparateAggregateLandNonDemolished } from "../_helpers/separate-aggregate-nondemolished-frozen-s2";
import { propertyTaxInputSchema } from "../../../lib/validators/property-input";
import { parseISO } from "../../../lib/tax-engine/utc-date";

const d = parseISO;
const PERMITS: (PropertyRequirementFact | undefined)[] = [undefined, "", "yes", "no", "unknown"];

describe("PSA-S2 — propertyBuildingChain · propertyBuildingFactIssue (오라클 SN-1~7)", () => {
  it("허가 칸이 있는 시행본(2011.6.1.~): 허가 «예»일 때만 면적을 묻고 «아니오»·«모름»은 결과 확정 · 미선택은 멈춤(엄격 순차)", () => {
    const s = d("2026-06-01");
    expect(propertyBuildingChain({ taxBaseDate: s, permit: undefined })).toEqual({ permit: true, areaInputs: false, resolvedFold: false });
    expect(propertyBuildingChain({ taxBaseDate: s, permit: "" })).toEqual({ permit: true, areaInputs: false, resolvedFold: false });
    expect(propertyBuildingChain({ taxBaseDate: s, permit: "yes" })).toEqual({ permit: true, areaInputs: true, resolvedFold: false });
    expect(propertyBuildingChain({ taxBaseDate: s, permit: "no" })).toEqual({ permit: true, areaInputs: false, resolvedFold: true });
    expect(propertyBuildingChain({ taxBaseDate: s, permit: "unknown" })).toEqual({ permit: true, areaInputs: false, resolvedFold: true });
  });

  it("허가 칸이 없는 시행본(2011.5.31. 이전): 허가 답과 무관하게 면적을 바로 묻고 확정 없음", () => {
    for (const permit of PERMITS) expect(propertyBuildingChain({ taxBaseDate: d("2011-05-31"), permit })).toEqual({ permit: false, areaInputs: true, resolvedFold: false });
  });

  it("첫 결함 순서 허가 → 용도지역 → 바닥면적 (SN-1·2·3·4·5)", () => {
    const s = d("2026-06-01");
    const issue = (permit: PropertyRequirementFact | undefined, zoningDistrict?: string, buildingFloorArea?: number) => propertyBuildingFactIssue({ taxBaseDate: s, permit, zoningDistrict, buildingFloorArea });
    expect(issue("", "commercial", 100)).toEqual({ field: "buildingPermit", message: PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE }); // SN-1 — 면적이 있어도 허가부터
    expect(issue("no")).toBeNull(); // SN-2
    expect(issue("unknown")).toBeNull(); // SN-3
    expect(issue("yes")).toEqual({ field: "zoningDistrict", message: PROPERTY_BUILDING_AREA_ISSUE_MESSAGE.zoningDistrict }); // SN-4
    expect(issue("yes", "commercial")).toEqual({ field: "buildingFloorArea", message: PROPERTY_BUILDING_AREA_ISSUE_MESSAGE.buildingFloorArea });
    expect(issue("yes", "commercial", 0)?.field).toBe("buildingFloorArea");
    expect(issue("yes", "commercial", 100)).toBeNull(); // SN-5
    // SN-7 — 허가 칸 없는 시행본은 용도지역 → 바닥면적부터
    const old = (zoningDistrict?: string, buildingFloorArea?: number) => propertyBuildingFactIssue({ taxBaseDate: d("2010-06-01"), permit: undefined, zoningDistrict, buildingFloorArea });
    expect(old()?.field).toBe("zoningDistrict");
    expect(old("commercial")?.field).toBe("buildingFloorArea");
    expect(old("commercial", 100)).toBeNull();
  });
});

describe("PSA-S2 — 엔진 직접 호출: 허가 접힘이 면적 읽기보다 앞 (N2·N3)", () => {
  const land = (over: Partial<SeparateAggregateLandItem>): SeparateAggregateLandItem & { taxBaseDate: string } => ({
    id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: 1_000_000, taxBaseDate: "2026-06-01", ...over,
  });

  it("N2 — 허가 «아니오» + 용도지역·바닥면적 없음: 접힘(인정 0 · 이관 300) + «허가 등을 받아야…» 고지 · buildingPermitFolded (종전: «건축물이 없는 토지» 오표기)", () => {
    const r = isSeparateAggregateLand(land({ buildingPermit: "no" }));
    expect([r.isSeparateAggregate, r.recognizedArea, r.excessArea, r.buildingPermitFolded]).toEqual([false, 0, 300, true]);
    expect(r.warnings).toEqual([PROPERTY_BUILDING_PERMIT_NO_NOTICE]);
    expect(isSeparateAggregateLand(land({ buildingPermit: "unknown" })).warnings).toEqual([PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE]);
    expect(frozenIsSeparateAggregateLandNonDemolished(land({ buildingPermit: "no" })).warnings).toEqual(["건축물이 없는 토지는 종합합산과세대상입니다."]);
  });

  it("N3 — 허가 «아니오» + 바닥면적만(용도지역 없음)·미등재 용도지역: 던지지 않고 접힘 (종전 throw)", () => {
    expect(() => frozenIsSeparateAggregateLandNonDemolished(land({ buildingPermit: "no", buildingFloorArea: 100 }))).toThrow();
    for (const extra of [{ buildingFloorArea: 100 }, { buildingFloorArea: 100, zoningDistrict: "xxx" as never }]) {
      const r = isSeparateAggregateLand(land({ buildingPermit: "no", ...extra }));
      expect([r.isSeparateAggregate, r.recognizedArea, r.excessArea, r.buildingPermitFolded]).toEqual([false, 0, 300, true]);
    }
  });

  it("T9 — 허가 «아니오» + 바닥면적만: Step 3 합산 칸 요구가 사라지지 않는다(종합합산 칸 요구 · 종전 catch → 요구 없음)", () => {
    const required = (item: SeparateAggregateLandItem) => propertyLandSplitRequiredFor({ landTaxType: "separate_aggregate", separateAggregateItem: item, targetDate: "2026-06-01" });
    for (const extra of [{}, { buildingFloorArea: 100 }, { zoningDistrict: "commercial" as const }, { zoningDistrict: "commercial" as const, buildingFloorArea: 100 }]) {
      expect(required(land({ buildingPermit: "no", ...extra }) as SeparateAggregateLandItem), JSON.stringify(extra)).toEqual({ otherSeparate: false, otherComprehensive: true });
    }
    const frozenThrows = (() => {
      try {
        frozenIsSeparateAggregateLandNonDemolished(land({ buildingPermit: "no", buildingFloorArea: 100 }));
        return false;
      } catch {
        return true;
      }
    })();
    expect(frozenThrows).toBe(true); // 종전 엔진이 던져 `propertyLandSplitRequiredFor`의 catch가 «요구 없음»으로 삼켰던 입력
  });
});

describe("PSA-S2 — T1 판정 동치 격자 (동결 복제본 vs 새 엔진 · 비철거 · 과세기준일 × 허가 5값 × 공장 × 용도지역 × 바닥면적 × 면적 초과)", () => {
  const DATES = ["2010-06-01", "2011-05-31", "2011-06-01", "2019-06-01", "2026-06-01"];
  const ZONES: (string | undefined)[] = ["commercial", "industrial", undefined, "xxx"];
  const FLOORS: (number | undefined)[] = [undefined, 0, 100, 400];
  const LAND_AREAS = [300, 1000]; // 상업 100㎡×3=300 이내 / 초과

  const run = (f: typeof frozenIsSeparateAggregateLandNonDemolished, item: SeparateAggregateLandItem & { taxBaseDate: string }) => {
    try {
      return { ok: f(item) as unknown };
    } catch (e) {
      return { threw: (e as Error).message };
    }
  };
  const permitHolds = (date: string, permit: PropertyRequirementFact | undefined) => date < "2011-06-01" || permit === "yes";

  it("허가 요건 통과 입력은 결과 JSON·throw까지 바이트 동일 · 통과 못 하면 판정(접힘 · 면적)이 같고 새 엔진은 던지지 않으며 고지가 허가 고지(V-8 · N2 · N3)", () => {
    let cells = 0;
    let identical = 0;
    let foldedCells = 0;
    let frozenThrewNewDidNot = 0;
    const bad: string[] = [];
    for (const taxBaseDate of DATES)
      for (const permit of PERMITS)
        for (const isFactory of [false, true])
          for (const zoningDistrict of ZONES)
            for (const buildingFloorArea of FLOORS)
              for (const landArea of LAND_AREAS) {
                cells++;
                const item = { id: "p1", jurisdictionCode: "000000", landArea, officialLandPrice: 1_000_000, taxBaseDate, isFactory, zoningDistrict, buildingFloorArea, buildingPermit: permit } as SeparateAggregateLandItem & { taxBaseDate: string };
                const tag = JSON.stringify({ taxBaseDate, permit, isFactory, zoningDistrict, buildingFloorArea, landArea });
                const before = run(frozenIsSeparateAggregateLandNonDemolished, item);
                const after = run(isSeparateAggregateLand as typeof frozenIsSeparateAggregateLandNonDemolished, item);
                if (permitHolds(taxBaseDate, permit)) {
                  if (JSON.stringify(before) !== JSON.stringify(after)) bad.push(`바이트 불일치 ${tag}\n  전 ${JSON.stringify(before)}\n  후 ${JSON.stringify(after)}`);
                  else identical++;
                  continue;
                }
                foldedCells++;
                if (!("ok" in after)) { bad.push(`허가 미통과인데 새 엔진이 던짐 ${tag} ${(after as { threw: string }).threw}`); continue; }
                const a = after.ok as ReturnType<typeof isSeparateAggregateLand>;
                if (a.isSeparateAggregate || a.recognizedArea !== 0 || a.excessArea !== landArea || a.buildingPermitFolded !== true) bad.push(`접힘 아님 ${tag} ${JSON.stringify(a)}`);
                if (a.warnings.length !== 1 || ![PROPERTY_BUILDING_PERMIT_NO_NOTICE, PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE].includes(a.warnings[0])) bad.push(`고지 불일치 ${tag} ${JSON.stringify(a.warnings)}`);
                if (!("ok" in before)) { frozenThrewNewDidNot++; continue; }
                const b = before.ok as ReturnType<typeof isSeparateAggregateLand>;
                // 판정 동치 — 접힘/성립 · 인정·이관 면적이 종전과 같다(종전엔 «건축물 없음»·«기준면적 없음»·«허가 접힘»이 모두 전량 이관)
                if (b.isSeparateAggregate !== a.isSeparateAggregate || b.recognizedArea !== a.recognizedArea || b.excessArea !== a.excessArea) bad.push(`판정 불일치 ${tag}`);
              }
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    // 비공허 — 두 갈래 모두 지나고, 종전 throw 입력이 있다(N3)
    expect(cells).toBe(DATES.length * PERMITS.length * 2 * ZONES.length * FLOORS.length * LAND_AREAS.length);
    expect(identical).toBeGreaterThan(300);
    expect(foldedCells).toBeGreaterThan(300);
    expect(frozenThrewNewDidNot).toBeGreaterThan(0);
  });
});

describe("PSA-S2 — T2 완화만(강화 0건) · ⑫ Zod 비철거: 새 400은 종전 400의 부분집합", () => {
  /** 종전(master e9ab93fb0) ⑫ 비철거 규칙의 동결 서술 — 용도지역 · 바닥면적 무조건 요구 + (2011.6.1.~) 허가 요구 */
  const oldRequires = (targetDate: string, item: { zoningDistrict?: string; buildingFloorArea?: number; buildingPermit?: string }) => {
    const out: string[] = [];
    if (!item.zoningDistrict) out.push("zoningDistrict");
    if (!item.buildingFloorArea) out.push("buildingFloorArea");
    if (targetDate >= "2011-06-01" && (item.buildingPermit === undefined || item.buildingPermit === "")) out.push("buildingPermit");
    return out;
  };
  it("격자(과세기준일 4 × 허가 5 × 용도지역 2 × 바닥면적 2 × 공장 2): 종전에 통과한 본문은 새도 통과 · 새 400의 결함 칸은 종전 400의 결함 칸 중 하나 · 허가 «아니오»·«모름»은 면적 없이 통과", () => {
    const bad: string[] = [];
    let relaxed = 0;
    let stillBlocked = 0;
    for (const targetDate of ["2010-06-01", "2011-06-01", "2019-06-01", "2026-06-01"])
      for (const buildingPermit of [undefined, "", "yes", "no", "unknown"])
        for (const zoningDistrict of [undefined, "commercial"])
          for (const buildingFloorArea of [undefined, 100])
            for (const isFactory of [false, true]) {
              const item = { id: "p", jurisdictionCode: "000000", landArea: 300, officialLandPrice: 1_000_000, ...(buildingPermit !== undefined ? { buildingPermit } : {}), ...(zoningDistrict ? { zoningDistrict } : {}), ...(buildingFloorArea ? { buildingFloorArea } : {}), ...(isFactory ? { isFactory: true } : {}) };
              const body = { objectType: "land", landTaxType: "separate_aggregate", publishedPrice: 300_000_000, targetDate, otherSeparateAggregateValue: 0, otherComprehensiveValue: 0, separateAggregateItem: item };
              const tag = JSON.stringify({ targetDate, buildingPermit, zoningDistrict, buildingFloorArea });
              const r = propertyTaxInputSchema.safeParse(body);
              const fields = r.success ? [] : r.error.issues.filter((i) => i.path[0] === "separateAggregateItem").map((i) => String(i.path[1]));
              const old = oldRequires(targetDate, item);
              if (old.length === 0 && fields.length > 0) bad.push(`강화 ${tag} → ${fields}`);
              for (const f of fields) if (!old.includes(f)) bad.push(`새 결함 칸 ${f}가 종전에 없음 ${tag}`);
              if (old.length > 0 && fields.length === 0) relaxed++;
              if (old.length > 0 && fields.length > 0) stillBlocked++;
              if (targetDate >= "2011-06-01" && (buildingPermit === "no" || buildingPermit === "unknown") && fields.length > 0) bad.push(`허가 확정인데 400 ${tag} → ${fields}`);
            }
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(relaxed).toBeGreaterThan(5);
    expect(stillBlocked).toBeGreaterThan(5);
  });
});
