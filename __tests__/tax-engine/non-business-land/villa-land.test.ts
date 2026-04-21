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

  it("별장 사용 전부 + 농어촌주택 요건 충족 → 사업용", () => {
    const r = judgeVillaLand(
      base({
        villa: {
          villaUsePeriods: [
            { startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" },
          ],
          isEupMyeon: true,
          isRuralHousing: true,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("농어촌주택");
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
