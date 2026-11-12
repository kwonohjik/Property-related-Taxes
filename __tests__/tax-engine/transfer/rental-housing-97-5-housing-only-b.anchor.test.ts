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
 *
 * 2026-11-12 — §97의5 취득 하한(법률 제12853호 부칙 §34 — 2015.1.1. 이후 취득)에 맞춰 자산 날짜를 전부 +9년 옮겼다
 *   (취득 2015-09-01 · 토지 2009-07-01 · 양도 2029-09-01, 보유기간은 그대로). 종전 시료는 2006년 취득이라 §97의5 대상이 아니었다.
 *   양도 시점이 바뀌어 1세대1주택 고가주택·장기보유특별공제 구간이 달라져 주택분 소득·세액이 바뀌었다. 배율 초과 토지분(89,090,909)은 그대로다.
 *   새 기대값은 엔진 출력이며 아래 산식으로 검산했다: 과세대상 = 주택분 221,090,910 + 토지분 89,090,909 · 감면 = ⌊97,132,727 × 221,090,910 ÷ 307,681,819⌋.
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
      acquisitionDate: D("2015-09-01"),
      landAcquisitionDate: D("2009-07-01"),
      transferDate: D("2029-09-01"),
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
          registrationDate: D("2015-10-01"),
          rentalStartDate: D("2015-10-01"),
          isTaxRegistered: true,
          taxRegistrationDate: D("2015-10-01"),
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

  it("🔴 감면세액 = 산출세액 × 주택분 소득 ÷ 과세표준 — 97,132,727(종전 전액) → 69,796,659", () => {
    const r = run();
    expect(r.calculatedTax).toBe(97_132_727);
    expect(r.taxableGain).toBe(310_181_819); // 주택분 221,090,910 + 배율 초과 토지분 89,090,909
    expect(r.rental97TaxDetail?.section90).toEqual({
      reducibleIncome: 221_090_910,
      basicDeductionAllocated: 0, // 배율 초과 토지분이 기본공제를 흡수 (§103②)
      taxBase: 307_681_819,
    });
    // 97,132,727 × 221,090,910 ÷ 307,681,819 = 69,796,659.x → 절사
    expect(r.reductionAmount).toBe(69_796_659);
    expect(r.reductionAmount, "합계 소득을 B로 쓰면 배율 초과 토지분 세액까지 감면된다").not.toBe(r.calculatedTax);
  });
});
