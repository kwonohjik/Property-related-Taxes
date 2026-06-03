/**
 * L-9 anchor — inheritanceDeductionInputSchema deathDate 보존 검증 (2026-06-04)
 *
 * 수정 전: inheritanceDeductionInputSchema에 deathDate 미선언 → Zod strip.
 * 오케스트레이터(inheritance-tax.ts:416-417)가 input.deathDate로 재주입해 기능은 무해하나,
 * ⑫ 동기화 지점 위반 + 단독 호출 시 deathDate 소실 위험.
 *
 * 수정 후: schema에 deathDate optional 추가 → parse 후 값 보존.
 * [[feedback_api_zod_schema_sync]] ⑫ 동기화 지점.
 */

import { describe, it, expect } from "vitest";
import { inheritanceDeductionInputSchema } from "@/lib/validators/property-valuation-input";

const MIN_HEIR = {
  id: "heir-1",
  relation: "child" as const,
};

describe("L-9 — inheritanceDeductionInputSchema deathDate 보존", () => {
  it("DED-01: deathDate 포함 시 parse 후 보존 — strip 안 됨", () => {
    const input = {
      heirs: [MIN_HEIR],
      deathDate: "2024-03-15",
    };
    const result = inheritanceDeductionInputSchema.parse(input);
    expect(result.deathDate).toBe("2024-03-15");
  });

  it("DED-02: deathDate 미입력 시 parse 후 undefined — 기존 동작 보존", () => {
    const input = { heirs: [MIN_HEIR] };
    const result = inheritanceDeductionInputSchema.parse(input);
    expect(result.deathDate).toBeUndefined();
  });

  it("DED-03: 윤년 말일 deathDate(2024-02-29) 보존", () => {
    const input = {
      heirs: [MIN_HEIR],
      deathDate: "2024-02-29",
    };
    const result = inheritanceDeductionInputSchema.parse(input);
    expect(result.deathDate).toBe("2024-02-29");
  });

  it("DED-04: 형식 불일치(YYYY/MM/DD) → ZodError (regex 검증)", () => {
    const input = {
      heirs: [MIN_HEIR],
      deathDate: "2024/03/15",
    };
    expect(() => inheritanceDeductionInputSchema.parse(input)).toThrow();
  });

  it("DED-05: deathDate와 다른 필드 공존 시 deathDate 보존", () => {
    const input = {
      heirs: [MIN_HEIR],
      deathDate: "2024-12-31",
      spouseActualAmount: 500_000_000,
      netFinancialAssets: 100_000_000,
    };
    const result = inheritanceDeductionInputSchema.parse(input);
    expect(result.deathDate).toBe("2024-12-31");
    expect(result.spouseActualAmount).toBe(500_000_000);
  });
});
