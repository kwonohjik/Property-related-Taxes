/**
 * 취득세 브라우저 실측 결함 — F-2·F-5 anchor (계획: docs/00-pm/acquisition-browser-findings-5.plan.md)
 *
 * - F-2: 6~9억 주택 선형보간 세율의 근거 「지방세법 §11①8호 나목」(ACQUISITION.LINEAR_RATE)이
 *   본세 step·산식·결과 legalBasis(적용 법령 배지)에 나와야 한다. 중과·세율특례가 최종 세율이면 싣지 않는다.
 * - F-5: 무상취득 시가인정액 경고 문구의 닫는 괄호.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import { ACQUISITION } from "../../../lib/tax-engine/legal-codes";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

function calc(input: Partial<AcquisitionTaxInput>) {
  return calcAcquisitionTax({
    propertyType: "housing",
    acquisitionCause: "purchase",
    acquiredBy: "individual",
    houseCountAfter: 1,
    isRegulatedArea: false,
    balancePaymentDate: "2026-11-01",
    ...input,
  } as AcquisitionTaxInput);
}

const bonse = (r: ReturnType<typeof calc>) => r.steps.find((s) => s.label === "취득세 본세");

describe("F-2 6~9억 선형보간 세율 근거 §11①8호 나목", () => {
  it("개인 1주택 7.5억 → 본세 step·산식·legalBasis 모두 LINEAR_RATE", () => {
    const r = calc({ reportedPrice: 750_000_000 });
    expect(r.appliedRate).toBe(0.02);
    expect(bonse(r)?.legalBasis).toBe(ACQUISITION.LINEAR_RATE);
    expect(bonse(r)?.formula).toContain("지방세법 §11①8호 나목");
    expect(r.legalBasis).toContain(ACQUISITION.LINEAR_RATE);
  });

  it("5억(1%) → 본세 step은 BASIC_RATE 그대로, LINEAR_RATE 없음", () => {
    const r = calc({ reportedPrice: 500_000_000 });
    expect(bonse(r)?.legalBasis).toBe(ACQUISITION.BASIC_RATE);
    expect(r.legalBasis).not.toContain(ACQUISITION.LINEAR_RATE);
  });

  it("조정 2주택 7.5억(8% 중과) → LINEAR_RATE 싣지 않음", () => {
    const r = calc({ reportedPrice: 750_000_000, houseCountAfter: 2, isRegulatedArea: true });
    expect(r.appliedRate).toBe(0.08);
    expect(bonse(r)?.legalBasis).not.toBe(ACQUISITION.LINEAR_RATE);
    expect(r.legalBasis).not.toContain(ACQUISITION.LINEAR_RATE);
  });

  it("법인 7.5억(12% 중과) → LINEAR_RATE 싣지 않음", () => {
    const r = calc({ reportedPrice: 750_000_000, acquiredBy: "corporation" });
    expect(r.appliedRate).toBe(0.12);
    expect(r.legalBasis).not.toContain(ACQUISITION.LINEAR_RATE);
  });
});

describe("F-5 무상취득 시가인정액 경고 괄호", () => {
  it("증여 시가인정액 5억 → 「시가인정액(500,000,000) 적용」", () => {
    const r = calc({ acquisitionCause: "gift", reportedPrice: undefined, marketValue: 500_000_000, standardValue: 300_000_000 });
    expect(r.warnings).toContain("무상취득 — 시가인정액(500,000,000) 적용");
  });
});
