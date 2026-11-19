/**
 * NBL2611 A1 (R01 위생) — Pre-Do anchor. 처리 전 FAIL → 처리 후 GREEN.
 *
 * 클러스터: V10-P ① 복합용도 businessUseRatio 역전 · V8-VL05 재분류 고지 · V9-RI06 무관 판례 · V8-VL07 별장 인용.
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { judgeVillaLand } from "@/lib/tax-engine/non-business-land/villa-land";
import { applyCoOwnershipRatio } from "@/lib/tax-engine/non-business-land/co-ownership";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { NBL } from "@/lib/tax-engine/legal-codes";

const d = (iso: string) => new Date(iso);

function villaInput(over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "villa_land",
    landArea: 500,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    villa: { villaUsePeriods: [], isEupMyeon: false, isRuralHousing: false },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  };
}

describe("NBL2611-V10-P ① 복합용도 businessUseRatio — 사업용 비율은 1 − 비사업용 비율", () => {
  it("특정용도분 30%·잔여 70% 비사업용 → businessUseRatio 0.3 (종전 0.7로 역전)", () => {
    const r = judgeOtherLand(
      {
        landType: "other_land",
        landArea: 2000,
        zoneType: "general_residential",
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: false,
          mixedUseBuildingMode: "single_building",
          specificUseFloorArea: 300,
          totalFloorArea: 1000,
        },
        businessUsePeriods: [],
        gracePeriods: [],
      },
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.7);
    expect(r.businessUseRatio).toBeCloseTo(0.3, 10);
  });
});

describe("NBL2611-V8-VL05 별장 → 주택부수토지 재분류 — 재입력 지시 제거 + 재분류 고지", () => {
  it("엔진 결과의 어떤 단계·경고에도 「재입력 필요」 지시가 없고, 재분류 사실을 알린다", () => {
    const r = judgeNonBusinessLand(villaInput({ housingFootprint: 100 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    const texts = [...r.judgmentSteps.map((s) => s.detail), ...r.warnings, r.judgmentReason].join("\n");
    expect(texts).not.toMatch(/재입력 필요/);
    expect(r.warnings.some((w) => w.includes("주택부수토지로 재분류"))).toBe(true);
  });

  it("villa judge의 redirectHint도 재입력을 요구하지 않는다", () => {
    const r = judgeVillaLand(villaInput(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.action).toBe("REDIRECT_TO_CATEGORY");
    expect(r.redirectHint ?? "").not.toMatch(/다시 입력|재입력/);
    expect(r.redirectHint ?? "").toContain("재분류");
  });
});

describe("NBL2611-V9-RI06 공유지분 경고 — 무관 판례(대법원 2015두39439) 인용 삭제", () => {
  it("지분 경고 문구에 판례번호가 없다", () => {
    const base = judgeNonBusinessLand(
      {
        landType: "vacant_land" as never,
        landArea: 500,
        zoneType: "general_residential",
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        businessUsePeriods: [],
        gracePeriods: [],
      } as NonBusinessLandInput,
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    const r = applyCoOwnershipRatio(base, 0.5);
    expect(r.warnings.join("\n")).toContain("공유지분율 50.00% 적용");
    expect(r.warnings.join("\n")).not.toContain("2015두39439");
  });
});

describe("NBL2611-V8-VL07 별장 인용 — 항 없는 영 §168의13에 ①을 붙이지 않고, 기간기준 단계에 §168의13 배지를 달지 않고, 조특법은 법령명을 쓴다", () => {
  it("기간기준 단계의 법적 근거는 영 §168조의6(NBL.CRITERIA)이다", () => {
    const r = judgeVillaLand(
      villaInput({
        villa: {
          villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }],
          isEupMyeon: false,
          isRuralHousing: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    const period = r.steps.find((s) => s.id === "villa_non_use_period");
    expect(period?.legalBasis).toBe(NBL.CRITERIA);
  });

  it("농어촌주택 단계 문구: 「§168의13①」(항 없음) 금지 · 「§99의4」는 「조세특례제한법」 명시", () => {
    const r = judgeVillaLand(
      villaInput({
        villa: {
          villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }],
          isEupMyeon: true,
          isRuralHousing: true,
          buildingFloorArea: 151,
          attachedLandArea: 600,
          combinedStdValue: 100_000_000,
          isInRestrictedArea: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    const text = [...r.steps.map((s) => s.detail), r.reason].join("\n");
    expect(text).not.toMatch(/§168의13①/);
    expect(text).not.toMatch(/(?<!「조세특례제한법」 )§99의4/);
    expect(text).toContain("「조세특례제한법」 §99의4①1호가목");
  });
});
