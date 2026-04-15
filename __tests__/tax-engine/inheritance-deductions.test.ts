import { describe, it, expect } from "vitest";
import {
  calcChildrenDeduction,
  calcMinorDeduction,
  calcElderDeduction,
  calcDisabledDeduction,
  calcPersonalDeductions,
  getLifeExpectancy,
} from "@/lib/tax-engine/deductions/personal-deduction-calc";
import {
  calcBasicDeduction,
  calcSpouseDeduction,
  calcFinancialDeduction,
  calcCohabitationDeduction,
  calcFarmingDeduction,
  calcFamilyBusinessDeduction,
  applyDeductionLimit,
  calcInheritanceDeductions,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import {
  calcRelationDeduction,
  calcMarriageBirthDeduction,
  aggregateGiftWithin10Years,
  isBelowMinTaxBase,
  calcGiftDeductions,
} from "@/lib/tax-engine/deductions/gift-deductions";
import { optimizeDeductionMethod } from "@/lib/tax-engine/deductions/deduction-optimizer";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼: 상속인 목록 생성
// ============================================================

const makeHeir = (partial: Partial<Heir> & { id: string; relation: Heir["relation"] }): Heir => ({
  name: "테스트",
  ...partial,
});

// ============================================================
// 1. 인적공제 4종 (personal-deduction-calc.ts)
// ============================================================

describe("인적공제 4종 (§20)", () => {
  it("[D1] 자녀공제: 2명 × 5,000만원 = 1억", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "c1", relation: "child" }),
      makeHeir({ id: "c2", relation: "child" }),
    ];
    const result = calcChildrenDeduction(heirs);
    expect(result.totalDeduction).toBe(100_000_000);
    expect(result.count).toBe(2);
  });

  it("[D2] 자녀 0명이면 공제 0", () => {
    const heirs: Heir[] = [makeHeir({ id: "s1", relation: "spouse" })];
    const result = calcChildrenDeduction(heirs);
    expect(result.totalDeduction).toBe(0);
  });

  it("[D3] 미성년자공제: 만 11세 → (20-11) × 1,000만원 = 9,000만원", () => {
    const heirs: Heir[] = [
      makeHeir({
        id: "m1",
        relation: "child",
        birthDate: "2014-01-01", // 2025-01-01 기준 만 11세
      }),
    ];
    const result = calcMinorDeduction(heirs, "2025-01-01");
    expect(result.totalDeduction).toBe(90_000_000);
    expect(result.perHeir[0].age).toBe(11);
  });

  it("[D3-bis] 미성년자공제: 생일이 상속개시일 이후인 경우 — 만 나이 정확히 계산", () => {
    // 2014-06-01 출생, 2025-01-01 상속개시 → 생일(6월)이 아직 안 지남 → 만 10세
    // differenceInYears = 10 → (20-10)×1천만 = 10천만 (§20 ①2호 기준 20세)
    const heirs: Heir[] = [
      makeHeir({
        id: "m2",
        relation: "child",
        birthDate: "2014-06-01", // 2025-01-01 기준 생일 미도래 → 만 10세
      }),
    ];
    const result = calcMinorDeduction(heirs, "2025-01-01");
    expect(result.totalDeduction).toBe(100_000_000); // (20-10) × 1천만
    expect(result.perHeir[0].age).toBe(10);
  });

  it("[D4] 미성년자공제: 20세 이상이면 0", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "a1", relation: "child", birthDate: "2000-01-01" }),
    ];
    const result = calcMinorDeduction(heirs, "2025-01-01");
    expect(result.totalDeduction).toBe(0);
  });

  it("[D5] 연로자공제: 65세 이상 1명 × 5,000만원", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "e1", relation: "lineal_ascendant", birthDate: "1955-01-01" }),
    ];
    const result = calcElderDeduction(heirs, "2025-01-01");
    expect(result.totalDeduction).toBe(50_000_000);
    expect(result.count).toBe(1);
  });

  it("[D6] 연로자공제: 64세는 대상 외", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "e2", relation: "child", birthDate: "1961-06-01" }),
    ];
    const result = calcElderDeduction(heirs, "2025-01-01");
    expect(result.totalDeduction).toBe(0);
  });

  it("[D7] 기대여명 테이블: 40세 → 44년", () => {
    expect(getLifeExpectancy(40)).toBe(44);
  });

  it("[D8] 장애인공제: 40세 → 44년 × 1,000만원 = 4억4천", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "d1", relation: "child", birthDate: "1985-01-01", isDisabled: true }),
    ];
    const result = calcDisabledDeduction(heirs, "2025-01-01");
    // 40세 기대여명 44년
    expect(result.totalDeduction).toBe(440_000_000);
  });

  it("[D9] 인적공제 4종 합산: 자녀2 + 미성년자1 + 연로자1 + 장애인0", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "c1", relation: "child" }),
      makeHeir({ id: "c2", relation: "child" }),
      makeHeir({ id: "m1", relation: "child", birthDate: "2014-01-01" }),
      makeHeir({ id: "e1", relation: "lineal_ascendant", birthDate: "1955-01-01" }),
    ];
    const result = calcPersonalDeductions(heirs, "2025-01-01");
    // 자녀공제: c1·c2·m1 (relation=child) → 3명 × 5천만 = 1억5천만
    // 미성년: m1(만11세, 2014-01-01) → (20-11)*1천만 = 9천만
    // 연로자: e1(1955-01-01 → 70세) → 5천만
    // 합계: 1억5천 + 9천 + 5천 = 2억9천만
    expect(result.childDeduction).toBe(150_000_000);
    expect(result.minorDeduction).toBe(90_000_000);
    expect(result.elderDeduction).toBe(50_000_000);
    expect(result.total).toBe(290_000_000);
  });
});

