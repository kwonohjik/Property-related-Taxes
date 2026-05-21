/**
 * 영농상속공제 §18의3 + 시행령 §16 — anchor 테스트
 *
 * 법령 검증: KoreanLaw MCP 2026-05-21
 * 계획서: docs/00-pm/inheritance-farming-deduction-expansion.plan.md §6.1
 */

import { describe, expect, it } from "vitest";

import {
  calcFarmingDeduction,
  evaluateFarmingEligibility,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { FarmingInheritanceInput } from "@/lib/tax-engine/types/inheritance-farming.types";

// ============================================================
// 헬퍼 — 기본 충족 input 생성
// ============================================================

function personalOk(over: Partial<FarmingInheritanceInput> = {}): FarmingInheritanceInput {
  return {
    type: "personal",
    decedentEightYearFarming: true,
    decedentResidenceMet: true,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: true,
    ...over,
  };
}

function corporateOk(
  over: Partial<FarmingInheritanceInput> = {},
): FarmingInheritanceInput {
  return {
    type: "corporate",
    decedentEightYearFarming: false,  // corporate는 미평가
    decedentResidenceMet: false,
    decedentCorporateMet: true,
    heirIsAdult: true,
    heirTwoYearFarming: true,
    heirResidenceMet: false,  // corporate는 미평가
    heirCorporateOfficer: true,
    ...over,
  };
}

// ============================================================
// FD-1 ~ FD-16
// ============================================================

describe("calcFarmingDeduction — 영농상속공제 §18의3", () => {
  it("FD-1: farming 미입력 + farmingAssetValue=10억 (legacy)", () => {
    const r = calcFarmingDeduction(1_000_000_000);
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.evaluated).toBe(false);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-2: farming 충족 + 자산 20억", () => {
    const r = calcFarmingDeduction(2_000_000_000, personalOk());
    expect(r.deduction).toBe(2_000_000_000);
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.evaluated).toBe(true);
  });

  it("FD-3: 자산 50억 → 30억 한도 cap", () => {
    const r = calcFarmingDeduction(5_000_000_000, personalOk());
    expect(r.deduction).toBe(3_000_000_000);
    expect(r.detail.cappedDeduction).toBe(3_000_000_000);
    expect(r.detail.appliedAssetValue).toBe(5_000_000_000);
  });

  it("FD-4: 피상속인 8년 미충족 → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ decedentEightYearFarming: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16②1호가"))).toBe(true);
  });

  it("FD-5: 피상속인 거주지 미충족 → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ decedentResidenceMet: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16②1호나"))).toBe(true);
  });

  it("FD-6: 상속인 17세 (heirIsAdult=false) → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ heirIsAdult: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("18세"))).toBe(true);
  });

  it("FD-7: 상속인 2년 미충족 + 피상속인 65세 미만 사망 → 충족", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ heirTwoYearFarming: false, decedentEarlyDeath: true }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-8: hasDisqualifyingIncome=true (§16⑭) → 0", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ hasDisqualifyingIncome: true }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭"))).toBe(true);
  });

  it("FD-9: hasTaxFraudConviction=true → early return 단독 reason", () => {
    // 다른 사유들도 미충족이지만 §18의3⑥로 단독 종결
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        decedentEightYearFarming: false,
        heirIsAdult: false,
        hasTaxFraudConviction: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§18의3⑥");
  });

  it("FD-10: 법인 영농 + 모든 요건 + 자산 5억", () => {
    const r = calcFarmingDeduction(500_000_000, corporateOk());
    expect(r.deduction).toBe(500_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-11: 법인 영농 + heirCorporateOfficer=false → 0", () => {
    const r = calcFarmingDeduction(
      500_000_000,
      corporateOk({ heirCorporateOfficer: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16③2호나"))).toBe(true);
  });

  it("FD-12: 후계자 + 18세·2년·거주 미충족 → 충족 (피상속인 요건 충족)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        isDesignatedSuccessor: true,
        heirIsAdult: false,
        heirTwoYearFarming: false,
        heirResidenceMet: false,
      }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-13: 후계자 + 피상속인 8년 미충족 → 0 (피상속인 요건은 별개)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        isDesignatedSuccessor: true,
        decedentEightYearFarming: false,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16②1호가"))).toBe(true);
  });

  it("FD-14: 후계자 + hasDisqualifyingIncome=true (§16⑭ 후계자에도 적용)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({
        isDesignatedSuccessor: true,
        hasDisqualifyingIncome: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.some((s) => s.includes("§16⑭"))).toBe(true);
  });

  it("FD-15: farming=undefined + 자산 10억 → legacy 모드 (evaluated=false)", () => {
    const r = calcFarmingDeduction(1_000_000_000);
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.evaluated).toBe(false);
    expect(r.detail.eligible).toBe(true);
    expect(r.detail.ineligibleReasons).toEqual([]);
  });

  it("FD-16: farming 입력 + 미충족 + 자산 5억 → 공제 0, 입력값 보존", () => {
    const r = calcFarmingDeduction(
      500_000_000,
      personalOk({ decedentEightYearFarming: false }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.appliedAssetValue).toBe(500_000_000);
    expect(r.detail.cappedDeduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBeGreaterThan(0);
  });
});

