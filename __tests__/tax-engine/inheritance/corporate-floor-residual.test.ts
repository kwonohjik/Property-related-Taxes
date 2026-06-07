/**
 * 영리법인 면제액 다수 안분 floor 잔액 흡수 (distributePerCorporate)
 *
 * 갭: 다수 영리법인 시 각 법인 exemptionAmount = floor(totalExemption × taxBase / totalTaxBase).
 *     모든 법인 floor → Σ exemptionAmount < totalExemption (잔액 ±법인수 원 손실).
 *     해결: 마지막 법인이 잔액 흡수 → Σ == totalExemption.
 *
 * 정책: [[feedback_floor_residual_absorption]]
 * 출처: docs/00-pm/inheritance-corporate-10bc-gaps.plan.md §범위외후속
 */
import { describe, it, expect } from "vitest";
import { calcCorporateExemption } from "@/lib/tax-engine/inheritance-corporate-exemption";

describe("CORP-FLOOR 영리법인 면제액 floor 잔액 흡수", () => {
  // 3개 법인 균등 과세표준(1:1:1) → floor(amount/3)×3 = amount − 잔액
  const perCorp = (id: string) => ({
    corporateId: id,
    inheritedAmount: 1_000_000_000,
    taxBase: 1_000_000_000,
    computedTax: 0,
    shareholders: [],
  });

  // amount(면제세액)가 3으로 안 나눠떨어지도록 구성:
  //   corporateGiftComputedTax = 100,000,000 (< limit → amount = 100,000,000)
  //   limit = floor(totalComputedTax × 3,000,000,000 / totalTaxBase) ≥ 100,000,000
  const input = {
    corporateGiftComputedTax: 100_000_000,
    corporateGiftTaxBase: 3_000_000_000, // 3개 법인 합
    totalComputedTax: 1_000_000_000,
    totalTaxBase: 5_000_000_000, // limit = floor(1e9 × 3e9 / 5e9) = 600,000,000 ≥ 100M
  };
  const opts = {
    perCorporateInputs: [perCorp("a"), perCorp("b"), perCorp("c")],
  };

  it("CORP-FLOOR-1: 3개 균등 법인 → Σ exemptionAmount == 전체 면제액(잔액 흡수)", () => {
    const r = calcCorporateExemption(input, opts);
    expect(r.amount).toBe(100_000_000); // min(100M, 600M)
    const bd = r.perCorporateBreakdown ?? [];
    expect(bd).toHaveLength(3);
    const sum = bd.reduce((s, c) => s + c.exemptionAmount, 0);
    // 잔액 흡수 후 정확히 일치 (floor만이면 99,999,999)
    expect(sum).toBe(100_000_000);
  });

  it("CORP-FLOOR-2 (회귀): 단일 법인 → 전체 면제액 그대로", () => {
    const r = calcCorporateExemption(input, {
      perCorporateInputs: [{ ...perCorp("a"), taxBase: 3_000_000_000 }],
    });
    const bd = r.perCorporateBreakdown ?? [];
    expect(bd).toHaveLength(1);
    expect(bd[0].exemptionAmount).toBe(r.amount);
  });

  it("CORP-FLOOR-3: 마지막 법인이 잔액 흡수 (앞 2개는 floor)", () => {
    const r = calcCorporateExemption(input, opts);
    const bd = r.perCorporateBreakdown ?? [];
    // 앞 2개 = floor(100M/3) = 33,333,333, 마지막 = 100M − 66,666,666 = 33,333,334
    expect(bd[0].exemptionAmount).toBe(33_333_333);
    expect(bd[1].exemptionAmount).toBe(33_333_333);
    expect(bd[2].exemptionAmount).toBe(33_333_334);
  });
});
