/**
 * 토지만 본인 주택 — 장기보유특별공제 보유기간(기본통칙 95-0…1) · 세율 기산(`max`) · 다른 세대 일반토지 세율
 * (계획서 `docs/02-design/features/land-only-lthd-rate-basis.plan.md` Q-1·Q-2·Q-3 (a)).
 *
 * 근거: 부동산거래관리과-622(2012.11.16.) · 재산세제과-1183(2010.12.10.) — 장특 표2 보유기간은 1세대가 주택의 부수토지로서 보유한 기간,
 * 토지가 주택보다 오래되면 표1(토지 전체)과 표2 중 큰 공제율. 서면법규과-944(2014.8.28.) — 별도 세대 부수토지 소유자의 양도는 일반토지 세율.
 * 기대값은 독립 정수 산식이다(엔진 출력 복사 아님). 모의 세율표 2024 누진 8구간 · 기본공제 2,500,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const SAME = { selfOwns: "land_only", buildingOwnerSameHousehold: true } as Partial<TransferTaxInput>;
const OTHER = { selfOwns: "land_only", buildingOwnerSameHousehold: false } as Partial<TransferTaxInput>;
const RENTAL_A = {
  applyException: true, scenario: "A",
  rentalUnits: [{
    businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general", rentalAcquisitionType: "purchase",
    isApartment: false, region: "non-metro", isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false,
    rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
  }],
} as unknown as TransferTaxInput["rentalHousingException"];

/** 토지 40% · 건물 60% 양도가 · 토지 취득가 1억 · 건물 취득가 3억 · 별개 취득. */
function house(S: number, houseAcq: string, landAcq: string, res: number, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  const landT = Math.floor(S * 0.4);
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 400_000_000,
    landTransferPrice: landT, buildingTransferPrice: S - landT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
    acquisitionDate: D(houseAcq), landAcquisitionDate: D(landAcq), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    residencePeriodMonths: res, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...over,
  } as Partial<TransferTaxInput>);
}
const hv = (landAcq: string, over: Partial<TransferTaxInput>) => house(2_000_000_000, "2014-09-01", landAcq, 120, over);
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const agg = (i: TransferTaxInput) =>
  calculateTransferTaxAggregate(
    { taxYear: 2024, properties: [{ ...i, propertyId: "p1", propertyLabel: "p1" } as unknown as TransferTaxItemInput], annualBasicDeductionUsed: 0 },
    rates,
  );

/*
 * §6.1 — 20억(12억 초과 고가) · 토지 양도차익 7억 → 12억 안분 후 280,000,000 · 주택 2014-09-01(9년) · 거주 10년.
 *   토지 먼저(2008-07, 15년): 통칙 max(표1 30%, 표2 주택 9년 보유 36% + 거주 40% = 76%) = 76% → 280M − 212.8M = 67.2M − 2.5M = 64.7M × 24% − 5.76M = 9,768,000
 *   같은 날(2014-09): 표2 9년 → 76% → 9,768,000
 *   토지 나중(2021-06, 3년): 표2 토지 3년 보유 12% + 거주 40% = 52% → 280M − 145.6M = 134.4M − 2.5M = 131.9M × 35% − 15.44M = 30,725,000
 */
const LTHD_CASES: [string, string, number, number][] = [
  ["토지 먼저 2008-07", "2008-07-01", 0.76, 9_768_000],
  ["같은 날 2014-09", "2014-09-01", 0.76, 9_768_000],
  ["토지 나중 2021-06", "2021-06-01", 0.52, 30_725_000],
];

