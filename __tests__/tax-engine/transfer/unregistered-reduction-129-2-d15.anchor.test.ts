/**
 * D15 — 미등기양도자산 감면 배제(조세특례제한법 §129②) anchor.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §2 · §7.
 *
 * 조특법 §129②: 「「소득세법」 제104조제3항에 따른 미등기양도자산에 대해서는 양도소득세의
 * 비과세 및 감면에 관한 규정을 적용하지 아니한다.」 (KoreanLaw MST 284389)
 *
 * 감면은 두 트랙이다 — 세액감면형(`calcReductions`, 호출부 5곳)과 차감형(STEP 4.6
 * `resolveIncomeDeduction`, 호출부 2곳). 경로마다 「미등기 + 감면 = 미등기 + 감면 없음」
 * 동등성과, 등기 긍정 짝(감면이 실제로 붙는 입력임)을 함께 고정한다.
 *
 * 세율은 mock(makeMockRates). 금액은 probe 실측.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  calcReductions,
  unregisteredReductionNotice,
} from "@/lib/tax-engine/transfer-tax-reductions-calc";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const NOTICE = "조특법 §129②";

type Over = Record<string, unknown>;
const calc = (o: Over) => calculateTransferTax(baseTransferInput(o as Partial<TransferTaxInput>), rates);
const notices = (r: { warnings?: string[] }) => (r.warnings ?? []).filter((w) => w.includes(NOTICE));

const E77 = {
  type: "public_expropriation",
  cashCompensation: 600_000_000,
  bondCompensation: 0,
  businessApprovalDate: D("2013-01-01"),
};
const G773 = {
  type: "gb_designated_land",
  branch: "purchase",
  designationDate: D("2005-01-01"),
  triggerDate: D("2024-01-01"),
  residedFromAcqToTrigger: true,
};
const N99 = {
  type: "new_99",
  contractDate99: D("1999-02-01"),
  standardPriceAtAcquisition99: 100_000_000,
  standardPriceAt5Years99: 150_000_000,
  standardPriceAtTransfer99: 300_000_000,
  exclusiveAreaSqm99: 84,
  isResident99: true,
  isHousingConstructionBusiness99: false,
  acquisitionType99: "from_builder",
};

/** 토지 6억/2억 · 2010→2024-06-01 */
const land = (o: Over): Over => ({
  propertyType: "land",
  isOneHousehold: false,
  householdHousingCount: 0,
  transferPrice: 600_000_000,
  acquisitionPrice: 200_000_000,
  acquisitionDate: D("2010-01-01"),
  transferDate: D("2024-06-01"),
  ...o,
});

describe("D15 세액감면형 — 단건 finalize 경로", () => {
  it("D15-A1 §77 공익수용: 미등기면 감면 0 · 감면 없음과 같은 세액 · §129② 안내 / 등기(긍정 짝)는 감면 유지", () => {
    const u = calc(land({ isUnregistered: true, reductions: [E77] }));
    const uNone = calc(land({ isUnregistered: true, reductions: [] }));
    expect(u.reductionAmount).toBe(0);
    expect(u.totalTax).toBe(308_000_000);
    expect(u.totalTax).toBe(uNone.totalTax);
    expect(notices(u)).toHaveLength(1);
    expect(notices(uNone)).toHaveLength(0);

    const reg = calc(land({ isUnregistered: false, reductions: [E77] }));
    expect(reg.reductionAmount).toBe(8_855_000);
    expect(reg.totalTax).toBe(89_435_500);
    expect(notices(reg)).toHaveLength(0);
  });

  it("D15-A2 §77의3 개발제한구역: 미등기면 감면 0 / 등기(긍정 짝) 34,204,000", () => {
    const u = calc(land({ isUnregistered: true, acquisitionDate: D("2000-01-01"), reductions: [G773] }));
    const uNone = calc(land({ isUnregistered: true, acquisitionDate: D("2000-01-01"), reductions: [] }));
    expect(u.reductionAmount).toBe(0);
    expect(u.totalTax).toBe(uNone.totalTax);
    const reg = calc(land({ isUnregistered: false, acquisitionDate: D("2000-01-01"), reductions: [G773] }));
    expect(reg.reductionAmount).toBe(34_204_000);
  });
});

