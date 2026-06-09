/**
 * 작업1 anchor — 비과세/과세가액 불산입 treatment echo + 분리 합계
 *
 * exemption-evaluator.ts:
 *  - ExemptionItemResult.treatment = rule.taxTreatment ?? "non_taxable"
 *  - ExemptionResult.nonTaxableTotal / notIncludedTotal 분리 집계
 *
 * 결과 화면(ExemptionSummaryCard)이 §12 비과세와 §16·§17 과세가액 불산입을
 * 별도 그룹으로 표시하기 위한 엔진 echo.
 */

import { describe, it, expect } from "vitest";
import { evaluateExemptions } from "@/lib/tax-engine/exemption-evaluator";

describe("비과세/과세가액 불산입 treatment echo (작업1)", () => {
  it("ET-1: 혼재 입력 — 족보(§12 비과세) + 공익법인(§16 불산입) 분리", () => {
    const r = evaluateExemptions(
      [
        { ruleId: "inh_ritual_items", claimedAmount: 10_000_000 }, // §12 non_taxable
        { ruleId: "inh_public_interest", claimedAmount: 100_000_000 }, // §16 not_included
      ],
      2_000_000_000,
    );

    const ritual = r.itemResults.find((x) => x.ruleId === "inh_ritual_items")!;
    const publicInterest = r.itemResults.find(
      (x) => x.ruleId === "inh_public_interest",
    )!;

    expect(ritual.treatment).toBe("non_taxable");
    expect(publicInterest.treatment).toBe("not_included");

    expect(r.nonTaxableTotal).toBe(10_000_000);
    expect(r.notIncludedTotal).toBe(100_000_000);
    expect(r.totalExemptAmount).toBe(110_000_000);
  });

  it("ET-2: 비과세만 — notIncludedTotal 0", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_ritual_items", claimedAmount: 10_000_000 }],
      2_000_000_000,
    );
    expect(r.nonTaxableTotal).toBe(10_000_000);
    expect(r.notIncludedTotal).toBe(0);
  });

  it("ET-3: 공익신탁(§17)도 not_included", () => {
    const r = evaluateExemptions(
      [{ ruleId: "inh_public_trust", claimedAmount: 50_000_000 }],
      2_000_000_000,
    );
    const trust = r.itemResults.find((x) => x.ruleId === "inh_public_trust")!;
    expect(trust.treatment).toBe("not_included");
    expect(r.notIncludedTotal).toBe(50_000_000);
    expect(r.nonTaxableTotal).toBe(0);
  });
});