describe("D-1 장특 — 토지만 본인 × 같은 세대는 소유자 같음과 같은 통칙 95-0…1 (Q-1 a)", () => {
  for (const [label, landAcq, rate, tax] of LTHD_CASES) {
    it(`일반 경로 · ${label}: 토지 공제율 ${rate} · 산출세액 ${tax.toLocaleString()}`, () => {
      const r = calc(hv(landAcq, SAME));
      expect(r.splitDetail!.land.longTermRate).toBeCloseTo(rate, 12);
      expect(r.calculatedTax).toBe(tax);
    });
    it(`§155⑳ 경로 · ${label}: 일반 경로와 같은 산출세액(특례는 주택 수만 의제한다)`, () => {
      const r = calc(hv(landAcq, { ...SAME, rentalHousingException: RENTAL_A }));
      expect(r.calculatedTax).toBe(tax);
    });
  }

  it("토지가 더 오래된 경우 통칙 고지·echo가 달린다(소유자 같음과 같다)", () => {
    const r = calc(hv("2008-07-01", SAME));
    expect(r.splitDetail!.land.appurtenantLthd?.table1Applied).toBe(false);
    expect((r.warnings ?? []).some((w) => w.includes("토지가 주택보다 먼저 취득돼"))).toBe(true);
  });

  it("다른 세대는 표1(토지 자기 연수)로 불변 — 30% · 18% · 6%", () => {
    const expected: [string, number, number][] = [["2008-07-01", 0.3, 169_060_000], ["2014-09-01", 0.18, 204_090_000], ["2021-06-01", 0.06, 239_370_000]];
    for (const [landAcq, rate, tax] of expected) {
      for (const rhe of [undefined, RENTAL_A]) {
        const r = calc(hv(landAcq, { ...OTHER, ...(rhe ? { rentalHousingException: rhe } : {}) }));
        expect(r.splitDetail!.land.longTermRate).toBeCloseTo(rate, 12);
        expect(r.calculatedTax).toBe(tax);
      }
    }
  });
});

/*
 * §6.2 — 10억 · 토지 양도차익 3억 · 거주 9개월 · 2024-06-01 양도 · 기본공제 2,500,000.
 */
