/**
 * anchor: 취득세 "계산 과정 상세 보기" step.formula 값 인라인 (AC1~AC6).
 * 계획서: docs/02-design/features/acquisition-step-formula-inline-values.plan.md
 *
 * 배경: AcquisitionTaxResultView.tsx:671이 result.steps[].formula(산식)를 amount 옆에 표시.
 *   엔진(acquisition-tax.ts)이 생성하는 formula가 피연산자·결과값을 문자로만 서술하던 것을
 *   실제 값 인라인으로 개선(양도세 A군 PR #819 동종). 본 anchor는 각 step formula에
 *   해당 값이 .toLocaleString()로 인라인됨을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../lib/tax-engine/types/acquisition.types";

const baseInput: Partial<AcquisitionTaxInput> = {
  acquiredBy: "individual",
  balancePaymentDate: "2024-03-15",
  registrationDate: "2024-03-20",
};

type Step = { label: string; formula?: string; amount: number };
const findFormula = (steps: Step[], label: string) =>
  steps.find((s) => s.label === label)?.formula ?? "";

describe("취득세 계산과정 산식 값 인라인 — 유상취득(감면 없음)", () => {
  // 5억 주택 1주택 비조정 + 전용 100㎡(85㎡ 초과 → 농특세 발동)
  const input: AcquisitionTaxInput = {
    ...(baseInput as AcquisitionTaxInput),
    propertyType: "housing",
    acquisitionCause: "purchase",
    reportedPrice: 500_000_000,
    standardValue: 450_000_000,
    houseCountAfter: 1,
    isRegulatedArea: false,
    areaSqm: 100,
  };
  const result = calcAcquisitionTax(input);
  const steps = result.steps as Step[];

  it("AC5 취득세 본세: 과세표준값 + 본세 결과값 인라인", () => {
    const f = findFormula(steps, "취득세 본세");
    expect(f).toContain((500_000_000).toLocaleString()); // 과세표준
    expect(f).toContain(result.acquisitionTax.toLocaleString()); // 결과(본세)
    expect(result.acquisitionTax).toBe(5_000_000);
  });

  it("AC3 농어촌특별세: 과세표준값 + 결과값 인라인", () => {
    const step = steps.find((s) => s.label === "농어촌특별세");
    expect(step, "농특세 step 부재 — areaSqm 100㎡ 시나리오 확인").toBeDefined();
    const f = step!.formula ?? "";
    expect(f).toContain((500_000_000).toLocaleString()); // 과세표준
    expect(f).toContain(step!.amount.toLocaleString()); // 결과(농특세)
  });

  it("AC4 지방교육세: 결과값 인라인", () => {
    const step = steps.find((s) => s.label === "지방교육세");
    expect(step, "지방교육세 step 부재").toBeDefined();
    expect(step!.formula ?? "").toContain(step!.amount.toLocaleString());
  });

  it("AC1 합계 납부세액(감면 전): 3항목값 + 합계 인라인", () => {
    const f = findFormula(steps, "합계 납부세액 (감면 전)");
    expect(f).toContain(result.acquisitionTax.toLocaleString()); // 취득세
    expect(f).toContain(result.totalTax.toLocaleString()); // 합계
    expect(/\d/.test(f)).toBe(true);
  });
});

describe("취득세 계산과정 산식 값 인라인 — 생애최초 감면", () => {
  // 3억 주택 생애최초 비수도권 → 감면 2,000,000
  const input: AcquisitionTaxInput = {
    ...(baseInput as AcquisitionTaxInput),
    propertyType: "housing",
    acquisitionCause: "purchase",
    reportedPrice: 250_000_000,
    standardValue: 200_000_000,
    houseCountAfter: 1,
    isRegulatedArea: false,
    isFirstHome: true,
    isMetropolitan: false,
  };
  const result = calcAcquisitionTax(input);
  const steps = result.steps as Step[];

  it("감면 시나리오 전제: reductionAmount 2,000,000", () => {
    expect(result.reductionAmount).toBe(2_000_000);
  });

  it("AC6 감면세액: 본세값 또는 한도 + 감면액 인라인", () => {
    const step = steps.find((s) => s.formula?.includes("감면") && s.amount < 0);
    expect(step, "감면 step 부재").toBeDefined();
    expect(step!.formula ?? "").toContain((2_000_000).toLocaleString()); // 감면액
  });

  it("AC2 감면 후 최종 납부세액: 합계·감면액·결과 인라인", () => {
    const f = findFormula(steps, "감면 후 최종 납부세액");
    expect(f).toContain(result.totalTax.toLocaleString()); // 합계(감면 전)
    expect(f).toContain((2_000_000).toLocaleString()); // 감면액
    expect(f).toContain(result.totalTaxAfterReduction.toLocaleString()); // 결과
  });
});
