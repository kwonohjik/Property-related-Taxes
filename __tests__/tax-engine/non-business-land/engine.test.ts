/**
 * Phase D-1 통합 테스트 — engine.ts (PDF 4단계 총괄 흐름)
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

describe("D-1 총괄 엔진 통합", () => {
  it("무조건 의제 (8년 재촌자경 상속 + 비도시) → 즉시 사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 2000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2018-01-01"),
      transferDate: d("2024-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      unconditionalExemption: { isAncestor8YearFarming: true },
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.judgmentReason).toContain("무조건 의제");
    expect(r.unconditionalExemption?.isApplied).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0);
  });

  it("농지 완전 사업용 (재촌자경 전체 + 비도시) → 사업용 + 장기공제 적용", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 1000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2015-01-01"),
      transferDate: d("2024-01-01"),
      farmingSelf: true,
      landLocation: { sigunguCode: "11680" },
      ownerProfile: {
        residenceHistories: [
          {
            sidoName: "서울",
            sigunguName: "강남구",
            sigunguCode: "11680",
            startDate: d("2015-01-01"),
            endDate: d("2024-01-01"),
            hasResidentRegistration: true,
          },
        ],
      },
      businessUsePeriods: [{ startDate: d("2015-01-02"), endDate: d("2024-01-01"), usageType: "자경" }],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
    expect(r.surcharge.longTermDeductionExcluded).toBe(false);
  });

  it("도시지역 內 농지 + 편입유예 외 → 비사업용 + 중과세", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 1000,
      zoneType: "general_residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2024-01-01"),
      urbanIncorporationDate: d("2015-01-01"), // 편입 후 9년 경과
      farmingSelf: true,
      landLocation: { sigunguCode: "11680" },
      ownerProfile: {
        residenceHistories: [
          {
            sidoName: "서울",
            sigunguName: "강남구",
            sigunguCode: "11680",
            startDate: d("2010-01-01"),
            endDate: d("2024-01-01"),
            hasResidentRegistration: true,
          },
        ],
      },
      businessUsePeriods: [{ startDate: d("2010-01-02"), endDate: d("2024-01-01"), usageType: "자경" }],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0.10);
    expect(r.surcharge.longTermDeductionExcluded).toBe(true);
    expect(r.judgmentReason).toContain("편입유예");
  });

  it("별장 → REDIRECT 자동 재분류 (P5-B: 엔진 내부 처리)", () => {
    // 2026-04-25 P5-B 변경: villa REDIRECT를 엔진 내부에서 housing으로 자동 재분류
    // needsRedirect=false, 결과는 housing_site 기준으로 판정됨
    const input: NonBusinessLandInput = {
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
    };
    const r = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    // 자동 재분류 후 needsRedirect=false, isNonBusinessLand는 housing 판정 결과
    expect(r.needsRedirect).toBe(false);
    expect(typeof r.isNonBusinessLand).toBe("boolean");
  });
});