// ============================================================
// FD-17 ~ FD-19: §16② 단서 (F-9, 2026-05-21)
// ============================================================

describe("§16② 단서 — 영농상속 후 최대주주 사망 (corporate 전용)", () => {
  it("FD-17: corporate + isSecondaryAfterFarmingInheritance=true → 0 + 단독 reason", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({ isSecondaryAfterFarmingInheritance: true }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§16② 단서");
  });

  it("FD-18: personal + isSecondaryAfterFarmingInheritance=true → 단서 무시 (corporate 전용)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      personalOk({ isSecondaryAfterFarmingInheritance: true }),
    );
    // personal은 단서 적용 안 됨 — 다른 요건 모두 충족이라 공제 적용
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-19: corporate + 단서=true + 다른 요건 모두 미충족 → 단서 단독 종결", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({
        isSecondaryAfterFarmingInheritance: true,
        decedentCorporateMet: false,
        heirIsAdult: false,
        heirCorporateOfficer: false,
      }),
    );
    // 단서 early return 이므로 다른 reasons 추가 안 됨
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§16② 단서");
  });

  it("FD-20: corporate + isSecondaryAfterFarmingInheritance=false → 정상 평가", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({ isSecondaryAfterFarmingInheritance: false }),
    );
    expect(r.deduction).toBe(1_000_000_000);
    expect(r.detail.eligible).toBe(true);
  });

  it("FD-21: 단서 + hasTaxFraudConviction=true → §18의3⑥ 우선 (먼저 평가)", () => {
    const r = calcFarmingDeduction(
      1_000_000_000,
      corporateOk({
        isSecondaryAfterFarmingInheritance: true,
        hasTaxFraudConviction: true,
      }),
    );
    expect(r.deduction).toBe(0);
    expect(r.detail.ineligibleReasons.length).toBe(1);
    expect(r.detail.ineligibleReasons[0]).toContain("§18의3⑥");
  });
});

// ============================================================
// evaluateFarmingEligibility 단위
// ============================================================

describe("evaluateFarmingEligibility — 자격 평가 분리", () => {
  it("모든 요건 충족 → eligible=true, reasons=[]", () => {
    const r = evaluateFarmingEligibility(personalOk());
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("조세포탈 early return — §16⑭·피상속인 미충족도 함께 있어도 단독 종결", () => {
    const r = evaluateFarmingEligibility(
      personalOk({
        hasTaxFraudConviction: true,
        hasDisqualifyingIncome: true,
        decedentEightYearFarming: false,
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons.length).toBe(1);
    expect(r.reasons[0]).toContain("§18의3⑥");
  });

  it("후계자 트랙 — 피상속인 요건 평가 후 18세·2년·거주 건너뜀", () => {
    const r = evaluateFarmingEligibility(
      personalOk({
        isDesignatedSuccessor: true,
        heirIsAdult: false,
        heirTwoYearFarming: false,
        heirResidenceMet: false,
      }),
    );
    expect(r.eligible).toBe(true);
  });

  it("corporate 모드 — heirResidenceMet 평가 안 함", () => {
    const r = evaluateFarmingEligibility(
      corporateOk({ heirResidenceMet: false }),
    );
    expect(r.eligible).toBe(true);
  });
});
