/**
 * 「조세특례제한법」 §77⑨ — 재개발·§155⑳ 거주주택 특례(임대주택) 경로에도 상속 토지등의 피상속인 취득일이 닿는다.
 *
 * #2126이 `calcReductions`의 `expropriationAcquisitionDate` 인자를 단건·다필지·재개발·임대주택 4경로에 배선했지만
 * 재개발(`transfer-tax-redevelopment.ts`)·임대주택(`transfer-tax-rental-housing-step.ts`) 경로는 전용 anchor가 없어
 * 인자를 지워도 아무 테스트도 실패하지 않았다. 각 경로가 실제로 도는 것(`redevelopment` 상세 / `applied`)을 전제로 확인한다.
 * 단건 경로: `expropriation-77-9-inheritance.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const PE = (notice: string) => ({
  type: "public_expropriation" as const,
  cashCompensation: 1_500_000_000,
  bondCompensation: 0,
  businessApprovalDate: new Date(notice),
});
const inherit = (decedent: string) => ({ acquisitionCause: "inheritance" as const, decedentAcquisitionDate: new Date(decedent) });

describe("재개발 경로 — 사례 44 · 사업인정고시 2025-06-01(소급 2년 = 2023-06-01)", () => {
  const redev = (o: Partial<TransferTaxInput>) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: new Date("2026-02-16"),
        acquisitionDate: new Date("2024-01-10"), acquisitionPrice: 0, expenses: 0, useEstimatedAcquisition: true,
        isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        redevelopment: case44RedevelopmentInfo(), reductions: [PE("2025-06-01")], ...o,
      }),
      rates,
    );

  it("매매 2024-01-10 → 불성립", () => {
    const r = redev({});
    expect(r.publicExpropriationDetail?.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.determinedTax).toBe(81_498_549);
  });

  it("상속 2024-01-10 · 피상속인 2005-04-09 취득 → 성립(종전 0)", () => {
    const r = redev(inherit("2005-04-09"));
    expect(r.publicExpropriationDetail?.isEligible).toBe(true);
    expect(r.reductionAmount).toBe(12_224_782);
    expect(r.determinedTax).toBe(69_273_767);
  });
});

describe("§155⑳ 거주주택 특례 경로 — 취득 2014-06-01 · 사업인정고시 2015-06-01(소급 2년 = 2013-06-01)", () => {
  const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        businessRegistrationDate: new Date("2018-06-01"), rentalRegistrationDate: new Date("2018-06-01"),
        rentalCategory: "long_general", rentalAcquisitionType: "purchase", isApartment: false, region: "non-metro",
        isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96,
        rentalAutoTermination: false, requirementsConfirmed: true,
      },
    ],
  };
  const rent = (o: Partial<TransferTaxInput>) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 1_500_000_000, acquisitionPrice: 1_100_000_000,
        acquisitionDate: new Date("2014-06-01"), transferDate: new Date("2024-06-01"), residencePeriodMonths: 60,
        isOneHousehold: true, householdHousingCount: 1, expenses: 0, reductions: [PE("2015-06-01")],
        rentalHousingException: rentalException, ...o,
      }),
      rates,
    );

  it("매매 → 특례 경로에서 불성립", () => {
    const r = rent({});
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.reductionAmount).toBe(0);
    expect(r.determinedTax).toBe(3_165_000);
  });

  it("상속 · 피상속인 2010-01-01 취득 → 특례 경로에서 성립(종전 0)", () => {
    const r = rent(inherit("2010-01-01"));
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.reductionAmount).toBe(316_500);
    expect(r.determinedTax).toBe(2_848_500);
  });
});
