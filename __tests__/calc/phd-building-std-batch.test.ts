/**
 * computePhdThreePointStdPrice — 3시점 일괄 산출 + ≤2000 미지원 게이팅
 */
import { describe, it, expect } from "vitest";
import { computePhdThreePointStdPrice } from "../../lib/calc/phd-building-std-batch";

const building = { structureKey: "rc", usageNo: 1, floorArea: 100, builtYear: 2010 };

describe("computePhdThreePointStdPrice", () => {
  it("단독주택 3시점(취득 2014·최초공시 2005·양도 2025) 모두 산출", () => {
    const r = computePhdThreePointStdPrice({
      building,
      acquisition: { year: 2014, landPricePerM2: 2_369_000 },
      firstDisclosure: { year: 2005, landPricePerM2: 2_000_000 },
      transfer: { year: 2025, landPricePerM2: 3_486_000 },
    });
    expect(r.acquisition).toBeGreaterThan(0);
    expect(r.firstDisclosure).toBeGreaterThan(0);
    expect(r.transfer).toBeGreaterThan(0);
    expect(r.unsupported).toHaveLength(0);
  });

  it("공동주택 최초고시 1993(≤2000) — 최초공시 미지원, 취득·양도만 산출", () => {
    const r = computePhdThreePointStdPrice({
      building: { ...building, builtYear: 1990 },
      acquisition: { year: 2014, landPricePerM2: 2_369_000 },
      firstDisclosure: { year: 1993, landPricePerM2: 1_000_000 },
      transfer: { year: 2025, landPricePerM2: 3_486_000 },
    });
    expect(r.acquisition).toBeGreaterThan(0);
    expect(r.transfer).toBeGreaterThan(0);
    expect(r.firstDisclosure).toBeUndefined();
    expect(r.unsupported).toEqual([
      expect.objectContaining({ point: "firstDisclosure" }),
    ]);
  });
});
