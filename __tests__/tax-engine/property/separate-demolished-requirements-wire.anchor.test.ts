/**
 * PSA-E2 — 철거 요건 leaf를 엔진(`isSeparateAggregateLand` → `calculatePropertyTax`)에 연결한 세액 anchor.
 * 오라클: 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §7(K-1~K-26) · §13.4~13.5(이관분 세액).
 *
 * 기대값은 엔진 출력으로 만들지 않는다 — 표의 숫자(430,000 · 800,000 · 1,150,000 · 1,900,000 · 2,490,000 …)와
 * 아래 독립 산식(공시지가 100만원/㎡ × 70% → 별도합산 0.2/0.3%−20만/0.4%−120만 · 종합합산 0.2%/0.3%−5만/0.5%−25만)으로 대조한다.
 * 합계 = 본세 + 지방교육세(본세 × 20%) — 도시지역분 없음 · 단독 필지 · 세부담상한 없음.
 */
import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import { isSeparateAggregateLand } from "../../../lib/tax-engine/separate-aggregate-land";
import type { PropertyTaxInput } from "../../../lib/tax-engine/types/property.types";
import type { SeparateAggregateLandItem } from "../../../lib/tax-engine/separate-aggregate-land";

type Item = NonNullable<PropertyTaxInput["separateAggregateItem"]>;

/** 별도합산 본세(독립 산식) */
function separateTax(value: number): number {
  const base = Math.floor((value * 70) / 100);
  if (base <= 200_000_000) return Math.floor(base * 0.002);
  if (base <= 1_000_000_000) return Math.floor(base * 0.003) - 200_000;
  return Math.floor(base * 0.004) - 1_200_000;
}
/** 종합합산 본세(독립 산식) */
function comprehensiveTax(value: number): number {
  const base = Math.floor((value * 70) / 100);
  if (base <= 50_000_000) return Math.floor(base * 0.002);
  if (base <= 100_000_000) return Math.floor(base * 0.003) - 50_000;
  return Math.floor(base * 0.005) - 250_000;
}
const PRICE = 1_000_000; // 원/㎡

