import { describe, expect, it } from "vitest";
import { calculateReplacementLandReduction } from "@/lib/tax-engine/replacement-land-reduction";

/**
 * 조특법 §77의2 대토보상 과세특례 — 40% 세액감면 모드 (KoreanLaw 원문 확정)
 *  감면세액 = 산출세액 × (대토보상분 소득 − 기본공제)×40% / 과세표준
 *  기본공제는 현금보상분(0% 감면) 우선 배정.
 */

const base = {
  transferDate: new Date("2026-05-01"),
  calculatedTax: 50_000_000,
  transferIncome: 100_000_000,
  basicDeduction: 2_500_000,
  taxBase: 97_500_000,
} as const;

describe("R77-2-1: 현금:대토 = 1:1 안분 40% 감면", () => {
  it("감면세액 = 10,256,410", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 100_000_000,
      replacementLandComp: 100_000_000,
    });
    expect(r.isEligible).toBe(true);
    expect(r.reductionRate).toBe(0.4);
    expect(r.replacementRatio).toBe(0.5);
    // cashIncome = 50,000,000 / replacementIncome = 50,000,000
    // 기본공제 2.5M은 현금분에 배정 → 대토분 소득 50,000,000 그대로
    // reducibleIncome = 50,000,000 × 40% = 20,000,000
    expect(r.reducibleIncome).toBe(20_000_000);
    // raw = 50,000,000 × 20,000,000 / 97,500,000 = 10,256,410
    expect(r.rawReductionAmount).toBe(10_256_410);
    expect(r.reductionAmount).toBe(10_256_410);
  });
});

describe("R77-2-2: 대토보상 단독 (현금 0)", () => {
  it("전액 대토분 → 기본공제 대토분에서 차감", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 0,
      replacementLandComp: 200_000_000,
      transferIncome: 100_000_000,
      basicDeduction: 2_500_000,
      taxBase: 97_500_000,
    });
    expect(r.replacementRatio).toBe(1);
    // 대토분 소득 100,000,000 − 기본공제 2,500,000 = 97,500,000
    // reducibleIncome = 97,500,000 × 40% = 39,000,000
    expect(r.reducibleIncome).toBe(39_000_000);
    // raw = 50,000,000 × 39,000,000 / 97,500,000 = 20,000,000
    expect(r.rawReductionAmount).toBe(20_000_000);
  });
});

describe("R77-2-3: sunset 2026-12-31 (양도일 기준)", () => {
  it("2027 양도 → 감면 불가", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      transferDate: new Date("2027-01-01"),
      cashCompensation: 0,
      replacementLandComp: 200_000_000,
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("2026");
  });
});

describe("R77-2-4: 대토보상 0 → 비적격", () => {
  it("현금만 있으면 대토보상분 없음 → 감면 없음", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 100_000_000,
      replacementLandComp: 0,
    });
    expect(r.isEligible).toBe(false);
    expect(r.notEligibleReason).toContain("대토보상액");
  });
});

describe("R77-2-5: §133② 연간 한도 2억 capping", () => {
  it("raw > 2억이면 2억으로 capping", () => {
    const r = calculateReplacementLandReduction({
      ...base,
      cashCompensation: 0,
      replacementLandComp: 20_000_000_000,
      calculatedTax: 3_000_000_000,
      transferIncome: 20_000_000_000,
      basicDeduction: 2_500_000,
      taxBase: 19_997_500_000,
    });
    // reducibleIncome = (20,000,000,000 − 2,500,000) × 40% = 7,999,000,000
    // raw = 3,000,000,000 × 7,999,000,000 / 19,997,500,000 ≈ 1,199,849,981 > 2억
    expect(r.cappedByAnnualLimit).toBe(true);
    expect(r.reductionAmount).toBe(200_000_000);
  });
});