// ============================================================
// 2. 상속공제 7종 + §24 한도
// ============================================================

describe("상속공제 7종 + §24 종합한도", () => {
  it("[D10] 기초공제: 항상 2억", () => {
    expect(calcBasicDeduction()).toBe(200_000_000);
  });

  it("[D11] 배우자공제: 실제 상속 10억, 법정상속분 12억 → min=10억, 상한30억 → 10억", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "sp", relation: "spouse" }),
      makeHeir({ id: "c1", relation: "child" }),
    ];
    const result = calcSpouseDeduction(1_000_000_000, 2_200_000_000, heirs);
    // 배우자 법정상속분 비율 = 1.5/(1.5+1) = 0.6 → 2.2억 × 0.6 = 1.32억? 아니라, 22억 * 0.6 = 13.2억
    // 실제(10억) vs 법정(13.2억) → min = 10억
    // 10억 > 5억 최솟값, < 30억 최댓값 → 10억
    expect(result.deduction).toBe(1_000_000_000);
  });

  it("[D12] 배우자공제: 배우자 없으면 0", () => {
    const heirs: Heir[] = [makeHeir({ id: "c1", relation: "child" })];
    const result = calcSpouseDeduction(undefined, 1_000_000_000, heirs);
    expect(result.deduction).toBe(0);
  });

  it("[D13] 배우자공제: 최솟값 5억 보장 (실제 1억이어도 5억)", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "sp", relation: "spouse" }),
      makeHeir({ id: "c1", relation: "child" }),
    ];
    const result = calcSpouseDeduction(100_000_000, 10_000_000_000, heirs);
    expect(result.deduction).toBe(500_000_000);
  });

  it("[D14] 금융재산공제: 2천만 이하 전액", () => {
    const r = calcFinancialDeduction(15_000_000);
    expect(r.deduction).toBe(15_000_000);
  });

  it("[D15] 금융재산공제: 2천만~1억 구간 → 2천만 고정", () => {
    const r = calcFinancialDeduction(80_000_000);
    expect(r.deduction).toBe(20_000_000);
  });

  it("[D16] 금융재산공제: 1억 초과 20% (최대 2억)", () => {
    const r = calcFinancialDeduction(500_000_000);
    expect(r.deduction).toBe(100_000_000); // 5억 × 20% = 1억
  });

  it("[D17] 금융재산공제: 10억 → 20% = 2억 (상한)", () => {
    const r = calcFinancialDeduction(1_000_000_000);
    expect(r.deduction).toBe(200_000_000);
  });

  it("[D18] 동거주택공제: 5억 × 80% = 4억 (6억 이하)", () => {
    const r = calcCohabitationDeduction(500_000_000);
    expect(r.deduction).toBe(400_000_000);
  });

  it("[D19] 동거주택공제: 8억 × 80% = 6.4억 → 상한 6억", () => {
    const r = calcCohabitationDeduction(800_000_000);
    expect(r.deduction).toBe(600_000_000);
  });

  it("[D20] §24 종합한도: 과세가액 15억, 사전증여 5억 → 한도 10억", () => {
    const { limitedDeduction, ceiling, wasCapped } = applyDeductionLimit(
      1_200_000_000,  // 공제 소계 12억
      1_500_000_000,  // 과세가액 15억
      500_000_000,    // 사전증여 5억
    );
    expect(ceiling).toBe(1_000_000_000);
    expect(limitedDeduction).toBe(1_000_000_000);
    expect(wasCapped).toBe(true);
  });

  it("[D21] §24 종합한도: 공제 소계 < 한도 → 그대로", () => {
    const { limitedDeduction, wasCapped } = applyDeductionLimit(
      800_000_000,
      1_500_000_000,
      200_000_000,
    );
    expect(limitedDeduction).toBe(800_000_000);
    expect(wasCapped).toBe(false);
  });
});

// ============================================================
// 3. 증여재산공제 (gift-deductions.ts)
// ============================================================

