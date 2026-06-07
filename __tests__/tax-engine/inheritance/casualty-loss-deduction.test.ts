/**
 * 상속세 재해손실공제 (상증법 §23) — anchor (CL-01~07)
 *
 * Plan:   docs/00-pm/inheritance-casualty-loss-deduction.plan.md
 * Design: docs/02-design/features/inheritance-casualty-loss-deduction.engine.design.md
 *
 * §23① 신고기한(§67) 이내 재난(화재·붕괴·폭발·환경오염사고·자연재해 §20①)으로 상속재산
 *      멸실·훼손 → 손실가액 과세가액 공제. 단서: 보험금·구상권 보전 가능분 제외.
 * §23 공제액 = max(0, lossValue − compensatedValue). §24 본문 열거 공제 → rawTotal 합산 후 capping.
 *
 * ⚠️ 기존 disasterLossDeduction(§24③ 분자/§54 증여세)와 별개 — casualtyLoss/casualtyLossDeduction.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { calcInheritanceDeductions } from "@/lib/tax-engine/deductions/inheritance-deductions";
import { buildBuppyo3Data } from "@/lib/calc/deduction-besshi-data";
import { EXAMPLE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";
import type {
  Heir,
  InheritanceDeductionInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

describe("상속세 재해손실공제 §23 — CL-01~07", () => {
  // §24 종합한도 회피용 큰 과세가액 (ceiling = 과세가액, capping 미발생)
  const HUGE = 10_000_000_000;
  const spouse: Heir = { id: "sp", relation: "spouse", name: "배우자" };
  const child: Heir = { id: "c1", relation: "child", name: "자녀" };

  const baseInput: InheritanceDeductionInput = {
    heirs: [spouse, child],
    deathDate: "2024-06-10",
  };

  it("CL-01 부분 보전 — loss 5억·comp 1.5억 → §23 공제 3.5억 (totalDeduction 반영)", () => {
    const without = calcInheritanceDeductions(baseInput, HUGE, 0);
    const withCasualty = calcInheritanceDeductions(
      { ...baseInput, casualtyLoss: { lossValue: 500_000_000, compensatedValue: 150_000_000 } },
      HUGE,
      0,
    );
    // §23 공제 3.5억이 rawTotal → totalDeduction에 합산 (echo만 아님)
    expect(withCasualty.totalDeduction - without.totalDeduction).toBe(350_000_000);
    expect(withCasualty.casualtyLossDeduction).toBe(350_000_000);
    expect(withCasualty.casualtyLossDeductionDetail?.netDeduction).toBe(350_000_000);
  });

  it("CL-02 전액 보전 — loss 2억·comp 2.5억 → 공제 0", () => {
    const r = calcInheritanceDeductions(
      { ...baseInput, casualtyLoss: { lossValue: 200_000_000, compensatedValue: 250_000_000 } },
      HUGE,
      0,
    );
    expect(r.casualtyLossDeduction).toBe(0);
  });

  it("CL-03 보전 미입력 — loss 3억·comp undefined → 공제 3억", () => {
    const r = calcInheritanceDeductions(
      { ...baseInput, casualtyLoss: { lossValue: 300_000_000 } },
      HUGE,
      0,
    );
    expect(r.casualtyLossDeduction).toBe(300_000_000);
  });

  it("CL-04 신고기한 경과 — isWithinFilingDeadline=false → 공제 0", () => {
    const r = calcInheritanceDeductions(
      {
        ...baseInput,
        casualtyLoss: { lossValue: 500_000_000, isWithinFilingDeadline: false },
      },
      HUGE,
      0,
    );
    expect(r.casualtyLossDeduction).toBe(0);
    expect(r.casualtyLossDeductionDetail?.isWithinFilingDeadline).toBe(false);
  });

  it("CL-05 §24 한도 capping — 과세가액 5.5억·자녀1(일괄 5억)·재해 1억 → 한도 5.5억", () => {
    const SMALL = 550_000_000; // ceiling = 5.5억 (유증·사전증여 0)
    const childOnly: InheritanceDeductionInput = { heirs: [child], deathDate: "2024-06-10" };

    const without = calcInheritanceDeductions(childOnly, SMALL, 0);
    expect(without.totalDeduction).toBe(500_000_000); // 일괄 5억, ceiling 미달

    const withCasualty = calcInheritanceDeductions(
      { ...childOnly, casualtyLoss: { lossValue: 100_000_000 } },
      SMALL,
      0,
    );
    // rawTotal 6억 > ceiling 5.5억 → capping
    expect(withCasualty.totalDeduction).toBe(550_000_000);
    expect(withCasualty.casualtyLossDeduction).toBe(100_000_000); // §23 raw 공제액은 echo 유지
  });

  it("CL-06 회귀 — casualtyLoss undefined → 공제 0, 기존 결과 불변", () => {
    const r = calcInheritanceDeductions(baseInput, HUGE, 0);
    expect(r.casualtyLossDeduction).toBe(0);
    expect(r.casualtyLossDeductionDetail).toBeUndefined();
  });

  it("CL-07 부표3 ㉘ 자기일관 — disaster === deductionDetail.casualtyLossDeduction (§54와 분리)", () => {
    const result = calcInheritanceTax({
      ...EXAMPLE_INPUT,
      deductionInput: {
        ...EXAMPLE_INPUT.deductionInput,
        casualtyLoss: { lossValue: 400_000_000, compensatedValue: 100_000_000 }, // §23 = 3억
      },
    });
    const bp3 = buildBuppyo3Data(result, EXAMPLE_INPUT.debtItems, undefined);
    // 부표3 ㉘ = §23 상속세 재해손실공제 (= deductionDetail.casualtyLossDeduction)
    expect(bp3.deduction.disaster).toBe(result.deductionDetail.casualtyLossDeduction);
    expect(result.deductionDetail.casualtyLossDeduction).toBe(300_000_000);
  });
});
