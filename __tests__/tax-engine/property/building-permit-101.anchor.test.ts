/**
 * PSA-E3 — 비철거 건축물 부속토지의 허가·사용승인 요건(「지방세법 시행령」 §101① 단서 · 첫 과세기준일 2011.6.1.) 엔진 anchor.
 * 오라클: 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §7.3(K-27~K-29) · §3(K-F) · §13.4~13.5(이관분 세액).
 *
 * 기대값은 엔진 출력으로 만들지 않는다 — 계획서 표의 숫자(별도합산 430,000/516,000 · 종합합산 환산 800,000/960,000)와
 * 독립 산식(공시지가 100만원/㎡ × 70% → 별도합산 0.2/0.3%−20만/0.4%−120만 · 종합합산 0.2%/0.3%−5만/0.5%−25만)으로 대조한다.
 * 합계 = 본세 + 지방교육세(본세 × 20%) — 도시지역분 없음 · 단독 필지 · 세부담상한 없음.
 */
import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import { calculateSeparateAggregateTax, isSeparateAggregateLand } from "../../../lib/tax-engine/separate-aggregate-land";
import { propertyLandSplitRequiredFor } from "../../../lib/tax-engine/property-land-split-tax";
import {
  PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE,
  PROPERTY_BUILDING_PERMIT_NO_NOTICE,
  PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE,
  propertyBuildingPermitFactIssue,
  propertyBuildingPermitHolds,
  propertyBuildingPermitRequired,
} from "../../../lib/tax-engine/property-separate-requirements";
import { parseISO } from "../../../lib/tax-engine/utc-date";
import type { PropertyTaxInput } from "../../../lib/tax-engine/types/property.types";
import type { SeparateAggregateLandItem } from "../../../lib/tax-engine/separate-aggregate-land";

type Item = NonNullable<PropertyTaxInput["separateAggregateItem"]>;

function separateTax(value: number): number {
  const base = Math.floor((value * 70) / 100);
  if (base <= 200_000_000) return Math.floor(base * 0.002);
  if (base <= 1_000_000_000) return Math.floor(base * 0.003) - 200_000;
  return Math.floor(base * 0.004) - 1_200_000;
}
function comprehensiveTax(value: number): number {
  const base = Math.floor((value * 70) / 100);
  if (base <= 50_000_000) return Math.floor(base * 0.002);
  if (base <= 100_000_000) return Math.floor(base * 0.003) - 50_000;
  return Math.floor(base * 0.005) - 250_000;
}
const PRICE = 1_000_000;

/** 비철거 건축물 — 상업 3배 · 바닥 100(한도 300) · 300㎡ */
function building(over: Partial<Item> = {}): Item {
  return { id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: PRICE, zoningDistrict: "commercial", buildingFloorArea: 100, buildingPermit: "yes", ...over };
}
function run(item: Item, targetDate = "2026-06-01") {
  return calculatePropertyTax({
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: item.landArea * PRICE,
    targetDate,
    otherSeparateAggregateValue: 0,
    otherComprehensiveValue: 0,
    separateAggregateItem: item,
  } as PropertyTaxInput);
}
const check = (item: Item, taxBaseDate: string) => isSeparateAggregateLand({ ...(item as SeparateAggregateLandItem), taxBaseDate });

describe("PSA-E3 — 요구 술어 · 시행 경계(2011.6.1.)", () => {
  it("과세기준일 2011-05-31 이전 = 요구 없음 · 2011-06-01부터 = 요구(경계 하루)", () => {
    expect(propertyBuildingPermitRequired(parseISO("2011-05-31"))).toBe(false);
    expect(propertyBuildingPermitRequired(parseISO("2011-06-01"))).toBe(true);
    expect(propertyBuildingPermitRequired(parseISO("2026-06-01"))).toBe(true);
    expect(propertyBuildingPermitRequired(parseISO("garbage"))).toBe(false);
  });
  it("holds — 요구 없는 시행본은 어떤 값이든 성립 · 요구 시행본은 yes만 성립(no·unknown·미선택 불성립)", () => {
    const old = parseISO("2010-06-01");
    const cur = parseISO("2026-06-01");
    for (const permit of [undefined, "", "yes", "no", "unknown"] as const) expect(propertyBuildingPermitHolds({ taxBaseDate: old, permit })).toBe(true);
    expect(propertyBuildingPermitHolds({ taxBaseDate: cur, permit: "yes" })).toBe(true);
    for (const permit of [undefined, "", "no", "unknown"] as const) expect(propertyBuildingPermitHolds({ taxBaseDate: cur, permit })).toBe(false);
  });
  it("결함 — 요구 시행본에서만 미선택·미입력이 막힌다(no·unknown은 막지 않는다) · 문구는 «사용 중인»을 담는다", () => {
    const cur = parseISO("2026-06-01");
    expect(propertyBuildingPermitFactIssue({ taxBaseDate: cur, permit: "" })).toEqual({ field: "buildingPermit", message: PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE });
    expect(propertyBuildingPermitFactIssue({ taxBaseDate: cur, permit: undefined })?.field).toBe("buildingPermit");
    for (const permit of ["yes", "no", "unknown"] as const) expect(propertyBuildingPermitFactIssue({ taxBaseDate: cur, permit })).toBeNull();
    expect(propertyBuildingPermitFactIssue({ taxBaseDate: parseISO("2010-06-01"), permit: "" })).toBeNull();
    expect(PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE).toContain("사용 중");
    expect(PROPERTY_BUILDING_PERMIT_NO_NOTICE).toContain("사용 중인");
  });
});

