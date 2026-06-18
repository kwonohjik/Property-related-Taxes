/**
 * 종부세 토지분 재산세 합산 단위 — 일반구는 시 단위 합산 anchor.
 *
 * Plan: docs/00-pm/comprehensive-land-jurisdiction-aggregation.plan.md
 * 버그: 엔진이 jurisdiction 문자열 그대로 그룹핑 → "용인시 기흥구"·"용인시 수지구"가 별도 그룹.
 *   수정 후 일반구는 시 단위로 합산 → perJurisdiction 1개("용인시").
 * Pre-Do: 수정 전 이 anchor는 실패(2개 그룹)하고, 엔진 정규화 후 통과한다.
 */
import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type {
  ComprehensiveTaxInput,
  LandParcelInput,
} from "../../lib/tax-engine/types/comprehensive.types";

const BASE = { assessmentYear: 2022, isOneHouseOwner: false, properties: [] };

// 용인시 일반구 2필지(기흥구·수지구) → 시 단위 합산 1그룹
const YONGIN: LandParcelInput[] = [
  { parcelId: "g1", jurisdiction: "용인시 기흥구", area: 100_000, shareRatio: 1, officialPricePerSqm: 140_000 },
  { parcelId: "s1", jurisdiction: "용인시 수지구", area: 100_000, shareRatio: 1, officialPricePerSqm: 140_000 },
];

describe("일반구 시 단위 합산 (용인시)", () => {
  const r = calculateComprehensiveTax({
    ...BASE,
    landAggregateParcels: YONGIN,
  } as ComprehensiveTaxInput).aggregateLandTax!;

  it("perJurisdiction은 '용인시' 1개 (기흥구·수지구 합산)", () => {
    const list = r.perJurisdiction!;
    expect(list).toHaveLength(1);
    expect(list[0].jurisdiction).toBe("용인시");
    // 두 필지 공시지가 합산 = 140,000 × 100,000 × 2 = 28,000,000,000
    expect(list[0].officialValueSum).toBe(28_000_000_000);
    expect(list[0].parcels).toHaveLength(2);
  });

  it("자치구는 구 단위 유지 (회귀 — 서초구·송파구 별도)", () => {
    const seoul: LandParcelInput[] = [
      { parcelId: "a", jurisdiction: "서초구", area: 100, shareRatio: 1, officialPricePerSqm: 4_300_000 },
      { parcelId: "b", jurisdiction: "송파구", area: 100, shareRatio: 1, officialPricePerSqm: 3_700_000 },
    ];
    const r2 = calculateComprehensiveTax({
      ...BASE,
      landAggregateParcels: seoul,
    } as ComprehensiveTaxInput).aggregateLandTax!;
    expect(r2.perJurisdiction!.map((j) => j.jurisdiction).sort()).toEqual(["서초구", "송파구"]);
  });
});
