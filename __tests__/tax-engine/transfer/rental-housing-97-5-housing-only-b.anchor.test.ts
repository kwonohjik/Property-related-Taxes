/**
 * anchor — §155⑳ 거주주택 특례 경로에서 §97의5 감면대상 소득(「소득세법」 §90①의 B)은 **주택분만** (2026-11-01)
 *
 * 이 경로는 `calcReductions`에 과세대상 소득 합(`totalTaxableIncome` = 주택분 + 배율 초과 비사업용 토지분 +
 * 나중 취득 부수토지분)을 넘긴다. §97의5는 임대**주택**의 「임대기간 중 발생한 양도소득」만 감면하는데,
 * 계속 임대면 안분 비율이 1이라 B = 합계 → **배율 초과 토지분 세액까지 전액 감면**됐다.
 * 겸용주택 경로(`rental-97-5-period-end-sec90.anchor.test.ts` 겸용 케이스)와 같은 결함·같은 수정.
 *
 * 가정: 배율 이내 부수토지(나중 취득분 포함)는 주택의 일부라 B에 넣고, 배율 초과분은 주택이 아니라 뺀다.
 *
 * [시료] `rental-housing-nbl-deferral.anchor.test.ts`의 고가 시료(20억 · 토지 660㎡ · 도시지역 밖 배율 600㎡ → 초과 60㎡)를
 *   양도 2020-09-01로 옮기고 §97의5 요건을 채웠다. 세액은 mock 세율표 값(구조 증거)이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2005-06-01"),
      rentalRegistrationDate: D("2005-06-01"),
      rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const,
      isApartment: false,
      region: "non-metro" as const,
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

const run = () =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 2_000_000_000,
      acquisitionPrice: 300_000_000,
      landTransferPrice: 1_600_000_000,
      buildingTransferPrice: 400_000_000,
      landStandardPriceAtTransfer: 1_600_000_000,
      buildingStandardPriceAtTransfer: 400_000_000,
      landAcquisitionPrice: 200_000_000,
      buildingAcquisitionPrice: 100_000_000,
      acquisitionDate: D("2006-09-01"),
      landAcquisitionDate: D("2000-07-01"),
      transferDate: D("2020-09-01"),
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      buildingFootprintArea: 60,
      acquisitionArea: 660,
      appurtenantLandZone: "non_urban",
      residencePeriodMonths: 60,
      isOneHousehold: true,
      householdHousingCount: 1,
      expenses: 0,
      annualBasicDeductionUsed: 0,
      rentalHousingException: rentalException,
      reductions: [
        {
          type: "rental_97_5",
          registrationDate: D("2006-10-01"),
          rentalStartDate: D("2006-10-01"),
          isTaxRegistered: true,
          taxRegistrationDate: D("2006-10-01"),
          isPurchaseRental: true,
          isNationalHousingScale: true,
          region: "non_capital",
          officialPriceAtStart: 250_000_000,
          rentalContinuesToTransfer: true,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    makeMockRates(),
  ) as unknown as {
    calculatedTax: number;
    taxBase: number;
    taxableGain: number;
    reductionAmount: number;
    rentalHousingExceptionDetail?: { applied: boolean; scenarioId: string };
    splitDetail?: { nonBusinessLandPart?: { excessArea: number } };
    rental97TaxDetail?: { isEligible: boolean; section90?: { reducibleIncome: number; basicDeductionAllocated: number; taxBase: number } };
  };

describe("§155⑳ 거주주택 특례 + 배율 초과 부수토지 — §97의5 B는 주택분만", () => {
  it("게이트 — 특례 적용(RH-A2) · 배율 초과 60㎡ 분리 · §97의5 적격", () => {
    const r = run();
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(r.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
    expect(r.splitDetail?.nonBusinessLandPart?.excessArea).toBe(60);
    expect(r.rental97TaxDetail?.isEligible).toBe(true);
  });

  it("🔴 감면세액 = 산출세액 × 주택분 소득 ÷ 과세표준 — 74,351,818(종전 전액) → 48,405,635", () => {
    const r = run();
    expect(r.calculatedTax).toBe(74_351_818);
    expect(r.taxableGain).toBe(250_636_364); // 주택분 161,545,455 + 배율 초과 토지분 89,090,909
    expect(r.rental97TaxDetail?.section90).toEqual({
      reducibleIncome: 161_545_455,
      basicDeductionAllocated: 0, // 배율 초과 토지분이 기본공제를 흡수 (§103②)
      taxBase: 248_136_364,
    });
    // 74,351,818 × 161,545,455 ÷ 248,136,364 = 48,405,635.x → 절사
    expect(r.reductionAmount).toBe(48_405_635);
    expect(r.reductionAmount, "합계 소득을 B로 쓰면 배율 초과 토지분 세액까지 감면된다").not.toBe(r.calculatedTax);
  });
});
