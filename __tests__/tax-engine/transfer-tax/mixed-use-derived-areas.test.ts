import { describe, it, expect } from "vitest";
import { computeDerivedAreas, round2 } from "@/lib/tax-engine/mixed-use-derived-areas";

/**
 * leaf 안분 헬퍼 anchor — 겸용주택 부수토지 면적 파생 + override.
 * 설계: mixed-use-exclusive-common-area-apportion.engine.design.md §2·§4.1
 * 방식 B: residentialLandArea + commercialLandArea = totalLandArea 불변식.
 */
describe("computeDerivedAreas — 부수토지 안분 + override", () => {
  const base = {
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 200,
  };

  it("C2: override 없음 → 현행 안분 (연면적 비율)", () => {
    const d = computeDerivedAreas({ ...base });
    expect(d.residentialLandArea).toBe(120); // 200 × 0.6
    expect(d.commercialLandArea).toBe(80); // 200 − 120
    expect(d.residentialLandArea + d.commercialLandArea).toBe(200);
  });

  it("C3: override=100 → 주택 우선, 상가=전체−주택", () => {
    const d = computeDerivedAreas({ ...base, residentialLandAreaOverride: 100 });
    expect(d.residentialLandArea).toBe(100);
    expect(d.commercialLandArea).toBe(100); // 200 − 100
  });

  it("C6: override=0 적법 (three-state, ?? 로 0 보존)", () => {
    const d = computeDerivedAreas({ ...base, residentialLandAreaOverride: 0 });
    expect(d.residentialLandArea).toBe(0);
    expect(d.commercialLandArea).toBe(200);
  });

  it("C4: 연면적 0 → early return", () => {
    const d = computeDerivedAreas({
      residentialFloorArea: 0,
      nonResidentialFloorArea: 0,
      buildingFootprintArea: 0,
      totalLandArea: 200,
    });
    expect(d.residentialRatio).toBe(0);
    expect(d.residentialLandArea).toBe(0);
    expect(d.commercialLandArea).toBe(200);
  });

  it("C5: 상가 0 (순수주택) → residentialRatio=1", () => {
    const d = computeDerivedAreas({
      residentialFloorArea: 100,
      nonResidentialFloorArea: 0,
      buildingFootprintArea: 50,
      totalLandArea: 200,
    });
    expect(d.residentialRatio).toBe(1);
    expect(d.residentialLandArea).toBe(200);
    expect(d.commercialLandArea).toBe(0);
  });

  it("정착면적 안분 유지 (residentialFootprintArea)", () => {
    const d = computeDerivedAreas({ ...base });
    expect(d.residentialFootprintArea).toBe(30); // 50 × 0.6
  });

  it("round2 export", () => {
    expect(round2(76.508)).toBe(76.51);
  });
});
