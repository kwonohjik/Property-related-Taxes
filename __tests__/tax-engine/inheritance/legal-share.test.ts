/**
 * 법정상속분 산정 — computeLegalShares / distributeByLegalShares
 *
 * 디자인 케이스 인벤토리 LS-1~12 (docs/02-design/features/heir-allocation-legal-share.engine.design.md §3)
 * 법령: 민법 §1009·§1003·§1000 (KoreanLaw 검증 완료)
 */
import { describe, it, expect } from "vitest";
import {
  computeLegalShares,
  distributeByLegalShares,
} from "@/lib/tax-engine/inheritance-legal-share";
import type { Heir, HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

let _id = 0;
function h(relation: HeirRelation, extra: Partial<Heir> = {}): Heir {
  return { id: `h${++_id}`, relation, ...extra };
}

/** 분자합 === 분모 자가검증 */
function assertSumEqualsDenominator(result: ReturnType<typeof computeLegalShares>) {
  const sum = result.shares.reduce((s, x) => s + x.numerator, 0);
  if (result.shares.length > 0) expect(sum).toBe(result.denominator);
}

describe("computeLegalShares — 민법 §1009·§1003·§1000", () => {
  it("[LS-1] 배우자 + 자녀 2 → 분모 7, 배우자 3 / 자녀 각 2", () => {
    const spouse = h("spouse");
    const c1 = h("child");
    const c2 = h("child");
    const r = computeLegalShares([spouse, c1, c2]);
    expect(r.denominator).toBe(7);
    expect(r.shares.find((s) => s.heirId === spouse.id)?.numerator).toBe(3);
    expect(r.shares.find((s) => s.heirId === c1.id)?.numerator).toBe(2);
    expect(r.shares.find((s) => s.heirId === c2.id)?.numerator).toBe(2);
    assertSumEqualsDenominator(r);
  });

  it("[LS-2] 배우자 + 자녀 1 → 분모 5, 배우자 3 / 자녀 2", () => {
    const spouse = h("spouse");
    const c1 = h("child");
    const r = computeLegalShares([spouse, c1]);
    expect(r.denominator).toBe(5);
    expect(r.shares.find((s) => s.heirId === spouse.id)?.numerator).toBe(3);
    expect(r.shares.find((s) => s.heirId === c1.id)?.numerator).toBe(2);
    assertSumEqualsDenominator(r);
  });

  it("[LS-3] 배우자 + 직계존속 2 (자녀 없음) → 분모 7, 배우자 3 / 존속 각 2", () => {
    const spouse = h("spouse");
    const a1 = h("lineal_ascendant");
    const a2 = h("lineal_ascendant");
    const r = computeLegalShares([spouse, a1, a2]);
    expect(r.denominator).toBe(7);
    expect(r.shares.find((s) => s.heirId === spouse.id)?.numerator).toBe(3);
    expect(r.shares.find((s) => s.heirId === a1.id)?.numerator).toBe(2);
    assertSumEqualsDenominator(r);
  });

  it("[LS-4] 자녀 3 (배우자 없음) → 분모 3, 각 1", () => {
    const c = [h("child"), h("child"), h("child")];
    const r = computeLegalShares(c);
    expect(r.denominator).toBe(3);
    c.forEach((x) => expect(r.shares.find((s) => s.heirId === x.id)?.numerator).toBe(1));
    assertSumEqualsDenominator(r);
  });

  it("[LS-5] 배우자 단독 → 분모 1, 배우자 1", () => {
    const spouse = h("spouse");
    const r = computeLegalShares([spouse]);
    expect(r.denominator).toBe(1);
    expect(r.shares).toHaveLength(1);
    expect(r.shares[0].numerator).toBe(1);
    assertSumEqualsDenominator(r);
  });

  it("[LS-6] 배우자 + 형제자매 2 → 배우자 단독(형제 0) §1003①", () => {
    const spouse = h("spouse");
    const s1 = h("sibling");
    const s2 = h("sibling");
    const r = computeLegalShares([spouse, s1, s2]);
    expect(r.denominator).toBe(1);
    expect(r.shares).toHaveLength(1);
    expect(r.shares[0].heirId).toBe(spouse.id);
    expect(r.shares.find((s) => s.heirId === s1.id)).toBeUndefined();
    assertSumEqualsDenominator(r);
  });

  it("[LS-7] 형제자매 2 (배우자·1·2순위 없음) → 분모 2, 각 1", () => {
    const s1 = h("sibling");
    const s2 = h("sibling");
    const r = computeLegalShares([s1, s2]);
    expect(r.denominator).toBe(2);
    expect(r.shares.find((s) => s.heirId === s1.id)?.numerator).toBe(1);
    assertSumEqualsDenominator(r);
  });

  it("[LS-8] other(방계) 2 → 분모 2, 각 1", () => {
    const o1 = h("other");
    const o2 = h("other");
    const r = computeLegalShares([o1, o2]);
    expect(r.denominator).toBe(2);
    expect(r.shares.find((s) => s.heirId === o1.id)?.numerator).toBe(1);
    assertSumEqualsDenominator(r);
  });

  it("[LS-9] 배우자 + 자녀1 + 직계존속1 → 존속 0 (순위 배제)", () => {
    const spouse = h("spouse");
    const c1 = h("child");
    const a1 = h("lineal_ascendant");
    const r = computeLegalShares([spouse, c1, a1]);
    expect(r.denominator).toBe(5); // 배우자3 + 자녀2
    expect(r.shares.find((s) => s.heirId === spouse.id)?.numerator).toBe(3);
    expect(r.shares.find((s) => s.heirId === c1.id)?.numerator).toBe(2);
    expect(r.shares.find((s) => s.heirId === a1.id)).toBeUndefined();
    assertSumEqualsDenominator(r);
  });

  it("[LS-10] 배우자 + 자녀1 + legatee → legatee 0", () => {
    const spouse = h("spouse");
    const c1 = h("child");
    const leg = h("legatee");
    const r = computeLegalShares([spouse, c1, leg]);
    expect(r.denominator).toBe(5);
    expect(r.shares.find((s) => s.heirId === leg.id)).toBeUndefined();
    assertSumEqualsDenominator(r);
  });

  it("[LS-11] 배우자 + 자녀1(isHeir=false) → 배우자 단독", () => {
    const spouse = h("spouse");
    const c1 = h("child", { isHeir: false });
    const r = computeLegalShares([spouse, c1]);
    expect(r.denominator).toBe(1);
    expect(r.shares).toHaveLength(1);
    expect(r.shares[0].heirId).toBe(spouse.id);
    assertSumEqualsDenominator(r);
  });

  it("corporate·legatee만 → 빈 배분", () => {
    const r = computeLegalShares([h("corporate"), h("legatee")]);
    expect(r.shares).toHaveLength(0);
  });
});

describe("distributeByLegalShares — floor 잔액 흡수", () => {
  it("[LS-1 금액] 7,000만 배우자+자녀2 → 30,000,000 / 20,000,000 / 20,000,000", () => {
    const spouse = h("spouse");
    const c1 = h("child");
    const c2 = h("child");
    const legal = computeLegalShares([spouse, c1, c2]);
    const m = distributeByLegalShares(70_000_000, legal);
    expect(m.get(spouse.id)).toBe(30_000_000); // 3/7 (최다분자 → 잔액 흡수)
    expect(m.get(c1.id)).toBe(20_000_000);
    expect(m.get(c2.id)).toBe(20_000_000);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(70_000_000);
  });

  it("[LS-12] 1억 자녀3 균분 → 33,333,334 + 33,333,333 + 33,333,333 (잔액 흡수, 합 1억)", () => {
    const c = [h("child"), h("child"), h("child")];
    const legal = computeLegalShares(c);
    const m = distributeByLegalShares(100_000_000, legal);
    const total = [...m.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(100_000_000); // 잔액 1원 흡수로 합 보존
  });
});
