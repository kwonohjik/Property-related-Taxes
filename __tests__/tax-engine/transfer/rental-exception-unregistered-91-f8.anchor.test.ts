/**
 * F-8 — §155⑳(장기임대주택 보유자 거주주택 비과세 특례) × 미등기양도자산 anchor.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-8 · §15.
 *
 * 소득세법 §91①: 「제104조제3항에서 규정하는 미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중
 * 양도소득에 대한 소득세의 비과세에 관한 규정을 적용하지 아니한다.」 (KoreanLaw MST 280405)
 *
 * 일반 경로의 게이트는 `checkExemption` 진입부에만 있어 §155⑳ 특례 경로는 미등기여도 적용됐다.
 * 기대: 미등기면 특례 적용 불가 → 「특례 미입력 미등기」와 같은 세액(일반 과세 경로 · 70%).
 * mock 세율.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const rentalHousingException = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"),
      rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general",
      rentalAcquisitionType: "purchase",
      isApartment: false,
      region: "non-metro",
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

function run(o: { price: number; acq: number; unregistered: boolean; special: boolean }) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: o.price,
      acquisitionPrice: o.acq,
      acquisitionDate: D("2014-06-01"),
      transferDate: D("2024-06-01"),
      residencePeriodMonths: 60,
      isOneHousehold: true,
      householdHousingCount: 1,
      expenses: 0,
      isUnregistered: o.unregistered,
      ...(o.special ? { rentalHousingException } : {}),
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("F-8 §155⑳ × 미등기 (§91①)", () => {
  it("F8-1 15억 거주주택: 미등기면 특례 불적용 → 308,000,000 (종전 25,179,000) · 특례 없는 미등기와 같다", () => {
    const r = run({ price: 1_500_000_000, acq: 1_100_000_000, unregistered: true, special: true });
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(308_000_000);
    expect(r.totalTax).toBe(run({ price: 1_500_000_000, acq: 1_100_000_000, unregistered: true, special: false }).totalTax);
    expect(r.steps.some((s) => s.label.includes("적용 불가") && s.legalBasis === "소득세법 §91①")).toBe(true);
  });

  it("F8-2 10억 거주주택: 미등기면 전액 비과세가 아니다 (종전 0)", () => {
    const r = run({ price: 1_000_000_000, acq: 700_000_000, unregistered: true, special: true });
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(run({ price: 1_000_000_000, acq: 700_000_000, unregistered: true, special: false }).totalTax);
    expect(r.totalTax).toBe(231_000_000);
  });

  it("F8-3 긍정 짝: 등기면 특례 적용 — 15억 부분과세 4,009,500 · 10억 비과세 0", () => {
    const r15 = run({ price: 1_500_000_000, acq: 1_100_000_000, unregistered: false, special: true });
    expect(r15.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r15.totalTax).toBe(4_009_500);
    const r10 = run({ price: 1_000_000_000, acq: 700_000_000, unregistered: false, special: true });
    expect(r10.isExempt).toBe(true);
    expect(r10.totalTax).toBe(0);
  });
});