describe("D15 차감형 — STEP 4.6 (resolveIncomeDeduction)", () => {
  const h = (u: boolean, reductions: unknown[]) =>
    calc({
      transferPrice: 800_000_000,
      transferDate: D("2010-06-30"),
      acquisitionPrice: 200_000_000,
      acquisitionDate: D("1999-03-01"),
      isOneHousehold: false,
      householdHousingCount: 2,
      isUnregistered: u,
      reductions,
    });

  it("D15-A3 §99 신축주택(소득금액 차감): 미등기면 차감 없음 — 감면 없음과 같은 세액 / 등기(긍정 짝)는 차감돼 세액이 낮다", () => {
    const u = h(true, [N99]);
    expect(u.totalTax).toBe(462_000_000);
    expect(u.totalTax).toBe(h(true, []).totalTax);
    expect(notices(u)).toHaveLength(1);

    const reg = h(false, [N99]);
    expect(reg.totalTax).toBe(134_166_000);
    expect(h(false, []).totalTax).toBe(176_286_000);
  });
});

describe("D15 조기반환·분기 경로", () => {
  it("D15-A4 다필지(§166): 미등기면 감면 0 · 안내가 조기반환 결과에도 실린다 / 등기 16,506,000", () => {
    const P = [1, 2].map((i) => ({
      id: `p${i}`,
      transferArea: 500,
      acquisitionArea: 500,
      acquisitionDate: D("2010-01-01"),
      acquisitionMethod: "actual",
      acquisitionPrice: 200_000_000,
      expenses: 0,
    }));
    const mp = (u: boolean, reductions: unknown[]) =>
      calc({
        propertyType: "land",
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: D("2010-01-01"),
        transferDate: D("2020-06-01"),
        useEstimatedAcquisition: false,
        parcels: P,
        isUnregistered: u,
        reductions,
      });
    const E = { ...E77, cashCompensation: 1_000_000_000, businessApprovalDate: D("2018-01-01") };
    const u = mp(true, [E]);
    expect(u.reductionAmount).toBe(0);
    expect(u.totalTax).toBe(mp(true, []).totalTax);
    expect(notices(u)).toHaveLength(1);
    expect(mp(false, [E]).reductionAmount).toBe(16_506_000);
  });

  it("D15-A5 재개발(§166): 미등기면 감면 0 / 등기 8,375,491", () => {
    const rd = (u: boolean, reductions: unknown[]) =>
      calc({
        propertyType: "redevelopment_apt",
        transferPrice: 525_000_000,
        transferDate: D("2026-02-16T00:00:00"),
        acquisitionDate: D("2005-04-09T00:00:00"),
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: true,
        isOneHousehold: false,
        residencePeriodMonths: 0,
        standardPriceAtAcquisition: 200_000_000,
        standardPriceAtTransfer: 400_000_000,
        redevelopment: case44RedevelopmentInfo(),
        isUnregistered: u,
        reductions,
      });
    const E = { ...E77, cashCompensation: 525_000_000, businessApprovalDate: D("2020-01-01") };
    const u = rd(true, [E]);
    expect(u.reductionAmount).toBe(0);
    expect(u.totalTax).toBe(rd(true, []).totalTax);
    expect(notices(u)).toHaveLength(1);
    expect(rd(false, [E]).reductionAmount).toBe(8_375_491);

    // 차감형(§99의3) — 재개발 분기의 Step C.5는 STEP 4.6과 별도 호출부다.
    const R993 = {
      type: "new_99_3",
      contractDate993: "2002-01-01",
      standardPriceAtAcquisition993: 100_000_000,
      standardPriceAt5Years: 160_000_000,
      standardPriceAtTransfer993: 250_000_000,
      region993: "outside_speculation",
      acquisitionType993: "from_builder",
    };
    const u993 = rd(true, [R993]);
    expect(u993.totalTax).toBe(rd(true, []).totalTax);
    expect(notices(u993)).toHaveLength(1);
    expect(rd(false, [R993]).calculatedTax).toBe(26_086_550);
    expect(rd(false, []).calculatedTax).toBe(55_836_614);
  });

  // F-8(2026-09-19): 미등기면 §155⑳ 특례 자체가 적용 불가(§91①)라 일반 경로로 계산된다 —
  //   감면 0·안내 1줄은 그 경로의 게이트가 낸다. 등기 긍정 짝은 특례 경로의 감면이다.
  it("D15-A6 §155⑳ 입력: 미등기면 감면 0 · 안내 1줄 / 등기(특례 경로) 364,500", () => {
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
    const rh = (u: boolean, reductions: unknown[]) =>
      calc({
        propertyType: "housing",
        transferPrice: 1_500_000_000,
        acquisitionPrice: 1_100_000_000,
        acquisitionDate: D("2014-06-01"),
        transferDate: D("2024-06-01"),
        residencePeriodMonths: 60,
        isOneHousehold: true,
        householdHousingCount: 1,
        expenses: 0,
        rentalHousingException,
        isUnregistered: u,
        reductions,
      });
    const E = { ...E77, cashCompensation: 1_500_000_000, businessApprovalDate: D("2020-01-01") };
    const u = rh(true, [E]);
    expect(u.reductionAmount).toBe(0);
    expect(u.totalTax).toBe(rh(true, []).totalTax);
    expect(notices(u)).toHaveLength(1);
    expect(rh(false, [E]).reductionAmount).toBe(364_500);
  });
});