/** 철거 건축물 — 상업 3배 · 바닥 100(한도 300) · 허가 yes · 건축 외 용도 no · 철거 2026-01-01 */
function building(over: Partial<Item> = {}): Item {
  return {
    id: "p1",
    jurisdictionCode: "000000",
    landArea: 300,
    officialLandPrice: PRICE,
    zoningDistrict: "commercial",
    buildingFloorArea: 100,
    demolished: true,
    demolishedDate: "2026-01-01",
    demolishedKind: "building",
    demolishedPermit: "yes",
    demolishedOtherUse: "no",
    ...over,
  };
}
/** 철거 주택 — 부속토지 400㎡ · 바닥면적·용도지역 입력 없음(주택은 면적 한도가 없다) */
function house(over: Partial<Item> = {}): Item {
  return {
    id: "p1",
    jurisdictionCode: "000000",
    landArea: 400,
    officialLandPrice: PRICE,
    demolished: true,
    demolishedDate: "2026-01-01",
    demolishedKind: "house",
    demolishedPermit: "yes",
    demolishedOtherUse: "no",
    demolishedVacantHouse: "no",
    ...over,
  };
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

interface Row {
  label: string;
  item: Item;
  targetDate?: string;
  /** 별도합산 인정 면적 · 종합합산 이관 면적(㎡) */
  area: [number, number];
  /** 이관 사유(echo) — 이관분이 없으면 [] */
  reasons: string[];
  /** 계획서 표의 본세 — 별도합산분 + 이관분 합계 */
  tax: number;
}

const ROWS: Row[] = [
  { label: "K-1 요건 충족 → 별도합산 300㎡", item: building(), area: [300, 0], reasons: [], tax: 430_000 },
  { label: "K-2 허가 no → 종합합산 이관(permit)", item: building({ demolishedPermit: "no" }), area: [0, 300], reasons: ["permit"], tax: 800_000 },
  { label: "K-3 허가 unknown → 종합합산 이관(permit)", item: building({ demolishedPermit: "unknown" }), area: [0, 300], reasons: ["permit"], tax: 800_000 },
  { label: "K-5 건축 외 용도 yes → 이관(other_use)", item: building({ demolishedOtherUse: "yes" }), area: [0, 300], reasons: ["other_use"], tax: 800_000 },
  { label: "K-6 건축 외 용도 unknown → 이관(other_use)", item: building({ demolishedOtherUse: "unknown" }), area: [0, 300], reasons: ["other_use"], tax: 800_000 },
  { label: "K-7 철거 2025-06-01(1년 만료일 당일) → 별도합산", item: building({ demolishedDate: "2025-06-01" }), area: [300, 0], reasons: [], tax: 430_000 },
  { label: "K-8 철거 2025-05-31 → 이관(demolished_period) — 사실 칸 불요", item: building({ demolishedDate: "2025-05-31", demolishedPermit: undefined, demolishedOtherUse: undefined }), area: [0, 300], reasons: ["demolished_period"], tax: 800_000 },
  { label: "K-9 1,000㎡ 공업 4배 바닥 100 → 400㎡ + 600㎡", item: building({ landArea: 1000, zoningDistrict: "industrial" }), area: [400, 600], reasons: ["area_excess"], tax: 640_000 + 1_850_000 },
  { label: "K-10 s=2018-06-01 · 허가 no → 별도합산(허가 문언 전)", item: building({ demolishedDate: "2018-03-01", demolishedPermit: "no", demolishedOtherUse: undefined }), targetDate: "2018-06-01", area: [300, 0], reasons: [], tax: 430_000 },
  { label: "K-11 s=2019-06-01 · 허가 no → 이관(permit)", item: building({ demolishedDate: "2019-02-01", demolishedPermit: "no", demolishedOtherUse: undefined }), targetDate: "2019-06-01", area: [0, 300], reasons: ["permit"], tax: 800_000 },
  { label: "K-12 s=2023-06-01 · 건축 외 용도 yes → 별도합산(문언 전 — 칸 불요)", item: building({ demolishedDate: "2023-03-01", demolishedOtherUse: "yes" }), targetDate: "2023-06-01", area: [300, 0], reasons: [], tax: 430_000 },
  { label: "K-13 s=2024-06-01 · 건축 외 용도 yes → 이관(other_use)", item: building({ demolishedDate: "2024-03-01", demolishedOtherUse: "yes" }), targetDate: "2024-06-01", area: [0, 300], reasons: ["other_use"], tax: 800_000 },
  { label: "K-14 s=2015-06-01 → 이관(시행 전 — demolished_period)", item: building({ demolishedDate: "2015-03-01", demolishedPermit: undefined, demolishedOtherUse: undefined }), targetDate: "2015-06-01", area: [0, 300], reasons: ["demolished_period"], tax: 800_000 },
  { label: "K-15 주택 · 철거 2026-01-01 → 400㎡ 전부(배율 한도 없음 — 현행 320 + 80)", item: house(), area: [400, 0], reasons: [], tax: 640_000 },
  { label: "K-16 주택 · 철거 2024-06-15 · 빈집 yes → 3년 안 별도합산 400㎡", item: house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes" }), area: [400, 0], reasons: [], tax: 640_000 },
  { label: "K-17 같은 · 빈집 no → 이관(demolished_period)", item: house({ demolishedDate: "2024-06-15" }), area: [0, 400], reasons: ["demolished_period"], tax: 1_150_000 },
  { label: "K-18 같은 · 빈집 unknown → 이관(demolished_period) + 3년 연장 미확인 고지", item: house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "unknown" }), area: [0, 400], reasons: ["demolished_period"], tax: 1_150_000 },
  {
    label: "K-19 빈집 yes · 건축 외 yes · 공용 yes · 유료 yes → 2호 단서 포함 → 별도합산 400㎡",
    item: house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes", demolishedOtherUse: "yes", demolishedPublicUse: "yes", demolishedPublicUsePaid: "yes" }),
    area: [400, 0],
    reasons: [],
    tax: 640_000,
  },
  {
    label: "K-20 유료 no(무상 공용) → 이관(public_use_unpaid)",
    item: house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes", demolishedOtherUse: "yes", demolishedPublicUse: "yes", demolishedPublicUsePaid: "no" }),
    area: [0, 400],
    reasons: ["public_use_unpaid"],
    tax: 1_150_000,
  },
  {
    label: "K-21 공용 no → 이관(other_use)",
    item: house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes", demolishedOtherUse: "yes", demolishedPublicUse: "no" }),
    area: [0, 400],
    reasons: ["other_use"],
    tax: 1_150_000,
  },
  {
    label: "K-22 건축 외 yes · 빈집 no → 단서 불성립 — stale 공용·유료 yes는 읽히지 않는다 → 이관(other_use)",
    item: house({ demolishedOtherUse: "yes", demolishedPublicUse: "yes", demolishedPublicUsePaid: "yes" }),
    area: [0, 400],
    reasons: ["other_use"],
    tax: 1_150_000,
  },
  {
    label: "K-23 건축물 · 직접 API가 빈집 yes를 보내도 무시 → 이관(demolished_period)",
    item: building({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes" }),
    area: [0, 300],
    reasons: ["demolished_period"],
    tax: 800_000,
  },
  { label: "K-24 주택 · s=2023-06-01 · 철거 2023-03-01 → 400㎡ 전부", item: house({ demolishedDate: "2023-03-01", demolishedVacantHouse: undefined, demolishedOtherUse: undefined }), targetDate: "2023-06-01", area: [400, 0], reasons: [], tax: 640_000 },
  {
    label: "K-25 건축물 · s=2023-06-01 · 공업 1,000㎡ 바닥 100 → 면적 문언 전이라 1,000㎡ 전부(바닥면적·용도지역 불요)",
    item: building({ landArea: 1000, zoningDistrict: undefined, buildingFloorArea: undefined, demolishedDate: "2023-03-01", demolishedOtherUse: undefined }),
    targetDate: "2023-06-01",
    area: [1000, 0],
    reasons: [],
    tax: 1_900_000,
  },
  { label: "K-26 같은 시료 s=2024-06-01 · 철거 2024-03-01 → 400㎡ + 600㎡", item: building({ landArea: 1000, zoningDistrict: "industrial", demolishedDate: "2024-03-01" }), targetDate: "2024-06-01", area: [400, 600], reasons: ["area_excess"], tax: 640_000 + 1_850_000 },
];

describe("PSA-E2 — K-1~K-26 엔진 연결: 판정 · 이관 사유 · 본세 · 총액 (오라클 직접 대조)", () => {
  for (const r of ROWS) {
    it(r.label, () => {
      const out = run(r.item, r.targetDate);
      const check = isSeparateAggregateLand({ ...(r.item as SeparateAggregateLandItem), taxBaseDate: r.targetDate ?? "2026-06-01" });
      expect([check.recognizedArea, check.excessArea]).toEqual(r.area);
      expect(out.landSplit?.comprehensive?.transferReasons ?? []).toEqual(r.reasons);
      expect(out.determinedTax).toBe(r.tax);
      expect(out.totalPayable).toBe(r.tax + Math.floor(r.tax * 0.2));
      // 독립 산식 대조 — 별도합산분 + 이관분
      expect(r.tax).toBe(separateTax(r.area[0] * PRICE) + comprehensiveTax(r.area[1] * PRICE));
    });
  }

  it("계획서 표의 대표 숫자 — K-1 430,000/516,000 · K-2 800,000/960,000 · K-9 2,490,000/2,988,000 · K-17 1,150,000/1,380,000 · K-25 1,900,000/2,280,000", () => {
    expect([run(building()).determinedTax, run(building()).totalPayable]).toEqual([430_000, 516_000]);
    expect([run(building({ demolishedPermit: "no" })).determinedTax, run(building({ demolishedPermit: "no" })).totalPayable]).toEqual([800_000, 960_000]);
    const k9 = run(building({ landArea: 1000, zoningDistrict: "industrial" }));
    expect([k9.determinedTax, k9.totalPayable]).toEqual([2_490_000, 2_988_000]);
    const k17 = run(house({ demolishedDate: "2024-06-15" }));
    expect([k17.determinedTax, k17.totalPayable]).toEqual([1_150_000, 1_380_000]);
    const k25 = run(building({ landArea: 1000, zoningDistrict: undefined, buildingFloorArea: undefined, demolishedDate: "2023-03-01", demolishedOtherUse: undefined }), "2023-06-01");
    expect([k25.determinedTax, k25.totalPayable]).toEqual([1_900_000, 2_280_000]);
  });

  it("K-3 «확인되지 않아» · K-2 «받지 않은» · K-18 «3년 연장» · K-20 «비과세» · K-25 «면적 문언 없음» · K-15 «주택 10배» 고지가 결과 warnings에 실린다", () => {
    const w = (item: Item, t?: string) => run(item, t).warnings.join("\n");
    expect(w(building({ demolishedPermit: "unknown" }))).toContain("확인되지 않아");
    expect(w(building({ demolishedPermit: "no" }))).toContain("받지 않은");
    expect(w(house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "unknown" }))).toContain("3년 연장");
    expect(w(house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes", demolishedOtherUse: "yes", demolishedPublicUse: "yes", demolishedPublicUsePaid: "no" }))).toContain("비과세");
    expect(w(building({ landArea: 1000, zoningDistrict: undefined, buildingFloorArea: undefined, demolishedDate: "2023-03-01", demolishedOtherUse: undefined }), "2023-06-01")).toContain("바닥면적 × 용도지역별 적용배율 범위 문언");
    expect(w(house())).toContain("10배");
  });

  it("엔진 결과 echo — demolishedVerdict.foldReason · periodMonths · required (UI 결과 표시용)", () => {
    const l = (item: Item, t = "2026-06-01") => isSeparateAggregateLand({ ...(item as SeparateAggregateLandItem), taxBaseDate: t }).demolishedVerdict;
    expect(l(building({ demolishedPermit: "no" }))).toMatchObject({ kind: "fold", foldReason: "permit", periodMonths: 12 });
    expect(l(building())).toMatchObject({ kind: "holds", periodMonths: 12, areaClauseApplied: true, required: { permit: true, otherUse: true, floorArea: true, vacantHouse: false } });
    expect(l(house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes" }))).toMatchObject({ kind: "holds", periodMonths: 36, areaClauseApplied: false, required: { vacantHouse: true, floorArea: false } });
    expect(l(house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "unknown" }))).toMatchObject({ foldReason: "period", vacantHouseExtensionUnconfirmed: true });
  });

  it("결과 `landSplit.demolishedVerdict` echo — 철거 필지에서만(접힘 사유·기간·읽은 칸) · 철거 OFF 결과에는 키가 없다", () => {
    expect(run(building({ demolishedPermit: "no" })).landSplit?.demolishedVerdict).toMatchObject({ kind: "fold", foldReason: "permit", periodMonths: 12 });
    expect(run(house({ demolishedDate: "2024-06-15", demolishedVacantHouse: "yes" })).landSplit?.demolishedVerdict).toMatchObject({ kind: "holds", periodMonths: 36 });
    const off = run({ id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: PRICE, zoningDistrict: "commercial", buildingFloorArea: 100 });
    expect("demolishedVerdict" in (off.landSplit ?? {})).toBe(false);
  });

  it("기준면적 echo — 면적 범위 문언 시행본(건축물 2024.6.1.~)만 바닥면적 × 배율 300㎡·3배, 주택·문언 전 시행본은 적용 기준면적 없음(0)", () => {
    const c = (item: Item, t = "2026-06-01") => isSeparateAggregateLand({ ...(item as SeparateAggregateLandItem), taxBaseDate: t });
    expect([c(building()).baseArea, c(building()).multiplier]).toEqual([300, 3]);
    expect([c(house()).baseArea, c(house()).multiplier]).toEqual([0, 0]);
    const old = c(building({ landArea: 1000, zoningDistrict: undefined, buildingFloorArea: undefined, demolishedDate: "2023-03-01", demolishedOtherUse: undefined }), "2023-06-01");
    expect([old.baseArea, old.multiplier, old.recognizedArea]).toEqual([0, 0, 1000]);
  });

  it("요구되지 않은 칸의 stale 값은 판정을 바꾸지 못한다 — 철거 1년 초과에서 허가 no·건축 외 yes를 보내도 같은 값(이관 이유는 기간)", () => {
    const clean = run(building({ demolishedDate: "2025-05-31", demolishedPermit: undefined, demolishedOtherUse: undefined }));
    const stale = run(building({ demolishedDate: "2025-05-31", demolishedPermit: "no", demolishedOtherUse: "yes", demolishedPublicUse: "yes" }));
    expect(stale.determinedTax).toBe(clean.determinedTax);
    expect(stale.landSplit?.comprehensive?.transferReasons).toEqual(["demolished_period"]);
  });

  it("엔진 직접 호출 — 종류가 없으면(구 입력) 철거 특례를 판정하지 못해 종합합산 + 확인 필요(자동 안분·자동 종류 없음)", () => {
    const out = run(building({ demolishedKind: undefined }));
    expect(out.determinedTax).toBe(800_000);
    expect(out.warnings.join("\n")).toContain("철거된 것의 종류");
    expect(out.landSplit?.comprehensive?.transferReasons).toEqual(["demolished_period"]);
  });
});

describe("PSA-E2 — 철거 OFF 입력은 철거 칸을 읽지 않는다(바이트 동일 가드)", () => {
  const off: Item = { id: "p1", jurisdictionCode: "000000", landArea: 1000, officialLandPrice: PRICE, zoningDistrict: "industrial", buildingFloorArea: 100 };
  it("철거 OFF에 stale 철거 칸(허가 no·종류 house)을 보내도 결과 불변 — 640,000 + 1,850,000", () => {
    const clean = run(off);
    const stale = run({ ...off, demolishedKind: "house", demolishedPermit: "no", demolishedOtherUse: "yes", demolishedVacantHouse: "yes" });
    expect(clean.determinedTax).toBe(2_490_000);
    expect(JSON.stringify(stale)).toBe(JSON.stringify(clean));
  });
  it("철거 OFF 용도지역 없음 → 엔진은 던진다(입구 ⑧·⑫가 먼저 막는 입력 — 추정 배율 금지)", () => {
    expect(() => run({ ...off, zoningDistrict: undefined })).toThrow(/용도지역/);
  });
});
