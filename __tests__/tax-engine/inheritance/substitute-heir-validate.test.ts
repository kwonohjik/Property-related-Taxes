/**
 * 대습상속 입력 검증 (결정-C) — validateSubstituteHeirs anchor.
 */

import { describe, it, expect } from "vitest";
import { validateSubstituteHeirs } from "@/lib/calc/inheritance-validate-substitute";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("대습상속 입력 검증 (§1001·§1003②)", () => {
  it("SH-6 그룹은 있으나 원래순위·역할 미선택 → 차단", () => {
    const heirs: Heir[] = [
      { id: "wife", relation: "other", substituteGroupId: "g1", name: "윤며느리" },
    ];
    const errs = validateSubstituteHeirs(heirs);
    expect(errs.length).toBe(2);
    expect(errs.some((e) => e.includes("원래순위"))).toBe(true);
    expect(errs.some((e) => e.includes("역할"))).toBe(true);
  });

  it("SH-6b 그룹당 배우자(spouse) 역할 2인 → 차단 (§1003② 1인)", () => {
    const heirs: Heir[] = [
      { id: "w1", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "spouse" },
      { id: "w2", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "spouse" },
    ];
    const errs = validateSubstituteHeirs(heirs);
    expect(errs.some((e) => e.includes("배우자"))).toBe(true);
  });

  it("정상 입력(원래순위·역할 선택) → 오류 0", () => {
    const heirs: Heir[] = [
      { id: "wife", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "spouse" },
      { id: "gson", relation: "other", substituteGroupId: "g1", substituteForRelation: "child", substituteRole: "descendant" },
    ];
    expect(validateSubstituteHeirs(heirs)).toEqual([]);
  });

  it("대습 입력 없음 → 오류 0", () => {
    const heirs: Heir[] = [
      { id: "spouse", relation: "spouse" },
      { id: "c1", relation: "child" },
    ];
    expect(validateSubstituteHeirs(heirs)).toEqual([]);
  });
});
