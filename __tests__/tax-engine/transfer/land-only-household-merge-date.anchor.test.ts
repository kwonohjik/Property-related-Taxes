/**
 * 토지만 본인 × 같은 세대 — 세대합가일 입력(계획서 `docs/02-design/features/land-only-household-merge-date.plan.md` Q-1 b · Q-2 a).
 *
 * 합가일 이후만 그 토지를 「주택부수토지로서 보유」한 기간으로 본다(재산46014-610 · 부동산거래관리과-515·764·622): 비과세 보유요건(영 §154①) ·
 * 장특 표2 보유연수(기본통칙 95-0…1) · 단기세율 보유기간(Q-2 a — 유추). 유효 기산일 = max(토지 취득일, 주택 취득일, 합가일).
 *
 * 기대값은 독립 정수 산식이다(엔진 출력 복사 아님). 모의 세율표 2024 누진 8구간 · 기본공제 2,500,000 · 거주 120개월 · 양도 2024-06-01.
 * 10억 시료 = 토지 4억(취득 1억) : 건물 6억(취득 3억), 주택 2014-09-01. 20억 시료 = 토지 8억(취득 1억) : 건물 12억(취득 3억).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const RENTAL_A = {
  applyException: true, scenario: "A",
  rentalUnits: [{
    businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
    isApartment: false, region: "non-metro", isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false,
    rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
  }],
} as unknown as TransferTaxInput["rentalHousingException"];

function house(S: number, landAcq: string, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const landT = Math.floor(S * (S === 2_000_000_000 ? 0.4 : 0.4));
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 400_000_000,
    landTransferPrice: landT, buildingTransferPrice: S - landT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D(landAcq), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: 120, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    selfOwns: "land_only", buildingOwnerSameHousehold: true,
    ...over,
  } as Partial<TransferTaxInput>);
}
const merged = (date: string, extra: Partial<TransferTaxInput> = {}): Partial<TransferTaxInput> =>
  ({ buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: D(date), ...extra });
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const warn = (r: { warnings?: string[] }, needle: string) => (r.warnings ?? []).some((w) => w.includes(needle));

describe("비과세 보유요건 — 토지가 15년 됐어도 합가가 양도 2년 미만이면 토지분은 비과세에서 빠진다(재산46014-610)", () => {
  it("M1 합가 6개월 전(2023-12-01): 토지 300,000,000 전액 과세 · 장특 표1 토지 15년 30% 90,000,000 · 합가 6개월 → 단기 70%: (210,000,000 − 2,500,000) × 70% = 145,250,000", () => {
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2023-12-01")));
    expect([r.isExempt, r.taxableGain, r.longTermHoldingDeduction, r.appliedRate, r.calculatedTax]).toEqual([false, 300_000_000, 90_000_000, 0.7, 145_250_000]);
  });

  it("M5 합가 1년 5개월 전(2023-01-01): 같은 제외 · 1~2년 구간 60%: 207,500,000 × 60% = 124,500,000", () => {
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2023-01-01")));
    expect([r.isExempt, r.appliedRate, r.calculatedTax]).toEqual([false, 0.6, 124_500_000]);
  });

  it("M6 경계 — 합가 24개월(2022-06-01)이면 보유요건 충족·비과세 0 · 23개월(2022-07-01)이면 제외 · 60% 124,500,000", () => {
    expect(calc(house(1_000_000_000, "2008-07-01", merged("2022-06-01"))).calculatedTax).toBe(0);
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2022-07-01")));
    expect([r.isExempt, r.calculatedTax]).toEqual([false, 124_500_000]);
  });

  it("M3 20억 고가 · 합가 6개월 전: 12억 안분 없이 토지 700,000,000 전액 — 장특 30% 210,000,000 · (490,000,000 − 2,500,000) × 70% = 341,250,000", () => {
    const r = calc(house(2_000_000_000, "2008-07-01", merged("2023-12-01")));
    expect([r.taxableGain, r.longTermHoldingDeduction, r.calculatedTax]).toEqual([700_000_000, 210_000_000, 341_250_000]);
  });

  it("합가일이 토지·주택 취득일보다 이르면 영향이 없다 — 비과세 0 (M7)", () => {
    expect(calc(house(1_000_000_000, "2008-07-01", merged("2005-01-01"))).calculatedTax).toBe(0);
  });

  it("합가 안 함(false) · 미응답(엔진 직접 호출)은 종전 — 비과세 0 · 미응답만 합가일 확인 고지", () => {
    const no = calc(house(1_000_000_000, "2008-07-01", { buildingOwnerHouseholdMerged: false, buildingOwnerHouseholdMergeDate: D("2023-12-01") }));
    expect([no.isExempt, no.calculatedTax]).toEqual([true, 0]);
    expect(no.warnings ?? []).not.toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
    const unanswered = calc(house(1_000_000_000, "2008-07-01"));
    expect(unanswered.calculatedTax).toBe(0);
    expect(unanswered.warnings).toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
  });

  it("§155⑳ 거주주택 특례 on = off — 같은 사실에서 같은 세액(M1 145,250,000)", () => {
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2023-12-01", { rentalHousingException: RENTAL_A })));
    expect(r.calculatedTax).toBe(145_250_000);
  });
});

describe("장특 표2 보유연수 — 「주택 부수토지로서의 보유기간」은 합가일부터(부동산거래관리과-622 · 통칙 95-0…1)", () => {
  /*
   * 20억 · 토지 2008-07(15년) · 합가 2021-06-01(3년): 합가 후 3년 ≥ 2년이라 비과세 제외 없음. 토지분 12억 안분 후 700,000,000 × 8/20 = 280,000,000.
   * 표2 후보 = 합가일부터 3년: 보유 3 × 4% = 12% + 거주 10년 → 40% = 52%. 표1 후보 = 토지 전체 15년 30%. max = 52%
   *   → 280,000,000 − 145,600,000 = 134,400,000 − 2,500,000 = 131,900,000 × 35% − 15,440,000 = 30,725,000.
   * (합가일 없이는 주택 9년 보유 36% + 거주 40% = 76% → 9,768,000)
   */
  it("M4 일반 경로: 표2 52% · 30,725,000 (합가 없음 9,768,000)", () => {
    const base = calc(house(2_000_000_000, "2008-07-01"));
    expect(base.calculatedTax).toBe(9_768_000);
    const r = calc(house(2_000_000_000, "2008-07-01", merged("2021-06-01")));
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.52, 12);
    expect(r.calculatedTax).toBe(30_725_000);
  });

  it("M4 §155⑳ 경로도 같다 — 30,725,000", () => {
    const r = calc(house(2_000_000_000, "2008-07-01", merged("2021-06-01", { rentalHousingException: RENTAL_A })));
    expect(r.calculatedTax).toBe(30_725_000);
  });
});

