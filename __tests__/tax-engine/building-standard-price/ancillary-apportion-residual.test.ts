import { describe, it, expect } from "vitest";
import { calcCompositeForYear } from "@/lib/tax-engine/building-standard-price-helpers";
import type { BuildingCompositePart } from "@/lib/tax-engine/types/building-standard-price.types";

/**
 * anchor — 부속시설 면적 안분 잔액 흡수 (면적 안분 공통 정책).
 * 마지막 수령 부분이 반올림 드리프트를 흡수해 Σ안분면적 = 안분 대상 총면적.
 * 수정 전: 33.33 × 3 = 99.99 (0.01㎡ 소실).
 */
const part = (label: string, floorArea: number, extra?: Partial<BuildingCompositePart>) =>
  ({ label, structureKey: "cement_brick", usageNo: 33, floorArea, ...extra }) as BuildingCompositePart;

const transferOpts = (ancillaryArea: number) =>
  ({
    usageNoSelector: (p: BuildingCompositePart) => p.usageNo,
    adjustmentEnabled: false,
    ancillary: [{ kind: "other" as const, areaM2: ancillaryArea }],
  }) as never;

const ancillaryAreas = (breakdowns: { ancillaryKind?: string; floorArea?: number }[]) =>
  breakdowns.filter((b) => b.ancillaryKind).map((b) => b.floorArea ?? 0);

describe("부속시설 안분 — 마지막 수령 부분 잔액 흡수", () => {
  it("C1: 100㎡ / 균등 3부분 → 33.33·33.33·33.34, 합 = 100 (드리프트 회귀)", () => {
    const r = calcCompositeForYear(
      [part("A", 1), part("B", 1), part("C", 1)],
      2024,
      1_000_000,
      2010,
      transferOpts(100),
    );
    const areas = ancillaryAreas(r.breakdowns);
    expect(areas).toEqual([33.33, 33.33, 33.34]);
    expect(areas.reduce((s, a) => s + a, 0)).toBe(100);
  });

  it("C2: 합 = apportionment.totalArea 불변식", () => {
    const r = calcCompositeForYear(
      [part("A", 33.33), part("B", 66.67), part("C", 10)],
      2024,
      1_000_000,
      2010,
      transferOpts(90),
    );
    const areas = ancillaryAreas(r.breakdowns);
    expect(areas.reduce((s, a) => s + a, 0)).toBe(r.apportionment!.totalArea);
  });

  it("C3: 드리프트 없는 케이스는 기존값 불변 (100㎡ / 2등분)", () => {
    const r = calcCompositeForYear([part("A", 1), part("B", 1)], 2024, 1_000_000, 2010, transferOpts(100));
    expect(ancillaryAreas(r.breakdowns)).toEqual([50, 50]);
  });

  it("C4: 단일 부분 → 전량 귀속", () => {
    const r = calcCompositeForYear([part("A", 100)], 2024, 1_000_000, 2010, transferOpts(90));
    expect(ancillaryAreas(r.breakdowns)).toEqual([90]);
  });

  it("C5: 종류별 안분도 각각 잔액 흡수", () => {
    const r = calcCompositeForYear([part("A", 1), part("B", 1), part("C", 1)], 2024, 1_000_000, 2010, {
      usageNoSelector: (p: BuildingCompositePart) => p.usageNo,
      adjustmentEnabled: false,
      ancillary: [
        { kind: "parking" as const, areaM2: 100 },
        { kind: "other" as const, areaM2: 100 },
      ],
    } as never);
    const rows = r.apportionment!.rows;
    expect(rows.reduce((s, x) => s + (x.byKind.parking ?? 0), 0)).toBe(100);
    expect(rows.reduce((s, x) => s + (x.byKind.other ?? 0), 0)).toBe(100);
  });
});
