/**
 * 영리법인 면제액 — 법인별 독립 Min(증여세 산출세액, 법인별 한도) + 집계 = Σ (P-5)
 *
 * 모델(2026-07-17 정정, P-5): 다수 영리법인은 각 법인 ⑤_i = Min(법인 증여세, 법인별 한도)로
 *   독립 계산하고 집계 면제세액 amount = Σ ⑤_i 이다. 법인별 한도 = floor(상속세 산출세액 ×
 *   법인 과세표준 / 상속세 과세표준) — §3의2② 지분상당액의 "상속세 상당액"과 동일.
 *
 * ⚠ 폐기된 이전 모델: amount = Min(Σ증여세, 집계한도)을 taxBase 비율로 배분 + 마지막 법인 잔액흡수.
 *   → 한 법인의 면제를 다른 법인의 증여세 여력으로 정당화(저세율 법인 ⑤ 과다배분) → 위법.
 *
 * 정책: 집행기준 28-0-1 Min(한도, 산출세액) 캡을 단일법인 경로와 동일하게 법인별 적용.
 * 출처: docs/00-pm/inheritance-corporate-10bc-gaps.plan.md §범위외후속 (모델 정정)
 */
import { describe, it, expect } from "vitest";
import {
  calcCorporateExemption,
  type PerCorporateInput,
} from "@/lib/tax-engine/inheritance-corporate-exemption";

describe("CORP-PC 영리법인 면제 — 법인별 독립 Min 캡 + 집계 = Σ", () => {
  const perCorp = (
    id: string,
    over: Partial<PerCorporateInput> = {},
  ): PerCorporateInput => ({
    corporateId: id,
    inheritedAmount: 1_000_000_000,
    taxBase: 1_000_000_000,
    computedTax: 400_000_000,
    shareholders: [],
    ...over,
  });

  it("CORP-PC-1: 법인별 한도(floor) 바인딩 — 각 ⑤ = floor(TC × base / TTB), 집계 = Σ", () => {
    // TC = 1B, TTB = 3B → 법인별 한도 = floor(1e9 × 1e9 / 3e9) = 333,333,333 (floor 손실 관찰)
    // computedTax 400M > 한도 333,333,333 → ⑤_i = 333,333,333
    const r = calcCorporateExemption(
      {
        corporateGiftComputedTax: 1_200_000_000, // 3 × 400M
        corporateGiftTaxBase: 3_000_000_000,
        totalComputedTax: 1_000_000_000,
        totalTaxBase: 3_000_000_000,
      },
      { perCorporateInputs: [perCorp("a"), perCorp("b"), perCorp("c")] },
    );
    const bd = r.perCorporateBreakdown ?? [];
    expect(bd).toHaveLength(3);
    expect(bd[0].exemptionAmount).toBe(333_333_333);
    expect(bd[1].exemptionAmount).toBe(333_333_333);
    expect(bd[2].exemptionAmount).toBe(333_333_333);
    // 집계 = Σ ⑤_i (법인별 floor 손실은 각자 반영 — 인위적 잔액흡수 없음)
    expect(r.amount).toBe(999_999_999);
    expect(bd.reduce((s, c) => s + c.exemptionAmount, 0)).toBe(r.amount);
  });

  it("CORP-PC-2: 증여세 산출세액 바인딩 — 저세율 법인은 자기 증여세로 캡", () => {
    // 법인별 한도(TC=1B,TTB=5B,base=1B) = floor(1e9×1e9/5e9) = 200M
    // corp_a computedTax 50M < 200M → ⑤=50M(증여세 캡), corp_b 400M > 200M → ⑤=200M(한도 캡)
    const r = calcCorporateExemption(
      {
        corporateGiftComputedTax: 450_000_000,
        corporateGiftTaxBase: 2_000_000_000,
        totalComputedTax: 1_000_000_000,
        totalTaxBase: 5_000_000_000,
      },
      {
        perCorporateInputs: [
          perCorp("a", { computedTax: 50_000_000 }),
          perCorp("b", { computedTax: 400_000_000 }),
        ],
      },
    );
    const bd = r.perCorporateBreakdown ?? [];
    expect(bd[0].exemptionAmount).toBe(50_000_000); // 증여세 캡
    expect(bd[1].exemptionAmount).toBe(200_000_000); // 한도 캡
    expect(r.amount).toBe(250_000_000);
  });

  it("CORP-PC-3 (회귀): 단일 법인 → ⑤ = amount = Min(증여세, 한도)", () => {
    const r = calcCorporateExemption(
      {
        corporateGiftComputedTax: 100_000_000,
        corporateGiftTaxBase: 3_000_000_000,
        totalComputedTax: 1_000_000_000,
        totalTaxBase: 5_000_000_000,
      },
      {
        perCorporateInputs: [
          perCorp("a", { taxBase: 3_000_000_000, computedTax: 100_000_000 }),
        ],
      },
    );
    const bd = r.perCorporateBreakdown ?? [];
    expect(bd).toHaveLength(1);
    // 한도 = floor(1e9 × 3e9 / 5e9) = 600M > 증여세 100M → ⑤ = 100M
    expect(bd[0].exemptionAmount).toBe(100_000_000);
    expect(bd[0].exemptionAmount).toBe(r.amount);
  });
});
