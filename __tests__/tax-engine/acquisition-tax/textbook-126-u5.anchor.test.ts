/**
 * 취득세 교재 대조 U5 — §13의2④ 조정대상지역 지정 전 계약 보호 (교재 p12)
 *
 * 법 §13의2④ 「조정대상지역 지정고시일 이전에 주택에 대한 매매계약(공동주택 분양계약을 포함한다)을 체결한 경우
 * (계약금 지급 증빙 한정)에는 조정대상지역으로 지정되기 전에 주택을 취득한 것으로 본다」.
 * 종전 엔진: ① 지정고시일 입력을 쓰지 않았고(계약일이 고시일 뒤여도 적용) ② 증여에도 적용해 12% 중과가 풀렸다.
 */
import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

const PURCHASE: Partial<AcquisitionTaxInput> = {
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: 500_000_000,
  standardValue: 400_000_000,
  isRegulatedArea: true,
  houseCountAfter: 2,
  balancePaymentDate: "2026-11-01",
  contractDateBeforeRegulation: true,
  hasContractDepositProof: true,
};
const run = (o: Partial<AcquisitionTaxInput> = {}) => calcAcquisitionTax({ ...PURCHASE, ...o } as AcquisitionTaxInput);

describe("U5 §13의2④ — 매매계약일 ≤ 지정고시일일 때만 보호", () => {
  it("계약 2026-06-20 · 고시 2026-07-01 → 비조정 간주 1% = 5,000,000", () => {
    const r = run({ saleContractDate: "2026-06-20", regulationDesignationDate: "2026-07-01" });
    expect(r.isSurcharged).toBe(false);
    expect(r.acquisitionTax).toBe(5_000_000);
  });

  it("고시일 당일 계약도 「이전」에 포함", () => {
    expect(run({ saleContractDate: "2026-07-01", regulationDesignationDate: "2026-07-01" }).acquisitionTax).toBe(5_000_000);
  });

  it("계약 2026-07-02 > 고시 2026-07-01 → 토글이 켜져 있어도 조정 2주택 8% = 40,000,000 + 경고", () => {
    const r = run({ saleContractDate: "2026-07-02", regulationDesignationDate: "2026-07-01" });
    expect(r.isSurcharged).toBe(true);
    expect(r.acquisitionTax).toBe(40_000_000);
    expect(r.warnings.some((w) => w.includes("지정고시일(2026-07-01)보다 늦어"))).toBe(true);
  });

  it("날짜를 모르면 선택을 그대로 적용하고 확인 안내", () => {
    const r = run();
    expect(r.acquisitionTax).toBe(5_000_000);
    expect(r.warnings.some((w) => w.includes("날짜 확인 없이"))).toBe(true);
  });
});

describe("U5 §13의2④ — 증여에는 적용하지 않는다(매매계약이 아님)", () => {
  it("조정 시가표준액 7억 증여 + 지정 전 계약 토글 → 12% 중과 유지 (종전: 3.5%로 풀림)", () => {
    const r = calcAcquisitionTax({
      propertyType: "housing",
      acquisitionCause: "gift",
      acquiredBy: "individual",
      reportedPrice: 0,
      marketValue: 1_000_000_000,
      standardValue: 700_000_000,
      isRegulatedArea: true,
      houseCountAfter: 2,
      contractDate: "2026-11-01",
      contractDateBeforeRegulation: true,
      hasContractDepositProof: true,
    } as AcquisitionTaxInput);
    expect(r.isSurcharged).toBe(true);
    expect(r.acquisitionTax).toBe(120_000_000);
    expect(r.warnings.some((w) => w.includes("매매계약(공동주택 분양계약 포함)에만"))).toBe(true);
  });
});
