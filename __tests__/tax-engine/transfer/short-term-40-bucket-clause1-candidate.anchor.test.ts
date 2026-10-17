/**
 * anchor: 다건 합산 — 1~2년 비주택(40%, §104①2호) 단위는 **승패와 무관하게** 1호를 「해당 호」로 싣고
 * 같은 버킷(`104-1-1+104-1-2|0.4`)에서 합산한다 (Q-F1 α, 2026-10-16).
 *
 * [결함] 1호는 개별 과세표준에서 **이길 때만** 후보에 실렸다(2026-08-11 「승자 기준」). 40% 단위가
 *   과세표준 1,318,800,000(0.4x = 0.45x − 65,940,000)을 넘는 순간 버킷이 `104-1-2|0.4`에서
 *   `104-1-1+104-1-2`로 옮겨, 경계 아래 40% 단위와의 §104⑤2호 단서 합산이 1원 차이로 꺼졌다.
 *   차익이 1원 늘었는데 총세액이 16,499,999 줄어드는 절벽이 있었다. split 자산의 두 파트뿐 아니라
 *   1~2년 비주택 자산 두 건을 함께 신고해도 같았다.
 *
 * [수정] `compareWithClause1`을 부르는 모든 경로가 1호를 늘 후보에 싣고 단일세율(`bucketFlatRate`)을
 *   버킷 키에 남긴다 — 세율을 남기므로 60% 주택 단기와는 계속 분리된다.
 *   계획서 `docs/02-design/features/transfer-104-5-split-nonhouse-followups.plan.md` §1.
 *
 * 기대값은 독립 산식(`prog`)으로 도출한다. 모의 세율표는 누진 8구간(소득세법 §55①) · 비사업용 토지 +10%p ·
 * 단기 1~2년 40%(§104①2호)·주택 1~2년 60%.
 */
import { describe, it, expect } from "vitest";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";

/** 소득세법 §55① 누진세율 (과세표준 → 산출세액). */
function prog(base: number): number {
  const t: [number, number, number][] = [
    [14_000_000, 0.06, 0], [50_000_000, 0.15, 1_260_000], [88_000_000, 0.24, 5_760_000], [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000], [500_000_000, 0.4, 25_940_000], [1_000_000_000, 0.42, 35_940_000], [Infinity, 0.45, 65_940_000],
  ];
  const [, r, d] = t.find(([ub]) => base <= ub)!;
  return Math.floor(base * r) - d;
}
const nblTax = (base: number) => prog(base) + Math.floor(base * 0.1);
const withLocal = (calc: number) => calc + Math.floor(calc * 0.1);

