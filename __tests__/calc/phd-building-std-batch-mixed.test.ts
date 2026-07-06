/**
 * anchor: PHD 3시점 일괄 산출 — Phase 2 겸용(Option B)
 *  - housing 3시점(부분 1개=단일 point / 2개↑=compositeParts 합산)
 *  - commercial 양도시에만(취득·최초공시 상가는 배치 미산출)
 *  - ≤2000 취득: 단일 부분 acqBase 지원, 다부분 미지원(C1)
 *
 * 기대값은 매직넘버 대신 calcBuildingStandardPrice 직접호출 등가성으로 고정.
 */
import { describe, it, expect } from "vitest";
import { computePhdThreePointStdPrice } from "../../lib/calc/phd-building-std-batch";
import { calcBuildingStandardPrice } from "../../lib/tax-engine/building-standard-price";

const H = (floorArea: number) => ({ structureKey: "rc", usageNo: 2, floorArea, category: "housing" as const });
const C = (floorArea: number) => ({ structureKey: "rc", usageNo: 41, floorArea, category: "commercial" as const });

const ACQ = { year: 2014, landPricePerM2: 2_360_000 };
const FIRST = { year: 2016, landPricePerM2: 2_369_000 };
const TRANSFER = { year: 2025, landPricePerM2: 3_486_000 };

// 엔진 직접호출 — 복합/단일 valuation
function directComposite(parts: { structureKey: string; usageNo: number; floorArea: number }[], year: number, land: number, builtYear: number) {
  if (parts.length === 1) {
    return calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: parts[0].floorArea,
      builtYear,
      valuationYear: year,
      valuation: { structureKey: parts[0].structureKey, usageNo: parts[0].usageNo, landPricePerM2: land },
    }).valuation?.standardPrice;
  }
  return calcBuildingStandardPrice({
    taxType: "inheritance_gift",
    floorArea: parts.reduce((s, p) => s + p.floorArea, 0),
    builtYear,
    valuationYear: year,
    valuation: { structureKey: parts[0].structureKey, usageNo: parts[0].usageNo, landPricePerM2: land },
    compositeParts: parts.map((p) => ({ structureKey: p.structureKey, usageNo: p.usageNo, floorArea: p.floorArea })),
  }).compositeTotal;
}

describe("computePhdThreePointStdPrice — 겸용 Option B", () => {
  it("A1: 층별 구조 다부분 housing 3시점 산출 + 취득/최초공시 commercial 미산출", () => {
    const parts = [H(120), H(80)];
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts },
      acquisition: ACQ,
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    expect(r.acquisition?.housing).toBeGreaterThan(0);
    expect(r.firstDisclosure?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
    // commercial 없음
    expect(r.acquisition?.commercial).toBeUndefined();
    expect(r.firstDisclosure?.commercial).toBeUndefined();
    expect(r.transfer?.commercial).toBeUndefined();
    // 엔진 복합 등가성
    expect(r.transfer?.housing).toBe(directComposite(parts, 2025, TRANSFER.landPricePerM2, 2010));
    expect(r.acquisition?.housing).toBe(directComposite(parts, 2014, ACQ.landPricePerM2, 2010));
  });

  it("A2: 단일 부분 housing = 단일 valuation point 등가(Phase 1 회귀)", () => {
    const parts = [H(100)];
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts },
      transfer: TRANSFER,
    });
    expect(r.transfer?.housing).toBe(directComposite(parts, 2025, TRANSFER.landPricePerM2, 2010));
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });

  it("A3: ≤2000 취득 + housing 다부분 → 취득 미산출(C1), 최초공시/양도 정상", () => {
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 1998, parts: [H(120), H(80)] },
      acquisition: { year: 1998, landPricePerM2: 500_000 },
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    expect(r.acquisition?.housing).toBeUndefined();
    expect(r.unsupported.some((u) => u.point === "acquisition" && u.category === "housing")).toBe(true);
    expect(r.firstDisclosure?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });

  it("A4: commercial 부분 → 양도시에만 산출, 취득/최초공시 commercial undefined", () => {
    const commercialParts = [C(80)];
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts: [H(120), C(80)] },
      acquisition: ACQ,
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    expect(r.transfer?.commercial).toBeGreaterThan(0);
    expect(r.transfer?.commercial).toBe(directComposite(commercialParts, 2025, TRANSFER.landPricePerM2, 2010));
    expect(r.acquisition?.commercial).toBeUndefined();
    expect(r.firstDisclosure?.commercial).toBeUndefined();
    // housing은 3시점
    expect(r.acquisition?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });
});