describe("D-2·D-3 세율 — 같은 세대는 max(토지, 주택) · 다른 세대는 일반 토지 세율", () => {
  it("C1 같은 세대 · 주택 2023-09 · 토지 2010-01(먼저): 주택 보유 9개월 → 70% — (300M − 표1 14년 28% 84M) − 2.5M = 213.5M × 70% = 149,450,000 (단건 = 소유자 같음)", () => {
    const r = calc(house(1_000_000_000, "2023-09-01", "2010-01-01", 9, SAME));
    expect([r.taxBase, r.appliedRate, r.calculatedTax]).toEqual([213_500_000, 0.7, 149_450_000]);
  });

  it("C5 같은 세대 · 토지 나중(2023-09, 9개월): 토지 기산 70% — 297.5M × 70% = 208,250,000", () => {
    expect(calc(house(1_000_000_000, "2014-09-01", "2023-09-01", 9, SAME)).calculatedTax).toBe(208_250_000);
  });

  it("C2 다른 세대 · 토지 9개월: 일반 토지 1년 미만 50% — 297.5M × 50% = 148,750,000", () => {
    const r = calc(house(1_000_000_000, "2014-09-01", "2023-09-01", 9, OTHER));
    expect([r.appliedRate, r.calculatedTax]).toEqual([0.5, 148_750_000]);
  });

  it("일반 토지 단기세율 고지 — 다른 세대 · 토지 2년 미만에만 달린다(C2·C3 있음 · C4 토지 14년 · 같은 세대 없음)", () => {
    const has = (i: TransferTaxInput) => (calc(i).warnings ?? []).includes(LAND_ONLY_OTHER_HOUSEHOLD_RATE_NOTICE);
    expect(has(house(1_000_000_000, "2014-09-01", "2023-09-01", 9, OTHER))).toBe(true);
    expect(has(house(1_000_000_000, "2014-09-01", "2023-01-01", 9, OTHER))).toBe(true);
    expect(has(house(1_000_000_000, "2023-09-01", "2010-01-01", 9, OTHER))).toBe(false);
    expect(has(house(1_000_000_000, "2014-09-01", "2023-09-01", 9, SAME))).toBe(false);
  });

  it("C3 다른 세대 · 토지 1년 5개월: 일반 토지 1~2년 40% — 297.5M × 40% = 119,000,000", () => {
    const r = calc(house(1_000_000_000, "2014-09-01", "2023-01-01", 9, OTHER));
    expect([r.appliedRate, r.calculatedTax]).toEqual([0.4, 119_000_000]);
  });

  it("C4 다른 세대 · 주택 2023-09 · 토지 2010-01(먼저): 토지 자기 기산 누진 — 213.5M × 38% − 19,940,000 = 61,190,000 · 표시 기산일도 토지 취득일(같은 세대는 주택 취득일)", () => {
    const r = calc(house(1_000_000_000, "2023-09-01", "2010-01-01", 9, OTHER));
    expect([r.appliedRate, r.calculatedTax]).toEqual([0.38, 61_190_000]);
    expect(r.splitDetail!.land.appliedRateBasisDate).toBe("2010-01-01");
    expect(calc(house(1_000_000_000, "2023-09-01", "2010-01-01", 9, SAME)).splitDetail!.land.appliedRateBasisDate).toBe("2023-09-01");
  });

  // 수도권 주거지역(2022.1.1. 이후 3배) · 정착면적 100㎡ → 한도 300㎡ · 토지 600㎡ = 초과 50% → 이내분·초과분 토지 양도차익 각 150,000,000
  const EXCESS = { appurtenantLandZone: "metropolitan_residential", buildingFootprintArea: 100, acquisitionArea: 600 } as Partial<TransferTaxInput>;

  it("C6 다른 세대 · 토지 9개월 · 배율 초과: 이내분·초과분 모두 단기 50%(비사업용 중과 유예기간이라 1호는 누진) — 297.5M × 50% = 148,750,000 · 총 163,625,000", () => {
    const input = house(1_000_000_000, "2014-09-01", "2023-09-01", 9, { ...OTHER, ...EXCESS });
    expect(calc(input).calculatedTax).toBe(148_750_000);
    expect(agg(input).totalTax).toBe(163_625_000);
  });

  it("C7 다른 세대 · 주택 2023-09 · 토지 2010-01(먼저) · 배율 초과: 두 파트 모두 토지 자기 기산(14년 표1 28% → 각 108M) — 213.5M × 38% − 19,940,000 = 61,190,000 · 총 67,309,000", () => {
    const input = house(1_000_000_000, "2023-09-01", "2010-01-01", 9, { ...OTHER, ...EXCESS });
    expect(calc(input).calculatedTax).toBe(61_190_000);
    expect(agg(input).totalTax).toBe(67_309_000);
  });

  it("다건 1건 = 단건(지방소득세 포함 총세액): C1 164,395,000 · C2 163,625,000 · C3 130,900,000 · C4 67,309,000 · C5 229,075,000", () => {
    const cases: [TransferTaxInput, number][] = [
      [house(1_000_000_000, "2023-09-01", "2010-01-01", 9, SAME), 164_395_000],
      [house(1_000_000_000, "2014-09-01", "2023-09-01", 9, OTHER), 163_625_000],
      [house(1_000_000_000, "2014-09-01", "2023-01-01", 9, OTHER), 130_900_000],
      [house(1_000_000_000, "2023-09-01", "2010-01-01", 9, OTHER), 67_309_000],
      [house(1_000_000_000, "2014-09-01", "2023-09-01", 9, SAME), 229_075_000],
    ];
    for (const [input, total] of cases) {
      expect(calc(input).totalTax).toBe(total);
      expect(agg(input).totalTax).toBe(total);
    }
  });
});

describe("다건 1건 = 단건 — 격자(주택 취득일 2 × 토지 취득일 5 × 세대 2 × 양도가 2 × §155⑳ 2 = 80칸)", () => {
  it("지방소득세 포함 총세액이 모든 칸에서 같다", () => {
    const bad: string[] = [];
    let cells = 0;
    for (const houseAcq of ["2014-09-01", "2023-09-01"]) for (const landAcq of ["2010-01-01", "2014-09-01", "2021-06-01", "2023-09-01", "2023-12-01"]) {
      for (const who of [SAME, OTHER]) for (const S of [1_000_000_000, 2_000_000_000]) for (const rhe of [undefined, RENTAL_A]) {
        cells++;
        const input = house(S, houseAcq, landAcq, 120, { ...who, ...(rhe ? { rentalHousingException: rhe } : {}) });
        const single = calc(input).totalTax;
        const multi = agg(input).totalTax;
        if (single !== multi) bad.push(`${houseAcq}/${landAcq}/${who.buildingOwnerSameHousehold ? "same" : "other"}/${S}/${rhe ? "⑳" : "-"}: ${single} ≠ ${multi}`);
      }
    }
    expect(cells).toBe(80);
    expect(bad).toEqual([]);
  });
});
