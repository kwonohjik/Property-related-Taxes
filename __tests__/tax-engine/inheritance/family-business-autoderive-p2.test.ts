/**
 * 가업상속공제 피상속인 요건 자동판정 anchor (Phase 2, 상증령 §15③1호)
 *
 * 설계: docs/02-design/features/inheritance-family-business-deduction/eligibility-autoderive.engine.design.md §Phase 2
 *
 * 가목(지분 40%/20% × 10년 보유) + 나목 대표이사(1호 50%·3호 소급10년중5년 자동, 2호 승계 override).
 * 윤년 정밀: 1호는 정수 비교(ceoDays*2 >= operatingDays).
 */
import { describe, it, expect } from "vitest";
import {
  deriveFBDecedentShareholding,
  deriveFBDecedentCEO,
  getShareThresholdByDate,
  resolveFamilyBusinessRequirements,
} from "@/lib/tax-engine/deductions/family-business-autoderive";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-gift.types";

function corpFb(over: Partial<FamilyBusinessInheritanceInput> = {}): FamilyBusinessInheritanceInput {
  return {
    businessType: "corporate",
    operatingYears: 20,
    enterpriseSize: "sme",
    isEligibleIndustry: true,
    totalAssets: 100_000_000,
    decedentCEORequirementMet: false,
    decedentMajorShareholdingMet: false,
    heirIsAdult: true,
    heirTwoYearEngagement: true,
    heirOfficerByFilingDeadline: true,
    heirCEOWithinTwoYears: true,
    unrelatedAssetsAcknowledged: true,
    postManagementAcknowledged: true,
    ...over,
  };
}

describe("§15③1호가 — 최대주주 지분 (deriveFBDecedentShareholding)", () => {
  const death = "2024-05-10";
  it("P2-1: 비상장 40% + 취득 후 10년 당일 → 충족", () => {
    expect(deriveFBDecedentShareholding(0.4, "2014-05-10", death, false)).toBe(true);
  });
  it("P2-2: 비상장 39% → 미충족", () => {
    expect(deriveFBDecedentShareholding(0.39, "2014-05-10", death, false)).toBe(false);
  });
  it("P2-3: 비상장 40% + 보유 9년364일 → 미충족", () => {
    expect(deriveFBDecedentShareholding(0.4, "2014-05-11", death, false)).toBe(false);
  });
  it("P2-4: 상장 20% + 10년 → 충족", () => {
    expect(deriveFBDecedentShareholding(0.2, "2014-05-10", death, true)).toBe(true);
  });
  it("P2-5: 지분율/취득일 미입력 → false", () => {
    expect(deriveFBDecedentShareholding(undefined, undefined, death, false)).toBe(false);
    expect(deriveFBDecedentShareholding(0.4, undefined, death, false)).toBe(false);
  });
});

describe("§15③1호나 — 대표이사 종사 3대안 (deriveFBDecedentCEO)", () => {
  const opening = "2004-01-01";
  const death = "2024-01-01"; // 영위 20년
  it("P2-7: 1호 영위 20년 중 대표 11년(55%) → 충족 alt=1", () => {
    const r = deriveFBDecedentCEO([{ startDate: "2013-01-01", endDate: "2024-01-01" }], opening, death);
    expect(r.met).toBe(true);
    expect(r.satisfiedAlternative).toBe(1);
  });
  it("P2-8: 1호 9년(45%) 전반부 재직 + 3호 미충족 → 미충족", () => {
    const r = deriveFBDecedentCEO([{ startDate: "2005-01-01", endDate: "2014-01-01" }], opening, death);
    expect(r.met).toBe(false);
  });
  it("P2-9: 3호 소급10년 중 대표 5년 정확 → 충족 alt=3", () => {
    const r = deriveFBDecedentCEO([{ startDate: "2019-01-01", endDate: "2024-01-01" }], opening, death);
    expect(r.met).toBe(true);
    expect(r.satisfiedAlternative).toBe(3);
  });
  it("P2-10: 3호 소급10년 중 대표 4년364일 → 미충족", () => {
    const r = deriveFBDecedentCEO([{ startDate: "2019-01-02", endDate: "2024-01-01" }], opening, death);
    expect(r.met).toBe(false);
  });
  it("P2-11: 다구간 2구간 합산 50%(5년+5년) → 충족 alt=1", () => {
    const r = deriveFBDecedentCEO(
      [
        { startDate: "2004-01-01", endDate: "2009-01-01" },
        { startDate: "2019-01-01", endDate: "2024-01-01" },
      ],
      opening,
      death,
    );
    expect(r.met).toBe(true);
    expect(r.satisfiedAlternative).toBe(1);
  });
  it("재직구간/개업일 미입력 → 미충족", () => {
    expect(deriveFBDecedentCEO(undefined, opening, death).met).toBe(false);
    expect(deriveFBDecedentCEO([{ startDate: "2013-01-01", endDate: "2024-01-01" }], undefined, death).met).toBe(false);
  });
});