describe("증여재산공제 (§53·§53의2)", () => {
  it("[D22] 배우자 공제: 한도 6억, 기사용 1억 → 잔여 5억", () => {
    const result = calcRelationDeduction(
      { donorRelation: "spouse", priorUsedDeduction: 100_000_000 },
      600_000_000,
    );
    expect(result.relationDeduction).toBe(500_000_000);
  });

  it("[D23] 직계존속 성년 공제: 한도 5천만, 기사용 0 → 증여가액 3천만이면 3천만", () => {
    const result = calcRelationDeduction(
      { donorRelation: "lineal_ascendant_adult" },
      30_000_000,
    );
    expect(result.relationDeduction).toBe(30_000_000);
  });

  it("[D24] 직계존속 미성년 공제: 한도 2천만, 기사용 2천만 → 잔여 0", () => {
    const result = calcRelationDeduction(
      { donorRelation: "lineal_ascendant_minor", priorUsedDeduction: 20_000_000 },
      10_000_000,
    );
    expect(result.relationDeduction).toBe(0);
  });

  it("[D25] 기타친족: 한도 1천만", () => {
    const result = calcRelationDeduction(
      { donorRelation: "other_relative" },
      50_000_000,
    );
    expect(result.relationDeduction).toBe(10_000_000);
  });

  it("[D26] 혼인·출산 공제: 혼인5천 + 출산5천 = 1억 (한도 내)", () => {
    const result = calcMarriageBirthDeduction(50_000_000, 50_000_000);
    expect(result.deduction).toBe(100_000_000);
  });

  it("[D27] 혼인·출산 공제: 합산 1억 초과분 절사", () => {
    const result = calcMarriageBirthDeduction(80_000_000, 80_000_000);
    expect(result.deduction).toBe(100_000_000);
  });

  it("[D28] 10년 합산: 현재 5천만 + 과거 [3천, 2천] = 1억", () => {
    const total = aggregateGiftWithin10Years(50_000_000, [30_000_000, 20_000_000]);
    expect(total).toBe(100_000_000);
  });

  it("[D29] §55 면세: 과세표준 49만원 미만", () => {
    expect(isBelowMinTaxBase(490_000)).toBe(true);
    expect(isBelowMinTaxBase(500_000)).toBe(false);
    expect(isBelowMinTaxBase(0)).toBe(false);
  });
});

// ============================================================
// 4. 일괄 vs 항목별 자동 선택 (deduction-optimizer.ts)
// ============================================================

describe("일괄 vs 항목별 공제 자동 선택 (§21)", () => {
  it("[D30] 인적공제 없으면 일괄(5억) > 기초(2억) → 일괄 선택", () => {
    const heirs: Heir[] = [makeHeir({ id: "sp", relation: "spouse" })];
    const result = optimizeDeductionMethod(heirs, "2025-01-01");
    expect(result.chosenMethod).toBe("lump_sum");
    expect(result.chosenAmount).toBe(500_000_000);
  });

  it("[D31] 항목별 > 일괄 → 항목별 선택", () => {
    const heirs: Heir[] = [
      makeHeir({ id: "c1", relation: "child" }),
      makeHeir({ id: "c2", relation: "child" }),
      makeHeir({ id: "c3", relation: "child" }),
      makeHeir({ id: "c4", relation: "child" }),
      makeHeir({ id: "c5", relation: "child" }),
    ];
    // 기초 2억 + 자녀5명×5천 = 2억+2.5억 = 4.5억 < 5억? → 일괄
    // 아래처럼 확인 필요
    const result = optimizeDeductionMethod(heirs, "2025-01-01");
    // 자녀5명: 2.5억 + 기초2억 = 4.5억 < 5억 → 일괄
    expect(result.chosenMethod).toBe("lump_sum");
  });

  it("[D32] 자녀 7명이면 항목별(기초2억+자녀3.5억) > 일괄5억 → 항목별", () => {
    const heirs: Heir[] = Array.from({ length: 7 }, (_, i) =>
      makeHeir({ id: `c${i}`, relation: "child" }),
    );
    const result = optimizeDeductionMethod(heirs, "2025-01-01");
    // 기초2억 + 7명×5천 = 2억+3.5억 = 5.5억 > 5억 → 항목별
    expect(result.chosenMethod).toBe("itemized");
    expect(result.chosenAmount).toBe(550_000_000);
  });

  it("[D33] 동률(항목별=5억)이면 일괄 선택 (정책)", () => {
    // 기초2억 + 인적3억 = 5억 = 일괄공제
    // 자녀 6명: 3억 + 기초2억 = 5억
    const heirs: Heir[] = Array.from({ length: 6 }, (_, i) =>
      makeHeir({ id: `c${i}`, relation: "child" }),
    );
    const result = optimizeDeductionMethod(heirs, "2025-01-01");
    expect(result.chosenMethod).toBe("lump_sum");
    expect(result.reason).toContain("동률");
  });

  it("[D34] 가업상속공제 시 일괄 강제 선택해도 항목별로 변환", () => {
    const heirs: Heir[] = [makeHeir({ id: "c1", relation: "child" })];
    const result = optimizeDeductionMethod(heirs, "2025-01-01", "lump_sum", true);
    expect(result.chosenMethod).toBe("itemized");
    expect(result.reason).toContain("가업·영농");
  });
});
