/**
 * 증여재산공제 전용 테스트 (상증법 §53·§53의2·§47·§55)
 *
 * 커버리지:
 *   - calcRelationDeduction   — 관계별 공제 (5종) + 10년 잔여한도
 *   - calcMarriageBirthDeduction — 혼인·출산공제 (§53의2)
 *   - calcGiftDeductions       — 통합 증여공제
 *   - aggregateGiftWithin10Years — 동일인 10년 합산 (§47)
 *   - isBelowMinTaxBase        — 과세표준 50만원 미만 면세 (§55)
 */

import { describe, it, expect } from "vitest";
import {
  calcRelationDeduction,
  calcMarriageBirthDeduction,
  calcGiftDeductions,
  aggregateGiftWithin10Years,
  isBelowMinTaxBase,
} from "@/lib/tax-engine/deductions/gift-deductions";
import type { GiftDeductionInput } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

const makeInput = (
  partial: Partial<GiftDeductionInput> & { donorRelation: GiftDeductionInput["donorRelation"] },
): GiftDeductionInput => ({
  priorUsedDeduction: 0,
  ...partial,
});

// ============================================================
// 1. 관계별 공제 — calcRelationDeduction
// ============================================================

describe("관계별 증여재산공제 — calcRelationDeduction (§53)", () => {
  it("[G1] 배우자 6억 전액 공제", () => {
    const input = makeInput({ donorRelation: "spouse" });
    const { relationDeduction } = calcRelationDeduction(input, 600_000_000);
    expect(relationDeduction).toBe(600_000_000);
  });

  it("[G2] 배우자 6억 초과 → 한도(6억) 적용", () => {
    const input = makeInput({ donorRelation: "spouse" });
    const { relationDeduction } = calcRelationDeduction(input, 1_000_000_000);
    expect(relationDeduction).toBe(600_000_000); // 한도 초과 → 6억
  });

  it("[G3] 직계존속 성년 5천만원 공제", () => {
    const input = makeInput({ donorRelation: "lineal_ascendant_adult" });
    const { relationDeduction } = calcRelationDeduction(input, 80_000_000);
    expect(relationDeduction).toBe(50_000_000);
  });

  it("[G4] 직계존속 미성년 2천만원 공제", () => {
    const input = makeInput({ donorRelation: "lineal_ascendant_minor" });
    const { relationDeduction } = calcRelationDeduction(input, 50_000_000);
    expect(relationDeduction).toBe(20_000_000);
  });

  it("[G5] 직계비속 5천만원 공제", () => {
    const input = makeInput({ donorRelation: "lineal_descendant" });
    const { relationDeduction } = calcRelationDeduction(input, 30_000_000);
    expect(relationDeduction).toBe(30_000_000); // 증여가액 < 한도 → 증여가액 전액
  });

  it("[G6] 기타친족 1천만원 공제", () => {
    const input = makeInput({ donorRelation: "other_relative" });
    const { relationDeduction } = calcRelationDeduction(input, 50_000_000);
    expect(relationDeduction).toBe(10_000_000);
  });

  it("[G7] 10년 내 기사용 공제 반영 — 잔여 공제 계산", () => {
    // 직계존속 5천만 한도, 3천만 기사용 → 잔여 2천만
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 30_000_000,
    });
    const { relationDeduction } = calcRelationDeduction(input, 50_000_000);
    expect(relationDeduction).toBe(20_000_000);
  });

  it("[G8] 10년 기사용이 한도 초과 → 잔여 0 (공제 없음)", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 50_000_000, // 이미 한도 소진
    });
    const { relationDeduction } = calcRelationDeduction(input, 30_000_000);
    expect(relationDeduction).toBe(0);
  });

  it("[G9] 증여가액이 잔여공제보다 작으면 증여가액만큼 공제", () => {
    // 잔여 5천만 but 증여가액 1천만 → 1천만 공제
    const input = makeInput({ donorRelation: "lineal_ascendant_adult" });
    const { relationDeduction } = calcRelationDeduction(input, 10_000_000);
    expect(relationDeduction).toBe(10_000_000);
  });

  it("[G10] breakdown 배열이 반환됨", () => {
    const input = makeInput({ donorRelation: "spouse" });
    const { breakdown } = calcRelationDeduction(input, 100_000_000);
    expect(breakdown.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 2. 혼인·출산 공제 — calcMarriageBirthDeduction (§53의2)
// ============================================================

describe("혼인·출산 증여재산공제 — calcMarriageBirthDeduction (§53의2)", () => {
  it("[G11] 혼인공제 1억 단독 적용", () => {
    const { deduction } = calcMarriageBirthDeduction(100_000_000, 0);
    expect(deduction).toBe(100_000_000);
  });

  it("[G12] 출산공제 1억 단독 적용", () => {
    const { deduction } = calcMarriageBirthDeduction(0, 100_000_000);
    expect(deduction).toBe(100_000_000);
  });

  it("[G13] 혼인+출산 합산 최대 1억 한도", () => {
    // 혼인 8천만 + 출산 5천만 = 1.3억 → 1억으로 캡
    const { deduction } = calcMarriageBirthDeduction(80_000_000, 50_000_000);
    expect(deduction).toBe(100_000_000);
  });

  it("[G14] 혼인 4천만 + 출산 4천만 = 8천만 (합산이 1억 미만)", () => {
    const { deduction } = calcMarriageBirthDeduction(40_000_000, 40_000_000);
    expect(deduction).toBe(80_000_000);
  });

  it("[G15] 모두 0 → deduction 0, breakdown 빈 배열", () => {
    const { deduction, breakdown } = calcMarriageBirthDeduction(0, 0);
    expect(deduction).toBe(0);
    expect(breakdown).toHaveLength(0);
  });

  it("[G16] undefined 입력 → 0으로 처리", () => {
    const { deduction } = calcMarriageBirthDeduction(undefined, undefined);
    expect(deduction).toBe(0);
  });

  it("[G17] 혼인공제 1억 초과 입력 → 1억으로 캡", () => {
    // 각 항목도 개별 1억 한도 적용
    const { deduction } = calcMarriageBirthDeduction(120_000_000, 0);
    expect(deduction).toBe(100_000_000);
  });
});

// ============================================================
// 3. 통합 증여공제 — calcGiftDeductions
// ============================================================

describe("통합 증여재산공제 — calcGiftDeductions", () => {
  it("[G18] 배우자 + 혼인공제 통합", () => {
    const input: GiftDeductionInput = {
      donorRelation: "spouse",
      priorUsedDeduction: 0,
      marriageExemption: 100_000_000,
    };
    const result = calcGiftDeductions(input, 700_000_000);
    // 관계공제 6억 + 혼인공제 1억 = 7억
    expect(result.relationDeduction).toBe(600_000_000);
    expect(result.marriageBirthDeduction).toBe(100_000_000);
    expect(result.totalDeduction).toBe(700_000_000);
  });

  it("[G19] 직계존속 성년 기본 케이스 (혼인공제 없음)", () => {
    const input: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 0,
    };
    const result = calcGiftDeductions(input, 60_000_000);
    expect(result.relationDeduction).toBe(50_000_000);
    expect(result.marriageBirthDeduction).toBe(0);
    expect(result.totalDeduction).toBe(50_000_000);
  });

  it("[G20] 10년 기사용 + 혼인공제 함께 적용", () => {
    const input: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 30_000_000, // 잔여 2천만
      birthExemption: 50_000_000,
    };
    const result = calcGiftDeductions(input, 100_000_000);
    expect(result.relationDeduction).toBe(20_000_000); // 잔여 2천만
    expect(result.marriageBirthDeduction).toBe(50_000_000);
    expect(result.totalDeduction).toBe(70_000_000);
  });

  it("[G21] appliedLaws 배열 반환", () => {
    const input = makeInput({ donorRelation: "lineal_descendant" });
    const result = calcGiftDeductions(input, 30_000_000);
    expect(result.appliedLaws.length).toBeGreaterThan(0);
  });

  it("[G22] breakdown 배열 반환", () => {
    const input = makeInput({ donorRelation: "lineal_descendant" });
    const result = calcGiftDeductions(input, 30_000_000);
    expect(result.breakdown.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 4. 동일인 10년 합산 — aggregateGiftWithin10Years (§47)
// ============================================================

describe("10년 내 동일인 증여 합산 — aggregateGiftWithin10Years (§47)", () => {
  it("[G23] 현재 증여 + 과거 증여 합산", () => {
    const total = aggregateGiftWithin10Years(30_000_000, [10_000_000, 20_000_000]);
    expect(total).toBe(60_000_000);
  });

  it("[G24] 과거 증여 없음 → 현재 증여액만", () => {
    expect(aggregateGiftWithin10Years(50_000_000, [])).toBe(50_000_000);
  });

  it("[G25] 복수 과거 증여 합산", () => {
    const total = aggregateGiftWithin10Years(
      10_000_000,
      [5_000_000, 5_000_000, 5_000_000],
    );
    expect(total).toBe(25_000_000);
  });

  it("[G26] 모두 0 → 0", () => {
    expect(aggregateGiftWithin10Years(0, [0, 0])).toBe(0);
  });
});

// ============================================================
// 5. 과세표준 50만원 미만 면세 — isBelowMinTaxBase (§55)
// ============================================================

describe("과세표준 50만원 미만 면세 판정 — isBelowMinTaxBase (§55)", () => {
  it("[G27] 499,999원 → true (면세)", () => {
    expect(isBelowMinTaxBase(499_999)).toBe(true);
  });

  it("[G28] 500,000원 → false (과세)", () => {
    expect(isBelowMinTaxBase(500_000)).toBe(false);
  });

  it("[G29] 0원 → false (과세표준 없음, 면세 아님)", () => {
    expect(isBelowMinTaxBase(0)).toBe(false);
  });

  it("[G30] 1,000,000원 → false (정상 과세)", () => {
    expect(isBelowMinTaxBase(1_000_000)).toBe(false);
  });

  it("[G31] 1원 → true (면세)", () => {
    expect(isBelowMinTaxBase(1)).toBe(true);
  });
});
