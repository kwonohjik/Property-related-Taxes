/**
 * 종부세 "주택 0채" 허용 — Zod 스키마 anchor (토지전용 사례10·11 입력 경로).
 *
 * Plan: docs/00-pm/comprehensive-land-only-zero-house.plan.md §A
 * Pre-Do: 현재 `properties.min(1)` 때문에 [LO-1]이 실패한다. `.min(0)` + "주택 또는 토지" refine
 *   적용 후 [LO-1]·[LO-3] 통과, [LO-2](0채+0토지) 차단.
 */
import { describe, it, expect } from "vitest";
import { comprehensiveTaxInputSchema } from "../../../lib/validators/comprehensive-input";

const VALID_HOUSE = { propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none" };
const VALID_LAND_AGG = {
  totalOfficialValue: 1_500_000_000,
  propertyTaxBase: 1_050_000_000,
  propertyTaxAmount: 4_000_000,
};

const BASE = { assessmentYear: 2022, isOneHouseOwner: false };

describe("LO: 종부세 주택 0채 허용 (토지전용)", () => {
  it("[LO-1] 주택 0채 + 종합합산 토지 → 통과", () => {
    const r = comprehensiveTaxInputSchema.safeParse({
      ...BASE,
      properties: [],
      landAggregate: VALID_LAND_AGG,
    });
    expect(r.success).toBe(true);
  });

  it("[LO-1b] 주택 0채 + 별도합산 토지 목록 → 통과", () => {
    const r = comprehensiveTaxInputSchema.safeParse({
      ...BASE,
      properties: [],
      landSeparate: [
        { landId: "l1", publicPrice: 9_000_000_000, propertyTaxBase: 9_000_000_000, propertyTaxAmount: 6_000_000 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("[LO-2] 주택 0채 + 토지 0 → 차단 (완전 빈 입력 방지)", () => {
    const r = comprehensiveTaxInputSchema.safeParse({
      ...BASE,
      properties: [],
    });
    expect(r.success).toBe(false);
  });

  it("[LO-3] 주택 1채 (토지 없음) → 통과 (회귀)", () => {
    const r = comprehensiveTaxInputSchema.safeParse({
      ...BASE,
      properties: [VALID_HOUSE],
    });
    expect(r.success).toBe(true);
  });
});
