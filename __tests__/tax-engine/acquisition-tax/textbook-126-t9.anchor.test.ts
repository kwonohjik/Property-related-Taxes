/**
 * 취득세 교재 대조(「부동산 컨설팅 전문가 과정」 pp.126~157) — T9 anchor
 *
 * 교재 p30: 상속 1가구 1주택 세율특례(지방세법 §15①2호가목, 2.8% − 2% = 0.8%).
 * 시행령 §29①은 1가구 1주택의 「1개의 주택」에서 §28④ 고급주택을 제외한다 → 고급주택 상속은 특례가 없고
 * 표준세율 2.8%에 고급주택 중과(§13⑤ +8%p)를 적용한다. 종전 엔진은 0.8% + 8%p = 8.8%로 계산했다.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

const INHERIT: Partial<AcquisitionTaxInput> = {
  propertyType: "housing",
  acquisitionCause: "inheritance",
  acquiredBy: "individual",
  reportedPrice: 0,
  standardValue: 2_000_000_000,
  balancePaymentDate: "2026-06-01",
  houseCountAfter: 1,
  specialRateType: "inheritance_one_house",
  isOneHouseHousehold: true,
};
const run = (o: Partial<AcquisitionTaxInput> = {}) => calcAcquisitionTax({ ...INHERIT, ...o } as AcquisitionTaxInput);

describe("T9 고급주택 상속 — 1가구 1주택 세율특례 대상 아님 (시행령 §29①)", () => {
  it("20억 고급주택 상속 + 1가구 1주택 → 특례 없이 2.8% + 8%p = 10.8% · 216,000,000 (종전 8.8% · 176,000,000)", () => {
    const r = run({ isLuxuryProperty: true, luxuryType: "luxury_housing" });
    expect(r.appliedRate).toBeCloseTo(0.108, 10);
    expect(r.acquisitionTax).toBe(216_000_000);
    expect(r.ruralSpecialTax).toBe(20_000_000); // 특례 아님 → 농특세법 §4 10호의4 비과세 미적용
    expect(r.warnings.some((w) => w.includes("지방세법 시행령 §29①"))).toBe(true);
  });

  it("특례 토글이 없을 때와 같다", () => {
    const withToggle = run({ isLuxuryProperty: true, luxuryType: "luxury_housing" });
    const without = run({ isLuxuryProperty: true, luxuryType: "luxury_housing", specialRateType: undefined, isOneHouseHousehold: undefined });
    expect(withToggle.totalTax).toBe(without.totalTax);
  });

  it("고급주택이 아니면 특례 유지: 0.8% · 16,000,000", () => {
    const r = run();
    expect(r.appliedRate).toBe(0.008);
    expect(r.acquisitionTax).toBe(16_000_000);
  });
});
