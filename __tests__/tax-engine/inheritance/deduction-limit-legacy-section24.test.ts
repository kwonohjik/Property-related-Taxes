import { describe, it, expect } from "vitest";
import { applyDeductionLimit } from "@/lib/tax-engine/deductions/inheritance-deduction-limit";

/**
 * §24 종합한도 legacy fallback 5억 단서 (리뷰 확정 #17 회귀).
 *
 * params 미제공 legacy 분기가 사전증여를 무조건 차감 → 5억 이하 소액상속 공제한도 과소(납세자 불리).
 * 정정: taxableEstateValue > 5억일 때만 차감 (Phase D 분기와 동일 §24 단서).
 */
describe("§24 종합한도 legacy fallback 5억 단서 (리뷰 #17)", () => {
  it("[DL-LEGACY-LE5] 과세가액 4억(≤5억)+사전증여 1억 → 한도 4억 (사전증여 미차감)", () => {
    const r = applyDeductionLimit(1_000_000_000, 400_000_000, 100_000_000);
    // 5억 이하 → §24 단서로 사전증여 차감 안 함 → ceiling = 4억 (버그 시 3억)
    expect(r.ceiling).toBe(400_000_000);
  });

  it("[DL-LEGACY-GT5] 과세가액 8억(>5억)+사전증여 1억 → 한도 7억 (사전증여 차감, 회귀 방지)", () => {
    const r = applyDeductionLimit(1_000_000_000, 800_000_000, 100_000_000);
    expect(r.ceiling).toBe(700_000_000);
  });
});
