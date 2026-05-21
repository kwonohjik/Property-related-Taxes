/**
 * ANCHOR-F5-1~F5-5 — PR 2 부표 5 영리법인 면제 별도 명세 (perCorporateBreakdown).
 *
 * 계획서: docs/00-pm/inheritance-besshi-9-buppyo-5-corporate-exemption.plan.md
 */

import { describe, it, expect } from "vitest";
import {
  calcCorporateExemption,
  type PerCorporateInput,
} from "@/lib/tax-engine/inheritance-corporate-exemption";

describe("PR 2 — 부표 5 영리법인 면제 분배 (perCorporateBreakdown)", () => {
  it("ANCHOR-F5-1: PDF 책 1866 ⑩ — 영리법인 1개 + 주주 매핑", () => {
    // PDF 사례 가정: 영리법인 M사 1개, 유증가액 7억, 면제세액 150M
    // 주주: 자녀1 (60%), 손자 (20%) — 외부 주주 20%
    const perCorporateInputs: PerCorporateInput[] = [
      {
        corporateId: "corporate_msa",
        inheritedAmount: 700_000_000,
        taxBase: 700_000_000,
        computedTax: 150_000_000,
        shareholders: [
          { id: "s1", relation: "heir", name: "자녀1", shareRatio: 0.6 },
          {
            id: "s2",
            relation: "lineal_descendant_of_heir",
            name: "손자",
            shareRatio: 0.2,
          },
        ],
      },
    ];
    const result = calcCorporateExemption(
      {
        corporateGiftComputedTax: 150_000_000,
        corporateGiftTaxBase: 700_000_000,
        totalComputedTax: 1_627_500_000,
        totalTaxBase: 4_175_000_000,
      },
      { perCorporateInputs },
    );
    expect(result.amount).toBe(150_000_000); // 한도 272M > 산출세액 150M → 150M
    expect(result.perCorporateBreakdown).toBeDefined();
    expect(result.perCorporateBreakdown!.length).toBe(1);

    const detail = result.perCorporateBreakdown![0];
    expect(detail.corporateId).toBe("corporate_msa");
    expect(detail.exemptionAmount).toBe(150_000_000); // 단일 영리법인
    expect(detail.tenPercentBaseline).toBe(70_000_000); // 7억 × 10%
    // ⑪ = (150M - 70M) × 0.6 = 48M (자녀1)
    expect(detail.shareholderPayments[0].paymentAmount).toBe(48_000_000);
    // ⑪ = (150M - 70M) × 0.2 = 16M (손자)
    expect(detail.shareholderPayments[1].paymentAmount).toBe(16_000_000);
  });

  it("ANCHOR-F5-2: 다수 영리법인 안분 (taxBase 비례)", () => {
    // 영리법인 2개 — 과세표준 7억 / 3억 → 면제 100M 안분 70:30
    const perCorporateInputs: PerCorporateInput[] = [
      {
        corporateId: "corp_a",
        inheritedAmount: 700_000_000,
        taxBase: 700_000_000,
        computedTax: 70_000_000,
        shareholders: [],
      },
      {
        corporateId: "corp_b",
        inheritedAmount: 300_000_000,
        taxBase: 300_000_000,
        computedTax: 30_000_000,
        shareholders: [],
      },
    ];
    const result = calcCorporateExemption(
      {
        corporateGiftComputedTax: 100_000_000,
        corporateGiftTaxBase: 1_000_000_000,
        totalComputedTax: 1_000_000_000,
        totalTaxBase: 5_000_000_000,
      },
      { perCorporateInputs },
    );
    expect(result.perCorporateBreakdown!.length).toBe(2);
    // 산식: floor(amount × taxBase / totalTaxBase)
    // amount = Min(100M, 한도) = Min(100M, floor(1B × 1B / 5B)) = Min(100M, 200M) = 100M
    // corp_a = floor(100M × 700M / 1B) = 70M
    // corp_b = floor(100M × 300M / 1B) = 30M
    expect(result.perCorporateBreakdown![0].exemptionAmount).toBe(70_000_000);
    expect(result.perCorporateBreakdown![1].exemptionAmount).toBe(30_000_000);
  });

  it("ANCHOR-F5-3: 주주 없음 — 면제 발동 + 부표 5 나. 빈 행", () => {
    const perCorporateInputs: PerCorporateInput[] = [
      {
        corporateId: "corp_only",
        inheritedAmount: 500_000_000,
        taxBase: 500_000_000,
        computedTax: 80_000_000,
        shareholders: [],
      },
    ];
    const result = calcCorporateExemption(
      {
        corporateGiftComputedTax: 80_000_000,
        corporateGiftTaxBase: 500_000_000,
        totalComputedTax: 500_000_000,
        totalTaxBase: 2_000_000_000,
      },
      { perCorporateInputs },
    );
    expect(result.amount).toBeGreaterThan(0);
    expect(result.perCorporateBreakdown![0].shareholderPayments).toEqual([]);
  });

  it("ANCHOR-F5-4 (회귀): perCorporateInputs 미제공 — 기존 동작 보존", () => {
    const result = calcCorporateExemption({
      corporateGiftComputedTax: 80_000_000,
      corporateGiftTaxBase: 500_000_000,
      totalComputedTax: 500_000_000,
      totalTaxBase: 2_000_000_000,
    });
    expect(result.amount).toBeGreaterThan(0);
    expect(result.perCorporateBreakdown).toBeUndefined();
  });

  it("ANCHOR-F5-5: 음수 가드 — (⑤ − ⑥) < 0 시 주주 환원 0", () => {
    // 면제세액 < 10% 기준 → 잔여 음수 → 주주 환원 0
    const perCorporateInputs: PerCorporateInput[] = [
      {
        corporateId: "corp_small",
        inheritedAmount: 1_000_000_000, // ④ 10억
        taxBase: 1_000_000_000,
        computedTax: 50_000_000, // 면제 50M < 10% baseline (100M)
        shareholders: [
          { id: "s1", relation: "heir", name: "자녀", shareRatio: 1.0 },
        ],
      },
    ];
    const result = calcCorporateExemption(
      {
        corporateGiftComputedTax: 50_000_000,
        corporateGiftTaxBase: 1_000_000_000,
        totalComputedTax: 1_000_000_000,
        totalTaxBase: 10_000_000_000,
      },
      { perCorporateInputs },
    );
    const detail = result.perCorporateBreakdown![0];
    expect(detail.tenPercentBaseline).toBe(100_000_000); // 10억 × 10%
    // 잔여 = max(0, 50M - 100M) = 0 → 환원 0
    expect(detail.shareholderPayments[0].paymentAmount).toBe(0);
  });
});
