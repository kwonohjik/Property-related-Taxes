/**
 * V-3′ 엔진 anchor — 토지만 본인 × 건물(주택) 소유자 다른 세대(`buildingOwnerSameHousehold: false`)면
 * 1세대1주택 비과세(고가주택 12억 안분)와 장기보유특별공제 표2를 적용하지 않는다(`land-only-owner-household.ts`).
 *
 * 시료: 20억 고가주택(토지 8억 : 건물 12억) · 토지 취득가액 2억 · 2014-09-01 취득 → 2024-06-01 양도(보유 9년) · 거주 120개월.
 * 기대값은 독립 정수 산식이다(엔진 출력 복사 아님).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { LAND_ONLY_OTHER_HOUSEHOLD_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function house(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 2_000_000_000, acquisitionPrice: 600_000_000,
    landTransferPrice: 800_000_000, buildingTransferPrice: 1_200_000_000,
    landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 1_200_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 400_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2014-09-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: 120, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}
const hasNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).includes(LAND_ONLY_OTHER_HOUSEHOLD_NOTICE);

describe("토지만 본인 × 고가주택 — 건물(주택) 소유자 세대", () => {
  it("같은 세대(true) = 미응답(undefined, 엔진 직접 호출) — 12억 안분 · 표2 76%(보유 9년 36% + 거주 10년 40%)", () => {
    for (const v of [true, undefined]) {
      const r = calculateTransferTax(house({ selfOwns: "land_only", buildingOwnerSameHousehold: v }), rates);
      // 토지 양도차익 6억 × (20억 − 12억) / 20억 = 240,000,000 · × 76% = 182,400,000
      expect([r.isExempt, r.transferGain, r.longTermHoldingDeduction, r.splitDetail?.land.longTermRate]).toEqual([false, 600_000_000, 182_400_000, 0.76]);
      expect(hasNotice(r)).toBe(false);
    }
  });

  it("다른 세대(false) — 안분 없이 6억 전액 · 표1 18%(9년) · 고지", () => {
    const r = calculateTransferTax(house({ selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    // 600,000,000 × 18% = 108,000,000 → 492,000,000 − 2,500,000 = 489,500,000
    // 94,060,000 + (489,500,000 − 300,000,000) × 40% = 169,860,000 · 지방소득세 16,986,000 → 186,846,000
    expect([r.isExempt, r.longTermHoldingDeduction, r.splitDetail?.land.longTermRate, r.calculatedTax, r.totalTax]).toEqual([
      false, 108_000_000, 0.18, 169_860_000, 186_846_000,
    ]);
    expect(hasNotice(r)).toBe(true);
  });

  it("건물만 본인 — 남은 false를 보지 않는다(주택 자체의 소유자)", () => {
    const a = calculateTransferTax(house({ selfOwns: "building_only" }), rates);
    const b = calculateTransferTax(house({ selfOwns: "building_only", buildingOwnerSameHousehold: false }), rates);
    expect(b.totalTax).toBe(a.totalTax);
    expect(hasNotice(b)).toBe(false);
  });

  it("§155⑳ 거주주택 특례를 선언해도 다른 세대면 특례 없이 일반 과세 — 특례 없는 다른 세대와 같은 186,846,000 · 고지(리뷰 게이트 F-1 · 수정 전 8,210,400)", () => {
    const rental: NonNullable<TransferTaxInput["rentalHousingException"]> = {
      applyException: true, scenario: "A",
      rentalUnits: [{
        businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
        isApartment: false, region: "non-metro", isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false,
        rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
      }],
    };
    const same = calculateTransferTax(house({ selfOwns: "land_only", buildingOwnerSameHousehold: true, rentalHousingException: rental }), rates);
    const other = calculateTransferTax(house({ selfOwns: "land_only", buildingOwnerSameHousehold: false, rentalHousingException: rental }), rates);
    expect(same.totalTax).toBe(8_210_400);
    expect([other.isExempt, other.longTermHoldingDeduction, other.totalTax]).toEqual([false, 108_000_000, 186_846_000]);
    expect(hasNotice(other)).toBe(true);
    // 판정이 과세(세대 3주택)여도 특례를 선언했으면 건너뛰는 이유를 고지한다 · 선언이 없으면 고지하지 않는다(거둘 비과세가 없다)
    const taxedRental = calculateTransferTax(house({ selfOwns: "land_only", buildingOwnerSameHousehold: false, householdHousingCount: 3, rentalHousingException: rental }), rates);
    const taxedPlain = calculateTransferTax(house({ selfOwns: "land_only", buildingOwnerSameHousehold: false, householdHousingCount: 3 }), rates);
    expect([taxedRental.isExempt, hasNotice(taxedRental), hasNotice(taxedPlain)]).toEqual([false, true, false]);
  });

  it("12억 이하 전액 비과세도 거둔다 — 다른 세대면 과세", () => {
    const small = { transferPrice: 1_000_000_000, landTransferPrice: 400_000_000, buildingTransferPrice: 600_000_000, landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 600_000_000 };
    const same = calculateTransferTax(house({ ...small, selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    const other = calculateTransferTax(house({ ...small, selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    expect([same.isExempt, same.totalTax]).toEqual([true, 0]);
    // 토지 4억 − 2억 = 2억 · 표1 18% 36,000,000 → 164,000,000 − 2,500,000 = 161,500,000
    // 37,060,000 + 11,500,000 × 38% = 41,430,000
    expect([other.isExempt, other.calculatedTax]).toEqual([false, 41_430_000]);
  });
});
