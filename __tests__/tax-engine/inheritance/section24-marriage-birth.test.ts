/**
 * §24③·§19 분자 §53의2(혼인·출산 증여재산공제) 자동 차감 — anchor (MB-01~06)
 *
 * Plan:   docs/00-pm/inheritance-section24-marriage-birth-deduction.plan.md
 * Design: docs/02-design/features/inheritance-section24-marriage-birth-deduction.engine.design.md
 *
 * §24③: 가산 증여재산가액 − (§53·§53의2·§54 공제). branch 2(giftTaxBase 미설정)에서
 *        §53의2(통합 1억)를 추가 차감.
 *
 * ⚠️ 도메인 관점: 상속 사전증여 = 피상속인→상속인. §53의2 적격 = 수증자(상속인)가 피상속인의
 *    직계비속(자녀 등) = doneeRelation "lineal_descendant" (피상속인 관점). 자녀가 피상속인
 *    (=자녀의 직계존속)으로부터 받은 혼인·출산 증여가 주 케이스.
 *    엔진(computePriorGiftDeductionForLimit·spouseGiftTaxBase·derivePriorGiftTaxBase)은
 *    marriageBirthDeduction이 설정되면 관계 무관하게 차감(게이트는 UI 위젯+validation 책임).
 */
import { describe, it, expect } from "vitest";
import { computePriorGiftDeductionForLimit } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import type { PriorGift, InheritanceTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

const DEATH = "2024-06-10";

// ─────────────────────────────────────────────
// §24 분자 단위 anchor (computePriorGiftDeductionForLimit)
// ─────────────────────────────────────────────

describe("§24 분자 §53의2 자동 차감 — anchor MB-01~04", () => {
  it("MB-01 자녀 혼인증여 1.5억(§53 5천만+§53의2 1억)·giftTaxBase 미설정 → 공제 합계 1.5억", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant", // 자녀(피상속인의 직계비속) — §53의2 적격
        // giftTaxBase 미설정 → branch 2
        marriageBirthDeduction: 100_000_000, // §53의2 혼인공제 1억
      } as PriorGift,
    ];
    // §53 직계비속 5천만 + §53의2 1억 = 1.5억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MB-02 branch1 이중차감 0 — giftTaxBase=0 + marriageBirthDeduction=1억 → 공제 1.5억, §53의2 미참조", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        giftTaxBase: 0, // branch 1 진입
        marriageBirthDeduction: 100_000_000, // 무시되어야 함
      } as PriorGift,
    ];
    // branch 1: max(0, 1.5억 - 0) = 1.5억 (marriageBirthDeduction 미참조)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MB-03 per-gift 1억 캡 — marriageBirthDeduction=1.5억 오입력 → 1억으로 캡(§53의2③)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 150_000_000, // 오입력 → 1억 캡
      } as PriorGift,
    ];
    // §53 5천만 + §53의2 min(1.5억,1억)=1억 = 1.5억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MB-04 §24 단서(과세가액 ≤ 5억) — computePriorGiftDeductionForLimit 반환값 자체는 정상(차단은 호출처 applyDeductionLimit)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 100_000_000,
      } as PriorGift,
    ];
    // §53 min(5천만,1억)=5천만 + §53의2 1억 = 1.5억 (5억 단서 차단은 applyDeductionLimit 책임)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });
});

// ─────────────────────────────────────────────
// 통합 anchor (calcInheritanceTax full pipeline)
// ─────────────────────────────────────────────

/** 최소 상속세 입력 빌더 — 배우자+자녀1, 과세가액 충분 */
function makeMinimalInput(overrides: Partial<InheritanceTaxInput> = {}): InheritanceTaxInput {
  const spouse: Heir = { id: "sp", relation: "spouse", name: "배우자" };
  const child: Heir = { id: "ch1", relation: "child", name: "자녀1" };
  const estate: EstateItem = {
    id: "e1",
    category: "real_estate_apartment",
    name: "아파트",
    valuationMethod: "market_value",
    marketValue: 2_000_000_000, // 20억
  } as EstateItem;

  return {
    decedentType: "resident",
    deathDate: DEATH,
    estateItems: [estate],
    heirs: [spouse, child],
    deductionInput: { heirs: [spouse, child], deathDate: DEATH },
    creditInput: { isFiledOnTime: true },
    preGiftsWithin10Years: [],
    debts: 0,
    funeralExpense: 0,
    funeralIncludesBongan: false,
    ...overrides,
  };
}

describe("§24 한도 통합 §53의2 — anchor MB-05 (full pipeline, 자녀 혼인증여)", () => {
  it("MB-05 자녀 혼인증여 §53의2 → §24 한도 분자 증여재산공제에 1억 추가 반영", () => {
    const childGift = (mb?: number): PriorGift =>
      ({
        giftDate: "2023-06-10",
        isHeir: true,
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        doneeId: "ch1", // 자녀가 수증자
        doneeRelation: "lineal_descendant", // 피상속인의 직계비속 (§53의2 적격)
        ...(mb !== undefined ? { marriageBirthDeduction: mb } : {}),
      }) as PriorGift;

    const withMb = calcInheritanceTax(
      makeMinimalInput({ preGiftsWithin10Years: [childGift(100_000_000)] }),
    );
    const withoutMb = calcInheritanceTax(
      makeMinimalInput({ preGiftsWithin10Years: [childGift(undefined)] }),
    );

    const dedWith = withMb.deductionDetail.deductionLimitDetail?.priorGiftDeductionTotal ?? 0;
    const dedWithout = withoutMb.deductionDetail.deductionLimitDetail?.priorGiftDeductionTotal ?? 0;

    // §53의2 1억이 §24 분자 증여재산공제에 추가 반영
    expect(dedWith - dedWithout).toBe(100_000_000);
    // §53(5천만) + §53의2(1억) = 1.5억
    expect(dedWith).toBe(150_000_000);
    expect(dedWithout).toBe(50_000_000);
  });
});

describe("§24·§19 §53의2 회귀 anchor — MB-06", () => {
  it("MB-06 marriageBirthDeduction undefined → 기존(§53만) 결과 완전 동일", () => {
    const base = (mb?: number): PriorGift[] => [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        ...(mb !== undefined ? { marriageBirthDeduction: mb } : {}),
      } as PriorGift,
    ];

    const withoutField = computePriorGiftDeductionForLimit(base(undefined), DEATH);
    const withUndefined = computePriorGiftDeductionForLimit(base(undefined), DEATH);

    // 둘 다 §53만: 직계비속 5천만
    expect(withoutField).toBe(50_000_000);
    expect(withUndefined).toBe(50_000_000);
  });
});
