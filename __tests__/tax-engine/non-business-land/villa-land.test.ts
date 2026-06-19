/**
 * Phase C-5 유닛 테스트 — villa-land.ts (PDF p.1705, §168-13)
 */
import { describe, it, expect } from "vitest";
import { judgeVillaLand } from "@/lib/tax-engine/non-business-land/villa-land";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "villa_land",
    landArea: 500,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    villa: {
      villaUsePeriods: [],
      isEupMyeon: false,
      isRuralHousing: false,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-5 별장부수토지 PDF p.1705", () => {
  it("별장 사용기간이 전혀 없음 → 비사용 100% → REDIRECT", () => {
    const r = judgeVillaLand(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.action).toBe("REDIRECT_TO_CATEGORY");
    expect(r.redirectHint).toContain("다시 입력");
  });

  // §168의13① 3요건 헬퍼 — 전부 충족 villa
  const ruralVilla = (over: Partial<NonBusinessLandInput["villa"] & object> = {}) => ({
    villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }],
    isEupMyeon: true,
    isRuralHousing: true,
    buildingFloorArea: 140,
    attachedLandArea: 600,
    combinedStdValue: 180_000_000,
    isInRestrictedArea: false,
    ...over,
  });

  it("별장 사용 전부 + 농어촌주택 3요건 모두 충족 → 사업용 (A5)", () => {
    const r = judgeVillaLand(base({ villa: ruralVilla() }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("농어촌주택");
  });

  it("연면적 151㎡>150 → 비사업용 (A1 §168의13①1호)", () => {
    const r = judgeVillaLand(base({ villa: ruralVilla({ buildingFloorArea: 151 }) }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
  });

  it("부속토지 700㎡>660 → 비사업용 (A2 §168의13①1호)", () => {
    const r = judgeVillaLand(base({ villa: ruralVilla({ attachedLandArea: 700 }) }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
  });

  it("기준시가 2.1억>2억 → 비사업용 (A3 §168의13①2호)", () => {
    const r = judgeVillaLand(base({ villa: ruralVilla({ combinedStdValue: 210_000_000 }) }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
  });

  it("§99의4①1호가목 제외지역 소재 → 비사업용 (A4 §168의13①3호)", () => {
    const r = judgeVillaLand(base({ villa: ruralVilla({ isInRestrictedArea: true }) }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
  });

  it("3요건 미입력(undefined) → 요건 미충족 → 비사업용 (미입증=불인정)", () => {
    const r = judgeVillaLand(
      base({
        villa: {
          villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }],
          isEupMyeon: true,
          isRuralHousing: true,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("별장 사용 전부 + 농어촌주택 요건 미충족 → 비사업용", () => {
    const r = judgeVillaLand(
      base({
        villa: {
          villaUsePeriods: [
            { startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" },
          ],
          isEupMyeon: false,
          isRuralHousing: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.action).toBeUndefined();
  });
});