describe("D15 다건 집계 — 게이트는 카드(자산) 단위", () => {
  const card = (id: string, u: boolean, reductions: unknown[]) => ({
    ...baseTransferInput(
      land({ transferPrice: 500_000_000, acquisitionPrice: 150_000_000, isUnregistered: u, reductions }) as Partial<TransferTaxInput>,
    ),
    propertyId: id,
    propertyLabel: id,
  });
  const agg = (a: object, b: object) =>
    calculateTransferTaxAggregate(
      { taxYear: 2024, annualBasicDeductionUsed: 0, properties: [a, b] } as never,
      rates,
    ) as unknown as {
      totalTax: number;
      warnings?: string[];
      properties: { propertyId: string; reductionAmount: number }[];
    };
  const cardReduction = (r: ReturnType<typeof agg>, id: string) =>
    r.properties.find((p) => p.propertyId === id)?.reductionAmount;

  it("D15-A7 토지 카드만 미등기: 그 카드 감면만 0 · 다른 카드는 유지 · 안내에 카드 라벨 / 둘 다 등기(긍정 짝)", () => {
    const mixed = agg(card("L", true, [E77]), card("B", false, [E77]));
    expect(cardReduction(mixed, "L")).toBe(0);
    expect(cardReduction(mixed, "B")).toBe(7_582_000);
    expect(mixed.totalTax).toBe(agg(card("L", true, []), card("B", false, [E77])).totalTax);
    expect(notices(mixed)).toEqual([expect.stringMatching(/^\[L\] /)]);

    const reg = agg(card("L", false, [E77]), card("B", false, [E77]));
    expect(cardReduction(reg, "L")).toBe(7_582_000);
  });
});

describe("D15 leaf — calcReductions · unregisteredReductionNotice", () => {
  it("D15-A8 calcReductions: 미등기 인자면 후보·레거시 인자와 무관하게 0", () => {
    const args = [50_000_000, [E77] as never, undefined, undefined, undefined, undefined, undefined, D("2024-06-01"), 400_000_000, 2_500_000, 397_500_000] as const;
    expect(calcReductions(...args).reductionAmount).toBeGreaterThan(0);
    expect(
      calcReductions(...args, undefined, undefined, undefined, undefined, true).reductionAmount,
    ).toBe(0);
  });

  it("D15-A9 안내: 미등기 + 감면(현행·레거시 인자 포함)일 때만", () => {
    expect(unregisteredReductionNotice({ isUnregistered: true, reductions: [E77] })).toContain(NOTICE);
    expect(unregisteredReductionNotice({ isUnregistered: true, newHousingDetails: {} })).toContain(NOTICE);
    expect(unregisteredReductionNotice({ isUnregistered: true, rentalReductionDetails: {} })).toContain(NOTICE);
    expect(unregisteredReductionNotice({ isUnregistered: true, reductions: [] })).toBeUndefined();
    expect(unregisteredReductionNotice({ isUnregistered: false, reductions: [E77] })).toBeUndefined();
  });
});