describe("PSA-E3 — K-27~K-29 · K-F 엔진 연결(판정 · 이관 사유 · 본세 · 총액)", () => {
  it("대조군(허가 yes) — 별도합산 300㎡ · 430,000 / 516,000(현행과 같다)", () => {
    const out = run(building());
    expect([out.determinedTax, out.totalPayable]).toEqual([430_000, 516_000]);
    expect(out.landSplit?.comprehensive?.transferReasons).toBeUndefined();
    expect(separateTax(300 * PRICE)).toBe(430_000);
  });

  it("K-27 허가 no · s=2026-06-01 → 종합합산 이관 800,000 / 960,000(현행은 별도합산 430,000 / 516,000) · 사유 building_permit", () => {
    const out = run(building({ buildingPermit: "no" }));
    expect([out.determinedTax, out.totalPayable]).toEqual([800_000, 960_000]);
    expect(out.determinedTax).toBe(comprehensiveTax(300 * PRICE));
    expect(out.landSplit?.comprehensive?.transferReasons).toEqual(["building_permit"]);
    expect(out.landSplit?.separate?.ownValue ?? 0).toBe(0);
    expect(out.warnings.join("\n")).toContain(PROPERTY_BUILDING_PERMIT_NO_NOTICE);
    expect(out.warnings.join("\n")).not.toContain("종합합산으로 이관됩니다. 인별 합산");
  });

  it("허가 unknown → 같은 이관 + «확인되지 않아» 고지 · 엔진 직접 호출에서 미선택·미입력도 yes가 아니므로 접힌다(throw 없음)", () => {
    const unknown = run(building({ buildingPermit: "unknown" }));
    expect([unknown.determinedTax, unknown.totalPayable]).toEqual([800_000, 960_000]);
    expect(unknown.warnings.join("\n")).toContain(PROPERTY_BUILDING_PERMIT_UNKNOWN_NOTICE);
    for (const permit of [undefined, ""] as const) {
      const out = run(building({ buildingPermit: permit }));
      expect(out.determinedTax).toBe(800_000);
      expect(out.landSplit?.comprehensive?.transferReasons).toEqual(["building_permit"]);
    }
  });

  it("K-28 s=2010-06-01 · 허가 no → 별도합산 유지(단서 시행 전 — 칸 불요) · 430,000 / 516,000", () => {
    const c = check(building({ buildingPermit: "no" }), "2010-06-01");
    expect([c.isSeparateAggregate, c.recognizedArea, c.excessArea, c.buildingPermitFolded]).toEqual([true, 300, 0, undefined]);
    const out = run(building({ buildingPermit: undefined }), "2010-06-01");
    expect([out.determinedTax, out.totalPayable]).toEqual([430_000, 516_000]);
  });

  it("K-29 s=2011-06-01 · 허가 no → 접힘 · 2011-05-31은 별도합산(경계 하루) · 세액까지", () => {
    expect(check(building({ buildingPermit: "no" }), "2011-05-31").isSeparateAggregate).toBe(true);
    const c = check(building({ buildingPermit: "no" }), "2011-06-01");
    expect([c.isSeparateAggregate, c.recognizedArea, c.excessArea, c.buildingPermitFolded]).toEqual([false, 0, 300, true]);
    const out = run(building({ buildingPermit: "no" }), "2011-06-01");
    expect([out.determinedTax, out.totalPayable]).toEqual([800_000, 960_000]);
  });

  it("공장용지(isFactory)도 §101① 단서 대상 — 같은 접힘 · 허가 yes면 별도합산", () => {
    expect(run(building({ isFactory: true, buildingPermit: "no" })).determinedTax).toBe(800_000);
    expect(run(building({ isFactory: true, buildingPermit: "yes" })).determinedTax).toBe(430_000);
    expect(check(building({ isFactory: true, buildingPermit: "no" }), "2026-06-01").legalBasis).toContain("§101①");
  });

  it("면적 초과 + 허가 no — 전체가 종합합산(면적 초과 이관이 아니라 허가 이관) · 1,000㎡ 공업 4배 → 별도합산 640,000 + 이관 1,850,000 이던 입력이 전부 종합합산", () => {
    const yes = run(building({ landArea: 1000, zoningDistrict: "industrial" }));
    expect(yes.determinedTax).toBe(separateTax(400 * PRICE) + comprehensiveTax(600 * PRICE));
    expect(yes.landSplit?.comprehensive?.transferReasons).toEqual(["area_excess"]);
    const no = run(building({ landArea: 1000, zoningDistrict: "industrial", buildingPermit: "no" }));
    expect(no.determinedTax).toBe(comprehensiveTax(1000 * PRICE));
    expect(no.landSplit?.comprehensive?.transferReasons).toEqual(["building_permit"]);
  });

  it("허가 «예»(허가 요건을 통과)인데 바닥면적이 없으면 no_building(종전 그대로) — 건축물 존재 판정은 허가 통과 뒤에 읽는다", () => {
    const out = run({ id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: PRICE, zoningDistrict: "commercial", buildingPermit: "yes" });
    expect(out.landSplit?.comprehensive?.transferReasons).toEqual(["no_building"]);
  });

  it("PSA-S2 N2 — 허가 «아니오»·«모름»은 바닥면적·용도지역이 없어도 허가 사유로 접힌다(종전 no_building 오표기 정정 · 이관 면적·세액은 같다)", () => {
    for (const buildingPermit of ["no", "unknown", ""] as const) {
      for (const extra of [{ zoningDistrict: "commercial" }, {}, { buildingFloorArea: 100 }, { zoningDistrict: "commercial", buildingFloorArea: 100 }] as const) {
        const out = run({ id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: PRICE, buildingPermit, ...extra });
        expect(out.landSplit?.comprehensive?.transferReasons, JSON.stringify({ buildingPermit, extra })).toEqual(["building_permit"]);
        expect(out.determinedTax).toBe(comprehensiveTax(300 * PRICE));
      }
    }
  });

  it("철거 필지는 buildingPermit을 읽지 않는다 — 철거 경로 결과가 바이트 동일(요구·판정은 demolishedPermit이 맡는다)", () => {
    const base: Item = {
      id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: PRICE, zoningDistrict: "commercial", buildingFloorArea: 100,
      demolished: true, demolishedDate: "2026-01-01", demolishedKind: "building", demolishedPermit: "yes", demolishedOtherUse: "no",
    };
    const clean = run(base);
    expect(clean.determinedTax).toBe(430_000);
    for (const buildingPermit of ["yes", "no", "unknown", ""] as const) {
      expect(JSON.stringify(run({ ...base, buildingPermit }))).toBe(JSON.stringify(clean));
    }
  });

  it("합산 칸 요구 — 전량 접힘이면 종합합산 칸만 요구(별도합산분 0이라 타 별도합산 칸은 비요구)", () => {
    const sepItem = (buildingPermit: "yes" | "no") => building({ buildingPermit }) as SeparateAggregateLandItem;
    expect(propertyLandSplitRequiredFor({ landTaxType: "separate_aggregate", separateAggregateItem: sepItem("yes"), targetDate: "2026-06-01" })).toEqual({ otherSeparate: true, otherComprehensive: false });
    expect(propertyLandSplitRequiredFor({ landTaxType: "separate_aggregate", separateAggregateItem: sepItem("no"), targetDate: "2026-06-01" })).toEqual({ otherSeparate: false, otherComprehensive: true });
  });

  it("다필지 `calculateSeparateAggregateTax`도 같은 판정 — 허가 no 필지는 별도합산 합산에서 빠지고 이관 가액으로 집계", () => {
    const land = (id: string, buildingPermit: "yes" | "no") => ({ ...(building({ id, buildingPermit }) as SeparateAggregateLandItem), taxBaseDate: "2026-06-01" });
    const r = calculateSeparateAggregateTax({ taxpayerId: "t", targetYear: 2026, landList: [land("a", "yes"), land("b", "no")] });
    expect(r.totalSeparateOfficialValue).toBe(300 * PRICE);
    expect(r.totalExcessOfficialValue).toBe(300 * PRICE);
    expect(r.landChecks.map((c) => c.buildingPermitFolded ?? false)).toEqual([false, true]);
  });
});