describe("resolve 6요건 확장 — 피상속인 요건", () => {
  const death = "2024-05-10";
  it("P2-6: decedentMajorShareholdingMetOverride=true + 미입력 → override 충족", () => {
    const r = resolveFamilyBusinessRequirements(
      corpFb({ decedentMajorShareholdingMetOverride: true }),
      "2000-01-01",
      death,
    );
    expect(r.resolvedInput.decedentMajorShareholdingMet).toBe(true);
    expect(r.source.decedentMajorShareholdingMet).toBe("override");
  });
  it("P2-12: decedentCEORequirementMetOverride=true(2호 승계) → override 충족", () => {
    const r = resolveFamilyBusinessRequirements(
      corpFb({ decedentCEORequirementMetOverride: true }),
      "2000-01-01",
      death,
    );
    expect(r.resolvedInput.decedentCEORequirementMet).toBe(true);
    expect(r.source.decedentCEORequirementMet).toBe("override");
  });
  it("P2-13: 가·나 기초데이터 → auto source", () => {
    const r = resolveFamilyBusinessRequirements(
      corpFb({
        decedentShareRatioNum: 0.5,
        decedentShareAcquiredDate: "2010-01-01",
        decedentCEOPeriods: [{ startDate: "2010-01-01", endDate: "2024-05-10" }],
        openingDate: "2004-01-01",
      }),
      "2000-01-01",
      death,
    );
    expect(r.resolvedInput.decedentMajorShareholdingMet).toBe(true);
    expect(r.source.decedentMajorShareholdingMet).toBe("auto");
    expect(r.resolvedInput.decedentCEORequirementMet).toBe(true);
    expect(r.source.decedentCEORequirementMet).toBe("auto");
  });
  it("P2-14: legacy — 기초데이터·override 없음 → 구 boolean fallback", () => {
    const r = resolveFamilyBusinessRequirements(
      corpFb({ decedentMajorShareholdingMet: true, decedentCEORequirementMet: true }),
      "2000-01-01",
      death,
    );
    expect(r.resolvedInput.decedentMajorShareholdingMet).toBe(true);
    expect(r.source.decedentMajorShareholdingMet).toBe("legacy");
    expect(r.resolvedInput.decedentCEORequirementMet).toBe(true);
    expect(r.source.decedentCEORequirementMet).toBe("legacy");
  });
});

describe("FB-SHARE-HIST — §15③1호가 지분 임계 개정연혁 (계획 §5-6)", () => {
  it("getShareThresholdByDate: 시기별 임계", () => {
    // 2023.1.1.~ 비상장 40% / 상장 20%
    expect(getShareThresholdByDate("2024-01-01", false)).toBe(0.4);
    expect(getShareThresholdByDate("2024-01-01", true)).toBe(0.2);
    // 2011~2022 비상장 50% / 상장 30%
    expect(getShareThresholdByDate("2020-06-01", false)).toBe(0.5);
    expect(getShareThresholdByDate("2020-06-01", true)).toBe(0.3);
    // 2010.12.31 이전 비상장 50% / 상장 40%
    expect(getShareThresholdByDate("2009-01-01", false)).toBe(0.5);
    expect(getShareThresholdByDate("2009-01-01", true)).toBe(0.4);
  });
  it("경계: 2022-12-31 vs 2023-01-01 (비상장)", () => {
    expect(getShareThresholdByDate("2022-12-31", false)).toBe(0.5);
    expect(getShareThresholdByDate("2023-01-01", false)).toBe(0.4);
  });
  it("deriveFBDecedentShareholding: 2020 상속 비상장 40% → 미충족(당시 50% 기준)", () => {
    // 2024 상속(현행 40%)이면 충족이지만 2020 상속이면 50% 기준이라 미충족
    expect(deriveFBDecedentShareholding(0.4, "2008-01-01", "2020-06-01", false)).toBe(false);
    expect(deriveFBDecedentShareholding(0.5, "2008-01-01", "2020-06-01", false)).toBe(true);
    // 동일 지분율이 현행(2024) 상속이면 충족
    expect(deriveFBDecedentShareholding(0.4, "2008-01-01", "2024-06-01", false)).toBe(true);
  });
  it("deriveFBDecedentShareholding: 2020 상속 상장 25% → 미충족(당시 30% 기준), 현행이면 충족", () => {
    expect(deriveFBDecedentShareholding(0.25, "2008-01-01", "2020-06-01", true)).toBe(false);
    expect(deriveFBDecedentShareholding(0.25, "2008-01-01", "2024-06-01", true)).toBe(true);
  });
});
