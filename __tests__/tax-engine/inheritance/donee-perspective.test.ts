/**
 * §53 공제 perspective 정정 (피상속인 관점 ↔ 수증자 관점) — anchor (DP-01·DP-02)
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-followup-3items.plan.md (항목 C)
 * Design: docs/02-design/features/inheritance-prior-gift-followup-3items.engine.design.md
 *
 * doneeRelation은 피상속인 관점 라벨(자녀=lineal_descendant). §53 공제는 수증자 관점이라
 * 피상속인은 수증자(자녀)의 직계존속 → 성년 5천/미성년 2천.
 * 현행 derivePriorGiftTaxBase는 deriveDoneeRelationFromHeir(child)=lineal_descendant(성년 5천) 고정
 * → 증여 당시 미성년 자녀 수증도 항상 5천 적용(과대공제). 정정 후 미성년 2천.
 *
 * ⚠️ Pre-Do RED 예정: DP-02는 현행 giftTaxBase 50m(RED), 정정 후 80m(GREEN).
 */
import { describe, it, expect } from "vitest";
import { derivePriorGiftTaxBase } from "@/lib/tax-engine/inheritance-prior-gift-taxbase";
import { isInheritancePriorGiftMarriageBirthEligible } from "@/lib/calc/prior-gift-marriage-birth-rule";
import type { PriorGift, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

// 자녀 수증 1억 (doneeRelation 미지정 → doneeId→Heir.relation 도출)
const giftAt = (giftDate: string): PriorGift =>
  ({
    giftDate,
    isHeir: true,
    doneeId: "child-1",
    giftAmount: 100_000_000,
    giftTaxPaid: 0,
  } as PriorGift);

describe("§53 공제 perspective — anchor DP", () => {
  it("DP-01 성년 자녀 수증 1억 → §53 직계존속(성년) 5천 → giftTaxBase 5천 (회귀, 우연 일치 유지)", () => {
    const gifts = [giftAt("2023-08-10")];
    const heirs: Heir[] = [
      { id: "child-1", relation: "child", birthDate: "1990-01-01" }, // 증여 당시 성년
    ];
    const out = derivePriorGiftTaxBase(gifts, heirs);
    // §53 직계존속 성년 5천 = 직계비속 5천 (우연 일치) → giftTaxBase = 1억 - 5천 = 5천
    expect(out[0].giftTaxBase).toBe(50_000_000);
  });

  it("DP-02 미성년 자녀 수증 1억 → §53 직계존속(미성년) 2천 → giftTaxBase 8천", () => {
    const gifts = [giftAt("2023-08-10")];
    const heirs: Heir[] = [
      { id: "child-1", relation: "child", birthDate: "2010-01-01" }, // 증여 당시 만 13세 (미성년)
    ];
    const out = derivePriorGiftTaxBase(gifts, heirs);
    // 정정 후: 미성년 직계존속 2천 → giftTaxBase = 1억 - 2천 = 8천
    // (현행: lineal_descendant 5천 고정 → giftTaxBase = 5천 → RED)
    expect(out[0].giftTaxBase).toBe(80_000_000);
  });

  it("DP-03 부모(직계존속 상속인) 수증 1억 → 변환 후 직계비속 5천 → giftTaxBase 5천 (역방향 회귀)", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2023-08-10", isHeir: true, doneeId: "parent-1", giftAmount: 100_000_000, giftTaxPaid: 0 } as PriorGift,
    ];
    const heirs: Heir[] = [{ id: "parent-1", relation: "lineal_ascendant", birthDate: "1950-01-01" }];
    // 피상속인 관점 lineal_ascendant_adult → 수증자 관점 직계비속 5천 → 1억 - 5천 = 5천
    expect(derivePriorGiftTaxBase(gifts, heirs)[0].giftTaxBase).toBe(50_000_000);
  });

  it("DP-04 자녀(lineal_descendant) → §53의2 적격 (게이트 perspective 경유, 동작 보존)", () => {
    expect(isInheritancePriorGiftMarriageBirthEligible("lineal_descendant")).toBe(true);
  });

  it("DP-05 배우자(spouse) → §53의2 비적격", () => {
    expect(isInheritancePriorGiftMarriageBirthEligible("spouse")).toBe(false);
  });

  it("DP-08 birthDate 미입력 + doneeWasMinorAtGift 토글 ON → 미성년 직계존속 2천 → giftTaxBase 8천", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2023-08-10",
        isHeir: true,
        doneeId: "child-1",
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        doneeWasMinorAtGift: true, // birthDate 없을 때 fallback
      } as PriorGift,
    ];
    const heirs: Heir[] = [{ id: "child-1", relation: "child" }]; // birthDate 미입력
    expect(derivePriorGiftTaxBase(gifts, heirs)[0].giftTaxBase).toBe(80_000_000);
  });

  it("DP-06 표시 회귀 — 미성년 정정해도 doneeRelation(피상속인 관점) 불변 (신고서 '직계비속' 유지)", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2023-08-10", isHeir: true, doneeId: "child-1", giftAmount: 100_000_000, giftTaxPaid: 0 } as PriorGift,
    ];
    const heirs: Heir[] = [{ id: "child-1", relation: "child", birthDate: "2010-01-01" }]; // 미성년
    const out = derivePriorGiftTaxBase(gifts, heirs);
    // §53은 미성년 2천(giftTaxBase 8천)이되, doneeRelation은 피상속인 관점 그대로 — 표시 보존
    expect(out[0].giftTaxBase).toBe(80_000_000);
    expect(out[0].doneeRelation).toBeUndefined(); // 원본 미설정 → 덮어쓰지 않음
  });
});
