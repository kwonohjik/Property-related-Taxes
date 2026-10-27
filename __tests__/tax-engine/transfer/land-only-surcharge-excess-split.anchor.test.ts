/**
 * 토지만 본인 주택 — D-1 다른 세대 토지 다주택 중과 배제 · D-2 배율 초과분 비사업용 분리
 * (계획서 `docs/02-design/features/land-only-surcharge-and-excess-split.plan.md` Q-1·Q-2·Q-3 (a)).
 *
 * 기대값은 독립 정수 산식이다(엔진 출력 복사 아님). 모의 세율표는 누진 8구간(「소득세법」 §55①) · 비사업용 +10%p.
 * D-2 시료의 토지 취득일은 2008-01-01이다 — 2009.3.16.~2012.12.31. 취득 토지는 부칙(대통령령 제9270호) §14①로 +10%p가 빠져 결함이 보이지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 10억 주택 = 토지 4억 : 건물 6억 · 토지 취득가액 1억 · 건물 3억 */
function house(over: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 400_000_000,
    landTransferPrice: 400_000_000, buildingTransferPrice: 600_000_000,
    landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2014-09-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: 120, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}
const surchargeNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).includes(LAND_ONLY_OTHER_HOUSEHOLD_SURCHARGE_NOTICE);

describe("D-1 토지만 본인 × 다른 세대 — 다주택 중과 배제(재산세과-3172)", () => {
  // 2021-08-01 양도 · 조정대상지역 · 2014-09-01 취득(보유 6년 → 표1 12%) · 토지 양도차익 3억
  const regulated = { transferDate: D("2021-08-01"), isRegulatedArea: true, isOneHousehold: false } as Partial<TransferTaxInput>;

  it("A-1 다른 세대 · 세대 2주택 — 중과 없이 장특 표1 · 고지", () => {
    const r = calculateTransferTax(house({ ...regulated, householdHousingCount: 2, selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    // 300,000,000 × 12% = 36,000,000 → 264,000,000 − 2,500,000 = 261,500,000 × 38% − 19,940,000 = 79,430,000
    expect([r.longTermHoldingDeduction, r.calculatedTax, r.surchargeType]).toEqual([36_000_000, 79_430_000, undefined]);
    expect(surchargeNotice(r)).toBe(true);
  });

  it("A-2 다른 세대 · 세대 3주택 — 같은 값", () => {
    const r = calculateTransferTax(house({ ...regulated, householdHousingCount: 3, selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    expect([r.longTermHoldingDeduction, r.calculatedTax]).toEqual([36_000_000, 79_430_000]);
  });

  it("A-3 같은 세대 · 세대 2주택 — 종전대로 중과(+20%p · 장특 0) · 고지 없음", () => {
    const r = calculateTransferTax(house({ ...regulated, householdHousingCount: 2, selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    // 297,500,000 × (38% + 20%) − 19,940,000 = 152,610,000
    expect([r.longTermHoldingDeduction, r.calculatedTax, r.surchargeType]).toEqual([0, 152_610_000, "multi_house_2"]);
    expect(surchargeNotice(r)).toBe(false);
  });

  it("고지는 중과가 원래 걸렸을 조합에만 — 비조정 2주택 · 조정 1주택 다른 세대에는 없다", () => {
    const plain = calculateTransferTax(house({ ...regulated, isRegulatedArea: false, householdHousingCount: 2, selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    const one = calculateTransferTax(house({ ...regulated, householdHousingCount: 1, selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    expect([surchargeNotice(plain), surchargeNotice(one)]).toEqual([false, false]);
    expect(plain.calculatedTax).toBe(79_430_000);
  });
});

describe("D-2 토지만 본인 — 배율 초과분 비사업용 분리(서면4팀-2511)", () => {
  // 수도권 주거지역(2022.1.1. 이후 3배) · 정착면적 100㎡ · 토지 2008-01-01 별개 취득(보유 16년 → 표1 30%) · 건물 2014-09-01
  const excess = (landArea: number) =>
    ({
      appurtenantLandZone: "metropolitan_residential", buildingFootprintArea: 100, acquisitionArea: landArea,
      isSeparateAcquisition: true, landAcquisitionDate: D("2008-01-01"),
    }) as Partial<TransferTaxInput>;

  it("A-4 같은 세대 · 1세대1주택 · 초과 50% — 이내분 비과세 · 초과분 1.5억 비사업용 = 소유자 같음과 같은 값", () => {
    const own = calculateTransferTax(house({ ...excess(600), selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    const both = calculateTransferTax(house({ ...excess(600) }), rates);
    // 150,000,000 × 30% = 45,000,000 → 105,000,000 − 2,500,000 = 102,500,000 × 35% − 15,440,000 = 20,435,000 + 10%p 10,250,000 = 30,685,000
    expect([own.isExempt, own.splitDetail?.nonBusinessLandPart?.gain, own.calculatedTax]).toEqual([false, 150_000_000, 30_685_000]);
    expect(both.calculatedTax).toBe(30_685_000);
  });

  it("A-4b 같은 날 취득(별개 취득 아님)도 나눈다 — 소유자 분리는 기준시가 비율로 이미 파트를 만든다", () => {
    const own = calculateTransferTax(house({ ...excess(600), isSeparateAcquisition: false, acquisitionDate: D("2008-01-01"), selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    expect([own.splitDetail?.nonBusinessLandPart?.gain, own.calculatedTax]).toEqual([150_000_000, 30_685_000]);
  });

  it("A-5 다른 세대 · 초과 85% — 이내분 + 초과분 2파트 §104⑤2호", () => {
    const r = calculateTransferTax(house({ ...excess(2000), selfOwns: "land_only", buildingOwnerSameHousehold: false }), rates);
    // 이내분 45,000,000 × 70% = 31,500,000 · 초과분 255,000,000 × 70% = 178,500,000 · 기본공제는 초과분에
    // 초과분 176,000,000 × 38% − 19,940,000 = 46,940,000 + 17,600,000 = 64,540,000 · 이내분 31,500,000 × 15% − 1,260,000 = 3,465,000
    // 2호 68,005,000 > 1호 207,500,000 × 38% − 19,940,000 = 58,910,000
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.calculatedTax]).toEqual([255_000_000, 68_005_000]);
  });

  it("A-6 같은 세대 · 세대 2주택(비조정) · 초과 85% — 같은 값", () => {
    const r = calculateTransferTax(house({ ...excess(2000), householdHousingCount: 2, isOneHousehold: false, selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    expect(r.calculatedTax).toBe(68_005_000);
  });

  it("A-7 같은 세대 · 세대 2주택 · 초과 50% — 1호(합산 누진)가 이겨 종전과 같다", () => {
    const r = calculateTransferTax(house({ ...excess(600), householdHousingCount: 2, isOneHousehold: false, selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    // 2호 = 이내분 105,000,000 → 21,310,000 + 초과분 102,500,000 → 30,685,000 = 51,995,000 < 1호 58,910,000
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.calculatedTax]).toEqual([150_000_000, 58_910_000]);
  });

  it("A-8 건물만 본인 — 초과 토지를 갖지 않는다(비과세 그대로)", () => {
    const r = calculateTransferTax(house({ ...excess(600), selfOwns: "building_only" }), rates);
    expect([r.isExempt, r.splitDetail?.nonBusinessLandPart, r.totalTax]).toEqual([true, undefined, 0]);
  });

  it("V-7 고가주택(20억) · 같은 세대 1세대1주택 — 재산세제과-915: 이내 토지분 안분값 − 초과분 < 0 → 0 · 초과분만 과세", () => {
    const hv = {
      transferPrice: 2_000_000_000, acquisitionPrice: 600_000_000, landTransferPrice: 800_000_000, buildingTransferPrice: 1_200_000_000,
      landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 1_200_000_000, landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 400_000_000,
    } as Partial<TransferTaxInput>;
    const r = calculateTransferTax(house({ ...hv, ...excess(600), selfOwns: "land_only", buildingOwnerSameHousehold: true }), rates);
    // 토지 6억 × (20억 − 12억)/20억 = 2.4억 − 초과분 3억 < 0 → 0 · 초과분 3억 × 70% = 2.1억 − 250만 = 207,500,000
    // × 38% − 19,940,000 = 58,910,000 + 20,750,000 = 79,660,000
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.taxableGain, r.calculatedTax]).toEqual([300_000_000, 300_000_000, 79_660_000]);
  });

  it("V-8 같은 세대 · 조정 2주택(2021-08 · 5배) — 이내분 중과 + 초과분 비사업용 2파트", () => {
    const r = calculateTransferTax(
      house({ ...excess(600), transferDate: D("2021-08-01"), isRegulatedArea: true, householdHousingCount: 2, isOneHousehold: false, selfOwns: "land_only", buildingOwnerSameHousehold: true }),
      rates,
    );
    // 2022.1.1. 전 양도 · 수도권 도시지역 5배 → 한도 500㎡ · 초과 100㎡(1/6) → 초과분 50,000,000 · 이내분 250,000,000(중과 → 장특 0)
    // 기본공제는 한계세율 높은 이내분(58%)에: 247,500,000 × 38% − 19,940,000 = 74,110,000 + 20%p 49,500,000 = 123,610,000
    // 초과분 50,000,000 × 15% − 1,260,000 = 6,240,000 + 5,000,000 = 11,240,000 → 134,850,000 > 1호 93,110,000
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.calculatedTax]).toEqual([50_000_000, 134_850_000]);
  });
});

describe("V-4 §155⑳ 거주주택 특례 × 토지만 같은 세대 × 초과분", () => {
  const rental: NonNullable<TransferTaxInput["rentalHousingException"]> = {
    applyException: true, scenario: "A",
    rentalUnits: [{
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
      isApartment: false, region: "non-metro", isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false,
      rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    }],
  };
  const ex = { appurtenantLandZone: "metropolitan_residential", buildingFootprintArea: 100, acquisitionArea: 600 } as Partial<TransferTaxInput>;

  it("A1(10억) — 주택분 비과세 · 초과분 1.5억(표1 18%)만 과세", () => {
    const r = calculateTransferTax(house({ ...ex, selfOwns: "land_only", buildingOwnerSameHousehold: true, rentalHousingException: rental }), rates);
    // 150,000,000 × 18% = 27,000,000 → 123,000,000 − 2,500,000 = 120,500,000 × 35% − 15,440,000 = 26,735,000 + 12,050,000 = 38,785,000
    expect([r.splitDetail?.nonBusinessLandPart?.gain, r.calculatedTax]).toEqual([150_000_000, 38_785_000]);
  });

  it("A2(20억 고가) — 재산세제과-915 경로에 건물분이 섞이지 않는다(소유자 같음 대조 109,612,000과 다르다)", () => {
    const hv = {
      transferPrice: 2_000_000_000, acquisitionPrice: 600_000_000, landTransferPrice: 800_000_000, buildingTransferPrice: 1_200_000_000,
      landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 1_200_000_000, landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 400_000_000,
    } as Partial<TransferTaxInput>;
    const r = calculateTransferTax(house({ ...hv, ...ex, selfOwns: "land_only", buildingOwnerSameHousehold: true, rentalHousingException: rental }), rates);
    // 토지 6억 안분값 2.4억 − 초과분 3억 < 0 → 주택분 0 · 초과분 3억 × 82%(표1 18%) = 246,000,000 − 2,500,000 = 243,500,000
    // × 38% − 19,940,000 = 72,590,000 + 24,350,000 = 96,940,000
    expect(r.calculatedTax).toBe(96_940_000);
  });
});
