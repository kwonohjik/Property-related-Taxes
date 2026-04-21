/**
 * Phase C-3 유닛 테스트 — pasture.ts (PDF p.1702)
 */
import { describe, it, expect } from "vitest";
import { judgePasture } from "@/lib/tax-engine/non-business-land/pasture";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "pasture",
    landArea: 5000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    pasture: {
      isLivestockOperator: true,
      livestockType: "한우",
      livestockCount: 50,
      standardArea: 10000,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-3 목장용지 PDF p.1702 흐름도", () => {
  it("축산업 10년 + 기준면적 이내 + 도시지역 밖 → 사업용", () => {
    const r = judgePasture(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("도시지역 밖");
  });

  it("축산업 미영위 + 거주사업관련 없음 → 비사업용", () => {
    const r = judgePasture(
      base({
        pasture: {
          isLivestockOperator: false,
          standardArea: 10000,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("상속 3년 이내 목장용지 → 사업용 (사용의제)", () => {
    const r = judgePasture(
      base({
        pasture: {
          isLivestockOperator: false,
          standardArea: 10000,
          inheritanceDate: d("2023-06-01"),
        },
        transferDate: d("2024-06-01"),
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("거주·사업관련");
  });

  it("기준면적 초과 → 초과분 비사업용 (면적 안분)", () => {
    const r = judgePasture(
      base({
        landArea: 15000,
        pasture: {
          isLivestockOperator: true,
          livestockType: "한우",
          livestockCount: 50,
          standardArea: 10000,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(5000);
  });

  it("도시지역(일반주거) 편입 후 3년 경과 → 비사업용", () => {
    const r = judgePasture(
      base({
        zoneType: "general_residential",
        urbanIncorporationDate: d("2019-01-01"),
        transferDate: d("2024-01-01"), // 5년 경과
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("편입유예 외");
  });
});
