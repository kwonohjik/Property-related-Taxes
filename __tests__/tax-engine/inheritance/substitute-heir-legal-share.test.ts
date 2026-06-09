/**
 * 대습상속인 법정상속분 (민법 §1001·§1003②·§1010) — computeLegalShares 확장 anchor
 *
 * 설계: docs/02-design/features/inheritance-substitute-heir.engine.design.md
 * 케이스: SH-1~11. numerator는 공통분모(GCD 약분 후) 정수 직접 비교.
 */

import { describe, it, expect } from "vitest";
import { computeLegalShares } from "@/lib/tax-engine/inheritance-legal-share";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

function num(heirs: Heir[], id: string): number {
  const r = computeLegalShares(heirs);
  const s = r.shares.find((x) => x.heirId === id);
  return s ? s.numerator : 0;
}
function denom(heirs: Heir[]): number {
  return computeLegalShares(heirs).denominator;
}

describe("대습상속인 법정상속분 (§1001·§1003②·§1010)", () => {
  it("SH-1 배우자+생존자녀2+피대습자녀1(며느리 spouse+손자 desc) → 분모45 (★Pre-Do RED)", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "c1", relation: "child" },
      { id: "c2", relation: "child" },
      { id: "wife", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "spouse" },
      { id: "gson", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
    ];
    expect(denom(heirs)).toBe(45);
    expect(num(heirs, "spouse")).toBe(15);
    expect(num(heirs, "c1")).toBe(10);
    expect(num(heirs, "c2")).toBe(10);
    expect(num(heirs, "wife")).toBe(6);
    expect(num(heirs, "gson")).toBe(4);
  });

  it("SH-2 배우자+생존자녀1+피대습자녀1(손자2, 배우자대습 없음) → 분모7 균분 (★Pre-Do RED)", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "c1", relation: "child" },
      { id: "gs1", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
      { id: "gs2", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
    ];
    // base: 자녀슬롯 2(생존1+대습1) → 배우자3:자녀2씩 denom7. 피대습슬롯2 균분 → 손자 1/7 each. GCD 약분.
    expect(denom(heirs)).toBe(7);
    expect(num(heirs, "spouse")).toBe(3);
    expect(num(heirs, "c1")).toBe(2);
    expect(num(heirs, "gs1")).toBe(1);
    expect(num(heirs, "gs2")).toBe(1);
  });

  it("SH-3 며느리 단독 대습(피대습자녀 직계비속 없음, §1003② 단독)", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "c1", relation: "child" },
      { id: "wife", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "spouse" },
    ];
    // 며느리가 피대습 슬롯 전부 → 분모7: 배우자3·생존자녀2·며느리2
    expect(denom(heirs)).toBe(7);
    expect(num(heirs, "spouse")).toBe(3);
    expect(num(heirs, "c1")).toBe(2);
    expect(num(heirs, "wife")).toBe(2);
  });

  it("SH-4 자녀 전원 사망 2그룹(g1 손자2 / g2 며느리+손자1) — 상이 S commonExtra=20", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "g1a", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
      { id: "g1b", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
      { id: "g2w", relation: "other", substituteGroupId: "g2", substituteForRelation: "child", substituteRole: "spouse" },
      { id: "g2s", relation: "other", substituteGroupId: "g2", substituteForRelation: "child", substituteRole: "descendant" },
    ];
    // base denom7(배우자3:슬롯2씩 2슬롯). g1 S=4·g2 S=5 → commonExtra20 → GCD4 약분 → 분모35
    expect(denom(heirs)).toBe(35);
    expect(num(heirs, "spouse")).toBe(15);
    expect(num(heirs, "g1a")).toBe(5);
    expect(num(heirs, "g1b")).toBe(5);
    expect(num(heirs, "g2w")).toBe(6);
    expect(num(heirs, "g2s")).toBe(4);
  });

  it("SH-5 형제자매 대습(조카2, 배우자 부재) — 3순위 §1010② 균분", () => {
    const heirs: Heir[] = [
      { id: "n1", relation: "other", substituteGroupId: "g1", substituteForRelation: "sibling", substituteRole: "descendant" },
      { id: "n2", relation: "other", substituteGroupId: "g1", substituteForRelation: "sibling", substituteRole: "descendant" },
    ];
    // 형제 슬롯1 균분(spouse無) → 분모2: 조카 1·1
    expect(denom(heirs)).toBe(2);
    expect(num(heirs, "n1")).toBe(1);
    expect(num(heirs, "n2")).toBe(1);
  });

  it("SH-5b 형제 대습 + 배우자 존재 → §1003① 배우자 단독(형제·조카 0)", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "n1", relation: "other", substituteGroupId: "g1", substituteForRelation: "sibling", substituteRole: "descendant" },
    ];
    expect(denom(heirs)).toBe(1);
    expect(num(heirs, "spouse")).toBe(1);
    expect(num(heirs, "n1")).toBe(0);
  });

  it("SH-7 회귀 — 대습 無(배우자+자녀2) 기존 §1009 불변", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "c1", relation: "child" },
      { id: "c2", relation: "child" },
    ];
    expect(denom(heirs)).toBe(7);
    expect(num(heirs, "spouse")).toBe(3);
    expect(num(heirs, "c1")).toBe(2);
    expect(num(heirs, "c2")).toBe(2);
  });

  it("SH-10 §19 배우자 법정지분 — SH-1 구성 시 피대습 슬롯 포함 1/3 (1.5/4.5)", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "c1", relation: "child" },
      { id: "c2", relation: "child" },
      { id: "wife", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "spouse" },
      { id: "gson", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
    ];
    const r = computeLegalShares(heirs);
    const spouse = r.shares.find((s) => s.heirId === "spouse")!;
    // 배우자 1.5 : 코상속인 3슬롯(생존2+대습1) → 15/45 = 1/3
    expect(spouse.numerator / r.denominator).toBeCloseTo(1 / 3, 10);
  });
});
