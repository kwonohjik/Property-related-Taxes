import { describe, expect, it } from "vitest";
import { calculateGbDesignatedLandReduction } from "@/lib/tax-engine/gb-designated-land-reduction";

/**
 * 조특법 §77의3 개발제한구역 지정에 따른 매수대상 토지 감면 (KoreanLaw 원문 확정)
 *  40%(지정일 前 취득+거주) / 25%(매수·고시일−20년 前 취득+거주) / 0%(비적격)
 *  감면세액 = 산출세액 × (양도소득금액−기본공제)×율 / 과세표준
 */

const base = {
  calculatedTax: 50_000_000,
  transferIncome: 100_000_000,
  basicDeduction: 2_500_000,
  taxBase: 97_500_000,
  residedFromAcqToTrigger: true,
  transferDate: new Date("2026-05-01"),
} as const;

describe("G77-3-1: ①1호 40% (지정일 이전 취득 + 거주)", () => {
  it("감면세액 = 산출세액 × 40% = 20,000,000", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "in_zone",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      triggerDate: new Date("2026-05-01"),
    });
    expect(r.isEligible).toBe(true);
    expect(r.reductionRate).toBe(0.4);
    expect(r.appliedClause).toBe("1호");
    expect(r.reducibleIncome).toBe(39_000_000); // 97,500,000 × 40%
    expect(r.rawReductionAmount).toBe(20_000_000);
    expect(r.reductionAmount).toBe(20_000_000);
  });
});

describe("G77-3-2: ①2호 25% (지정일 이후 · 매수일−20년 이전 취득)", () => {
  it("감면세액 = 산출세액 × 25% = 12,500,000", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "in_zone",
      designationDate: new Date("2003-01-01"),
      acquisitionDate: new Date("2004-01-01"), // 지정 후 & 2006-05-01(−20년) 이전
      triggerDate: new Date("2026-05-01"),
    });
    expect(r.reductionRate).toBe(0.25);
    expect(r.appliedClause).toBe("2호");
    expect(r.reducibleIncome).toBe(24_375_000);
    expect(r.reductionAmount).toBe(12_500_000);
  });
});

describe("G77-3-3: 비적격 0% (지정 후 취득 & 매수일 20년 이내)", () => {
  it("감면 없음", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "in_zone",
      designationDate: new Date("2003-01-01"),
      acquisitionDate: new Date("2010-01-01"), // 지정 후 & 2006 이후
      triggerDate: new Date("2026-05-01"),
    });
    expect(r.isEligible).toBe(false);
    expect(r.reductionRate).toBe(0);
    expect(r.notEligibleReason).toContain("20년 이내");
  });
});

describe("G77-3-4: 1·2호 동시 적격 → 40% 우선", () => {
  it("지정일 이전 취득이면서 20년 이전이어도 40%", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "in_zone",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2000-01-01"), // 지정 前 & 20년 前 모두 충족
      triggerDate: new Date("2026-05-01"),
    });
    expect(r.reductionRate).toBe(0.4);
    expect(r.appliedClause).toBe("1호");
  });
});

describe("G77-3-5: 거주요건 미충족 → 0%", () => {
  it("감면 없음", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      residedFromAcqToTrigger: false,
      branch: "in_zone",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      triggerDate: new Date("2026-05-01"),
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("거주");
  });
});

describe("G77-3-6: ②해제 토지 — 해제~고시 게이트", () => {
  it("해제 1년 이내 고시 → 40% 적용", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "released",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      releasedDate: new Date("2025-08-01"),
      triggerDate: new Date("2026-05-01"), // 해제 후 9개월 → 1년 이내
    });
    expect(r.isEligible).toBe(true);
    expect(r.reductionRate).toBe(0.4);
  });

  it("해제 1년 초과 고시 (일반) → 0%", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "released",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      releasedDate: new Date("2024-01-01"),
      triggerDate: new Date("2026-05-01"), // 2년 3개월 > 1년
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("1년 이내");
  });

  it("경제자유구역 지정 시 5년까지 허용 → 적용", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "released",
      freeEconZone: true,
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      releasedDate: new Date("2024-01-01"),
      triggerDate: new Date("2026-05-01"), // 2년 3개월 < 5년
    });
    expect(r.isEligible).toBe(true);
    expect(r.reductionRate).toBe(0.4);
  });
});

describe("G77-3-7: sunset 2028-12-31 (양도일 기준)", () => {
  it("2029 양도 → 감면 불가", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      transferDate: new Date("2029-01-01"),
      branch: "in_zone",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      triggerDate: new Date("2028-06-01"),
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("2028");
  });
});

describe("G77-3-8: §133② 연간 한도 (2025+ 2억) capping", () => {
  it("raw > 2억이면 2억으로 capping", () => {
    const r = calculateGbDesignatedLandReduction({
      ...base,
      calculatedTax: 3_000_000_000,
      transferIncome: 20_000_000_000,
      basicDeduction: 2_500_000,
      taxBase: 19_997_500_000,
      branch: "in_zone",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2003-03-27"),
      triggerDate: new Date("2026-05-01"),
    });
    // raw = 3,000,000,000 × 40% = 1,200,000,000 > 2억 → capping
    expect(r.cappedByAnnualLimit).toBe(true);
    expect(r.reductionAmount).toBe(200_000_000);
  });
});

describe("G77-3-9: 상속 토지 = 피상속인 취득일 (caller 주입)", () => {
  it("피상속인 취득일(지정 前)을 acquisitionDate로 주입 → 40%", () => {
    // §77의3③: 상속 토지는 피상속인 취득일 기준. caller가 acquisitionDate에 주입.
    const r = calculateGbDesignatedLandReduction({
      ...base,
      branch: "in_zone",
      designationDate: new Date("2005-06-01"),
      acquisitionDate: new Date("2001-02-10"), // 피상속인 취득일 (지정 前)
      triggerDate: new Date("2026-05-01"),
    });
    expect(r.reductionRate).toBe(0.4);
  });
});