describe("세율 기산 · 고지 · 다건", () => {
  it("합가일 반영 고지 — 합가일이 취득일보다 늦어 계산이 달라졌을 때만, 합가일 확인 고지는 달지 않는다", () => {
    const r = calc(house(1_000_000_000, "2008-07-01", merged("2023-12-01")));
    expect(warn(r, "입력하신 세대 합가일(2023-12-01)")).toBe(true);
    expect(r.warnings ?? []).not.toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
    expect(warn(calc(house(1_000_000_000, "2008-07-01", merged("2005-01-01"))), "입력하신 세대 합가일")).toBe(false);
  });

  it("표시 기산일(`appliedRateBasisDate`) — 합가일이 가장 늦으면 합가일, 합가일이 이르면 종전(max(토지, 주택) = 주택 2014-09-01)", () => {
    expect(calc(house(1_000_000_000, "2008-07-01", merged("2023-12-01"))).splitDetail!.land.appliedRateBasisDate).toBe("2023-12-01");
    expect(calc(house(1_000_000_000, "2008-07-01", merged("2005-01-01"))).splitDetail!.land.appliedRateBasisDate).toBe("2014-09-01");
  });

  it("다건 1건 = 단건 — 합가일 격자(합가일 6 × 토지 3 × 양도가 2 × ⑳ 2 = 72칸)", () => {
    const bad: string[] = [];
    let cells = 0;
    for (const m of ["2005-01-01", "2014-10-01", "2021-06-01", "2022-07-01", "2023-01-01", "2023-12-01"]) for (const land of ["2008-07-01", "2014-09-01", "2021-06-01"]) {
      for (const S of [1_000_000_000, 2_000_000_000]) for (const rhe of [undefined, RENTAL_A]) {
        cells++;
        const input = house(S, land, merged(m, rhe ? { rentalHousingException: rhe } : {}));
        const single = calc(input).totalTax;
        const multi = calculateTransferTaxAggregate(
          { taxYear: 2024, properties: [{ ...input, propertyId: "p1", propertyLabel: "p1" } as unknown as TransferTaxItemInput], annualBasicDeductionUsed: 0 },
          rates,
        ).totalTax;
        if (single !== multi) bad.push(`${m}/${land}/${S}/${rhe ? "⑳" : "-"}: ${single} ≠ ${multi}`);
      }
    }
    expect(cells).toBe(72);
    expect(bad).toEqual([]);
  });
});
