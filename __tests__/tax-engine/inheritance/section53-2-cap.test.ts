/**
 * §53의2③ 수증자별 합산 1억 캡 — anchor (MBC-01·MBC-03)
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-followup-3items.plan.md (항목 A)
 * Design: docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md
 *
 * §53의2③: 제1항(혼인)·제2항(출산) 공제는 합하여 1억원 한도 — 수증자(doneeId)별 통합.
 * 현행: 3 위치(§24 분자·§19 배우자·자동도출) 모두 per-gift `min(x,1억)` → 동일 수증자 다건이면
 *        합산 1억 초과 가능(과대공제). 본 anchor는 doneeId 기반 합산 캡을 검증한다.
 *
 * ⚠️ Pre-Do RED 예정: MBC-01은 현행 코드(per-gift 캡)에서 1.9억(RED), 정정 후 1.5억(GREEN).
 */
import { describe, it, expect } from "vitest";
import { computePriorGiftDeductionForLimit } from "@/lib/tax-engine/deductions/inheritance-deductions";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

const DEATH = "2024-06-10";

describe("§53의2③ per-donee 합산 1억 캡 — anchor MBC", () => {
  it("MBC-01 동일 수증자(doneeId) 혼인 7천+출산 7천 → §53의2 합산 1억 캡 (§53 직계비속 5천 + §53의2 1억 = 1.5억)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-03-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 70_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 70_000_000, // 혼인 7천
      } as PriorGift,
      {
        giftDate: "2023-09-10",
        isHeir: true,
        doneeId: "child-1", // 동일 수증자
        giftAmount: 70_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 70_000_000, // 출산 7천
      } as PriorGift,
    ];
    // §53: doneeRelation lineal_descendant 그룹 합산 140m → min(5천만, 140m) = 5천만
    // §53의2: 동일 doneeId 합산 1.4억 → 1억 캡 → 1억
    // 합계 = 5천만 + 1억 = 1.5억
    // (현행 per-gift 캡: 5천만 + 7천 + 7천 = 1.9억 → RED)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MBC-03 서로 다른 수증자 각 1억 → 수증자별 독립 캡 (합산 캡 미적용)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-03-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 100_000_000,
      } as PriorGift,
      {
        giftDate: "2023-09-10",
        isHeir: true,
        doneeId: "child-2", // 다른 수증자
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 100_000_000,
      } as PriorGift,
    ];
    // §53: lineal_descendant 그룹 합산 2억 → min(5천만, 2억) = 5천만 (관계 그룹 1회)
    // §53의2: child-1 1억 + child-2 1억 = 2억 (수증자별 독립)
    // 합계 = 5천만 + 2억 = 2.5억 (현행·정정 후 동일 — control)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(250_000_000);
  });

  it("MBC-08 giftTaxBase 명시(branch 1) + marriageBirthDeduction 동시 → capper 미호출, giftTaxBase만 사용", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 150_000_000,
        giftTaxPaid: 0,
        giftTaxBase: 50_000_000, // branch 1 진입 → §53의2 미참조
        marriageBirthDeduction: 100_000_000, // 무시되어야 함
      } as PriorGift,
    ];
    // branch 1: max(0, 1.5억 - 5천) = 1억 (marriageBirthDeduction·capper 미참조)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(100_000_000);
  });

  it("MBC-02 단건 1.5억 오입력 → per-gift 1억 캡 (§53 5천 + §53의2 1억 = 1.5억)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 150_000_000, // 1.5억 오입력 → 1억 캡
      } as PriorGift,
    ];
    // §53 직계비속 5천 + §53의2 캡 1억 = 1.5억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MBC-04 doneeId 없는 단건(수동 경로) → solo 키 per-gift 1억", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant", // doneeId 없음
        marriageBirthDeduction: 150_000_000,
      } as PriorGift,
    ];
    // §53 5천 + §53의2 solo 1억 캡 = 1.5억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(150_000_000);
  });

  it("MBC-05 회귀 — 1건 5천(캡 미도달) → 5천 불변 (§53 5천 + §53의2 5천 = 1억)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        doneeRelation: "lineal_descendant",
        marriageBirthDeduction: 50_000_000, // 캡 미도달
      } as PriorGift,
    ];
    // §53 5천 + §53의2 5천 = 1억
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(100_000_000);
  });
});