const asset = (kind: "land" | "building", sale: number, acq: number, on: string) =>
  baseTransferInput({
    propertyType: kind, transferPrice: sale, acquisitionPrice: acq, acquisitionDate: D(on), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: kind === "land" ? 0 : 1, ...(kind === "land" ? { isNonBusinessLand: false } : {}),
    expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 비주택 토지·건물 분리취득 — 토지 1년 8개월(차익 g) · 건물 1년 3개월(차익 300,000,000). */
const split = (g: number) =>
  baseTransferInput({
    propertyType: "building", transferPrice: 800_000_000 + g, transferDate: D(T),
    acquisitionPrice: 500_000_000, acquisitionDate: D("2021-12-20"), landAcquisitionDate: D("2021-07-20"),
    isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 200_000_000 + g, buildingTransferPrice: 600_000_000,
    landStandardPriceAtTransfer: 200_000_000 + g, buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 같은 자산을 토지 자산 + 건물 자산 두 건으로 신고. */
const separated = (g: number) => [
  asset("land", 200_000_000 + g, 200_000_000, "2021-07-20"),
  asset("building", 600_000_000, 300_000_000, "2021-12-20"),
];
/** 짝 — 비사업용 토지 12억/3억(6년 1개월 · 장특 12% → 소득 792,000,000). */
const N900 = () =>
  baseTransferInput({
    propertyType: "land", transferPrice: 1_200_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"),
    transferDate: D(T), isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: true, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 짝 — 1년 2개월 보유 주택(2주택 세대 · 60%) 12억/7억. */
const shortHouse = () =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_200_000_000, acquisitionPrice: 700_000_000, acquisitionDate: D("2022-01-20"),
    transferDate: D(T), isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const total = (items: TransferTaxInput[]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2023, properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: 0 },
    rates,
  ).totalTax;
const bothOrders = (items: TransferTaxInput[]) => [total(items), total([...items].reverse())];

describe("F1-1 대표 셀 — 토지 파트가 경계를 넘어도 총세액이 1원씩 연속", () => {
  // 40% 버킷 = 토지 g + 건물 300,000,000 (경계 위·아래 모두 한 버킷) · 짝 비사업용 토지 792,000,000 − 기본공제 2,500,000
  //   ⑤2호 = prog(g + 300,000,000) + nblTax(789,500,000) 374,600,000 > ⑤1호 prog(g + 300,000,000 + 789,500,000)
  const expected = (g: number) => withLocal(prog(g + 300_000_000) + nblTax(789_500_000));

  it("g = 1,318,800,011 → 1,140,832,004 · g + 1 → 1,140,832,005 (종전 1,124,332,005 — 1원에 −16,499,999)", () => {
    expect(nblTax(789_500_000)).toBe(374_600_000);
    expect(prog(1_618_800_011)).toBe(662_520_004);
    expect(prog(1_618_800_011) + 374_600_000).toBeGreaterThan(prog(1_618_800_011 + 789_500_000));
    expect([expected(1_318_800_011), expected(1_318_800_012)]).toEqual([1_140_832_004, 1_140_832_005]);
    expect(bothOrders([split(1_318_800_011), N900()])).toEqual([1_140_832_004, 1_140_832_004]);
    expect(bothOrders([split(1_318_800_012), N900()])).toEqual([1_140_832_005, 1_140_832_005]);
  });

  it("토지 자산 + 건물 자산으로 따로 신고해도 같은 값", () => {
    expect(total([...separated(1_318_800_011), N900()])).toBe(1_140_832_004);
    expect(total([...separated(1_318_800_012), N900()])).toBe(1_140_832_005);
  });
});

describe("F1-2 경계 위 40% + 경계 아래 40% — 합산 버킷 (상승 최대 72,534,000)", () => {
  it("토지 1,318,800,000(40% 승) + 건물 1,319,800,000(1호 승) + 1~2년 주택 짝 → 1,561,923,000", () => {
    const items = [
      asset("land", 1_518_800_000, 200_000_000, "2021-09-20"),
      asset("building", 1_619_800_000, 300_000_000, "2021-09-20"),
      shortHouse(),
    ];
    // 40% 버킷 합산 prog(2,638,600,000) 1,121,430,000 + 주택 60%(기본공제 배분 후 497,500,000) 298,500,000
    //   > ⑤1호 prog(3,136,100,000) 1,345,305,000
    expect(prog(2_638_600_000)).toBe(1_121_430_000);
    expect(prog(3_136_100_000)).toBe(1_345_305_000);
    expect(withLocal(1_121_430_000 + 298_500_000)).toBe(1_561_923_000);
    // 종전: 0.4 × 1,318,800,000 + prog(1,319,800,000) + 298,500,000 → 1,489,389,000
    expect(withLocal(527_520_000 + prog(1_319_800_000) + 298_500_000)).toBe(1_489_389_000);
    expect(bothOrders(items)).toEqual([1_561_923_000, 1_561_923_000]);
  });
});

describe("F1-3 split이 아닌 1~2년 비주택 토지 두 건도 같은 규칙", () => {
  it("토지 10억(40% 승) + 토지 14억(1호 승) + 비사업용 토지 짝 → 1,527,526,000", () => {
    const items = [
      asset("land", 1_200_000_000, 200_000_000, "2021-07-20"),
      asset("land", 1_600_000_000, 200_000_000, "2021-07-20"),
      N900(),
    ];
    // ⑤2호 = prog(2,400,000,000) 1,014,060,000 + 374,600,000 = 1,388,660,000 > ⑤1호 prog(3,189,500,000) 1,369,335,000
    expect(prog(2_400_000_000) + 374_600_000).toBe(1_388_660_000);
    expect(prog(3_189_500_000)).toBe(1_369_335_000);
    expect(withLocal(1_388_660_000)).toBe(1_527_526_000);
    expect(bothOrders(items)).toEqual([1_527_526_000, 1_527_526_000]);
  });
});

describe("F1-4 분양권 단기 40%도 같은 버킷 — `presale:` 구분자는 누진 키에만 (리뷰 #2)", () => {
  // 2021.6.1. 전 양도 — 분양권 1~2년은 §104①2호 40%. 1호 후보가 늘 실리면서 분양권 키에도 누진 호가 생겨 구분자가 붙었고,
  // 같은 호·같은 세율인 토지 40%와 합산되지 않았다(산출세액 2,300,000,000 vs 2,334,060,000).
  const T0 = "2020-03-20";
  const one = (kind: "presale_right" | "land" | "building", sale: number, on: string) =>
    baseTransferInput({
      propertyType: kind, transferPrice: sale, acquisitionPrice: 500_000_000, acquisitionDate: D(on), transferDate: D(T0),
      isOneHousehold: false, householdHousingCount: kind === "land" ? 0 : 1, ...(kind === "land" ? { isNonBusinessLand: false } : {}),
      expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
  const calc = (items: TransferTaxInput[]) =>
    calculateTransferTaxAggregate(
      { taxYear: 2020, properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: 2_500_000 },
      rates,
    ).calculatedTax;

  it("분양권 10억 + 토지 10억(각 1년 6개월 40%) + 건물 6개월 50% 30억 → 2,334,060,000 = 토지 + 토지", () => {
    // 40% 버킷 합산 prog(2,000,000,000) 834,060,000 > 0.4 × 2,000,000,000 + 50% 1,500,000,000
    expect(prog(2_000_000_000) + 1_500_000_000).toBe(2_334_060_000);
    const presale = [one("presale_right", 1_500_000_000, "2018-09-20"), one("land", 1_500_000_000, "2018-09-20"), one("building", 3_500_000_000, "2019-09-20")];
    expect(calc(presale)).toBe(2_334_060_000);
    expect(calc([...presale].reverse())).toBe(2_334_060_000);
    expect(calc([one("land", 1_500_000_000, "2018-09-20"), one("land", 1_500_000_000, "2018-09-20"), one("building", 3_500_000_000, "2019-09-20")])).toBe(2_334_060_000);
  });
});
