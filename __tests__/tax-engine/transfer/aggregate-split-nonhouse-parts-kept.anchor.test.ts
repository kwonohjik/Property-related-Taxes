/**
 * anchor: 다건 합산 — 비주택 토지·건물 분리취득(split) 자산은 1호(합산 누진)가 이겨도 파트(토지·건물)를 §104⑤2호 합산 단위로 남긴다 (P3).
 *
 * [결함] `resolveSplitAwareTax`가 1호 승리 + 「자산 단위 세액 === 1호」이면 파트를 버리고, 자산 단위 세액이 1호보다 크면 1호로 정정하며
 *   파트를 붙였다. 자산 단위 세액은 건물 취득일 하나로 판정해 건물 1~2년이면 max(전체 40%, 전체 누진)이므로, 자산 과세표준
 *   1,318,800,000(0.4x = 0.45x − 65,940,000)에서 두 분기가 뒤바뀐다. 단건은 두 분기 값이 같아 연속이지만, 다건은 파트 유무로
 *   합산 단위가 바뀌어(`transfer-tax-aggregate-group-tax.ts` `assetTaxOf`) 1원 차이로 세액이 뛰었다(재현 셀 +16,500,001).
 *   게이트 7(파트 세율·누진공제가 같으면 접음)도 다건 합산 단위 키(해당 호 집합, Q3)와 어긋나 같은 계열의 두 번째 스위치였다.
 *
 * [수정] 다건 호출(`aggregateFiling`) + 비주택이면 ① 1호 승리·등식 분기에서도 파트를 남기고 ② 게이트 7은 파트 버킷 키가 다르면 접지 않는다.
 *   근거: 비주택 split의 토지·건물은 별개 자산으로 파트별 세율을 적용한다(G-1) — 다건에서는 토지 자산 + 건물 자산 두 건을 신고한 값과 같아야 한다.
 *   단건·주택은 종전 그대로다. 계획서 `docs/02-design/features/transfer-104-5-split-nonhouse-parts-in-aggregate.plan.md`.
 *
 * 기대값은 독립 산식(`prog`)으로 도출하고, 같은 값을 토지·건물을 별개 자산 2건으로 나눈 신고(split 경로를 타지 않는다)와 대조한다.
 * 모의 세율표는 누진 8구간(소득세법 §55①) · 비사업용 토지 +10%p · 단기 1~2년 40%(§104①3호)·주택 1~2년 60%.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { buildCalculatedTaxFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

// ───────────── 독립 산식 ─────────────
/** 소득세법 §55① 누진세율 (과세표준 → 산출세액). */
function prog(base: number): number {
  const t: [number, number, number][] = [
    [14_000_000, 0.06, 0], [50_000_000, 0.15, 1_260_000], [88_000_000, 0.24, 5_760_000], [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000], [500_000_000, 0.4, 25_940_000], [1_000_000_000, 0.42, 35_940_000], [Infinity, 0.45, 65_940_000],
  ];
  const [, r, d] = t.find(([ub]) => base <= ub)!;
  return Math.floor(base * r) - d;
}
/** §104①8호 비사업용 토지 — 기본세율 + 10%p. */
const nblTax = (base: number) => prog(base) + Math.floor(base * 0.1);
/** 지방소득세(산출세액의 10%, 원 미만 절사)를 더한 총세액. */
const withLocal = (calc: number) => calc + Math.floor(calc * 0.1);

// ───────────── 입력 빌더(명시적) ─────────────
interface Nh {
  T: string;
  /** 토지 취득일 · 건물 취득일 */
  land: string;
  bld: string;
  landAcq: number;
  landSale: number;
  bldAcq: number;
  bldSale: number;
}
/** 비주택(일반건물) 토지·건물 분리취득 — 기준시가는 양도가와 같게 둔다. */
function nhSplit(o: Nh): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building", transferPrice: o.landSale + o.bldSale, transferDate: D(o.T),
    acquisitionPrice: o.landAcq + o.bldAcq, acquisitionDate: D(o.bld), landAcquisitionDate: D(o.land),
    isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: o.landSale, buildingTransferPrice: o.bldSale,
    landStandardPriceAtTransfer: o.landSale, buildingStandardPriceAtTransfer: o.bldSale,
    landAcquisitionPrice: o.landAcq, buildingAcquisitionPrice: o.bldAcq, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
}
/** 대조 기준 — 같은 split 자산을 토지 자산 + 건물 자산 두 건으로 나눈 것(split 경로를 타지 않는다). */
function separated(o: Nh): TransferTaxInput[] {
  const one = (kind: "land" | "building", sale: number, acq: number, on: string) =>
    baseTransferInput({
      propertyType: kind, transferPrice: sale, acquisitionPrice: acq, acquisitionDate: D(on), transferDate: D(o.T),
      isOneHousehold: false, householdHousingCount: kind === "land" ? 0 : 1, ...(kind === "land" ? { isNonBusinessLand: false } : {}),
      expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
  return [one("land", o.landSale, o.landAcq, o.land), one("building", o.bldSale, o.bldAcq, o.bld)];
}
/** 비사업용 토지 짝 자산. */
const nblLand = (T: string, price: number, acq: number, acquiredOn: string) =>
  baseTransferInput({
    propertyType: "land", transferPrice: price, acquisitionPrice: acq, acquisitionDate: D(acquiredOn), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: true, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 단기 보유 주택 짝 자산(2주택 세대). */
const shortHouse = (T: string, price: number, acq: number, acquiredOn: string) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: price, acquisitionPrice: acq, acquisitionDate: D(acquiredOn), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);

/** 주택 split 대조군(P3-6) — 수정 전 엔진 실측값. 비주택 규칙이 주택에 새면 바뀐다. */
const HOUSE_P1 = 931_051_000;
const HOUSE_P4 = 1_062_281_000;
const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (T: string, items: TransferTaxInput[], basicUsed = 0) =>
  calculateTransferTaxAggregate(
    { taxYear: Number(T.slice(0, 4)), properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: basicUsed },
    rates,
  );
/** split 자산 + 짝, 두 입력 순서의 총세액. */
const bothOrders = (T: string, p: TransferTaxInput, q: TransferTaxInput, basicUsed = 0) =>
  [aggOf(T, [p, q], basicUsed).totalTax, aggOf(T, [q, p], basicUsed).totalTax];

// ───────────── 재현 셀 (계획서 §1.2) ─────────────
// 건물 1년 6개월(2호 40%) · 토지 5년(1호) · 짝 비사업용 토지 12억/3억(6년 1개월), 2023-03-20. 토지 양도가만 움직인다.
const T1 = "2023-03-20";
const repro = (S: number): Nh => ({ T: T1, land: "2018-03-20", bld: "2021-09-20", landAcq: 200_000_000, landSale: S - 600_000_000, bldAcq: 300_000_000, bldSale: 600_000_000 });
const N900 = () => nblLand(T1, 1_200_000_000, 300_000_000, "2017-02-20");

describe("P3-1 재현 셀 — 양도가 1원 차이로 총세액이 연속(두 순서)", () => {
  it("S = 1,931,999,994 → 975,831,996 · S + 1 = 1,931,999,995 → 975,831,997 (종전 992,331,997, +16,500,001)", () => {
    // S+1 손계산(§1.3): 토지 파트 1,018,799,996(양도차익 1,131,999,995 − 장특 10%) · 건물 300,000,000 · 짝 789,500,000(기본공제 배분 후)
    //   2호 = 토지 {1호} 392,519,998 + 건물 {2호} max(40% 120,000,000, 누진 94,060,000) + 짝 {8호} 374,600,000 = 887,119,998
    //   1호 = prog(2,108,299,996) = 882,794,998 → 큰 값 887,119,998
    expect(prog(1_018_799_996)).toBe(392_519_998);
    expect(Math.max(Math.floor(300_000_000 * 0.4), prog(300_000_000))).toBe(120_000_000);
    expect(nblTax(789_500_000)).toBe(374_600_000);
    expect(prog(2_108_299_996)).toBe(882_794_998);
    expect(withLocal(392_519_998 + 120_000_000 + 374_600_000)).toBe(975_831_997);

    expect(bothOrders(T1, nhSplit(repro(1_931_999_994)), N900())).toEqual([975_831_996, 975_831_996]);
    expect(bothOrders(T1, nhSplit(repro(1_931_999_995)), N900())).toEqual([975_831_997, 975_831_997]);
  });

  it("S + 1 = 토지 자산 + 건물 자산 분리 신고(기본공제 기사용 2,500,000)", () => {
    const o = repro(1_931_999_995);
    expect(aggOf(T1, [nhSplit(o), N900()], 2_500_000).totalTax).toBe(aggOf(T1, [...separated(o), N900()], 2_500_000).totalTax);
  });
});

// ───────────── DOWN-3 (#2214 범위 가드였던 셀 — 계획서 §1.3) ─────────────
const T3 = "2020-09-15";
const down3: Nh = { T: T3, land: "2019-03-15", bld: "2015-09-15", landAcq: 200_000_000, landSale: 250_000_000, bldAcq: 300_000_000, bldSale: 1_900_000_000 };
describe("P3-2 DOWN-3 — 토지 1년 6개월 + 건물 5년 + 짝 비사업용 12억/3억", () => {
  it("산출 976,660,000 · 총 1,074,326,000 (종전 979,160,000 — 자산 하나로 접혀 토지 5천만에 45%가 얹혔다)", () => {
    // 토지 5천만 × 40% = 20,000,000 · 건물 1,440,000,000(장특 10%) → prog 582,060,000 · 짝 789,500,000 → 374,600,000
    expect(prog(1_440_000_000)).toBe(582_060_000);
    expect(20_000_000 + 582_060_000 + 374_600_000).toBe(976_660_000);
    const n = () => nblLand(T3, 1_200_000_000, 300_000_000, "2014-08-15");
    for (const items of [[nhSplit(down3), n()], [n(), nhSplit(down3)]]) {
      const r = aggOf(T3, items);
      expect(r.calculatedTax).toBe(976_660_000);
      expect(r.totalTax).toBe(1_074_326_000);
    }
  });

  it("분리 신고와 같다(기본공제 기사용)", () => {
    const n = nblLand(T3, 1_200_000_000, 300_000_000, "2014-08-15");
    expect(aggOf(T3, [nhSplit(down3), n], 2_500_000).totalTax).toBe(aggOf(T3, [...separated(down3), n], 2_500_000).totalTax);
  });

  it("「산출세액 (참고)」 문구가 파트 비교를 말하고 금액이 refCalculatedTax와 같다(거짓 등식 없음)", () => {
    const r = aggOf(T3, [nhSplit(down3), nblLand(T3, 1_200_000_000, 300_000_000, "2014-08-15")]);
    const pb = r.properties.find((x) => x.propertyId === "A0")!;
    // 자산 단독 비교: 1호 prog(1,490,000,000) = 604,560,000 ≥ 자산별 합계 20,000,000 + 582,060,000 = 602,060,000
    expect(prog(1_490_000_000)).toBe(604_560_000);
    expect(pb.refCalculatedTax).toBe(604_560_000);
    expect(pb.refCalculatedTaxNote).toBe(
      "토지·건물 파트별 세율 비교(소득세법 §104⑤): 합산 누진세액 604,560,000이 자산별 합계 602,060,000 이상이라 합산 누진세액을 산출세액으로 한다 (토지·건물은 별개 자산으로 호별 합산)",
    );
    const formula = buildCalculatedTaxFormula(pb);
    expect(formula).toBe(pb.refCalculatedTaxNote);
    expect(formula).not.toContain("×");
  });
});

// ───────────── P7 Y 부류 — 두 파트 모두 1호 적용, 해당 호 집합만 다름(게이트 7 정합) ─────────────
const T7 = "2023-03-20";
const p7: Nh = { T: T7, land: "2021-09-20", bld: "2013-03-20", landAcq: 200_000_000, landSale: 1_700_000_000, bldAcq: 300_000_000, bldSale: 3_300_000_000 };
const SH500 = () => shortHouse(T7, 1_200_000_000, 700_000_000, "2022-01-20");
describe("P3-3 P7 — 토지 1년 6개월 양도차익 15억 + 건물 10년 양도차익 30억 + 짝 주택 1년 2개월 12억/7억", () => {
  it("총 2,113,782,000 (종전 2,186,316,000 — 누진공제 65,940,000 × 1.1 차이)", () => {
    // 토지 {1·2호}: prog(1,500,000,000) 609,060,000 > 40% 600,000,000 · 건물 {1호} 2,400,000,000(장특 20%) → 1,014,060,000
    // 짝 {2호 60%} (500,000,000 − 기본공제 2,500,000) × 60% = 298,500,000 → 2호 합 1,921,620,000 > 1호 prog(4,397,500,000) 1,912,935,000
    expect(prog(1_500_000_000)).toBe(609_060_000);
    expect(prog(2_400_000_000)).toBe(1_014_060_000);
    expect(Math.floor(497_500_000 * 0.6)).toBe(298_500_000);
    expect(prog(4_397_500_000)).toBe(1_912_935_000);
    expect(withLocal(609_060_000 + 1_014_060_000 + 298_500_000)).toBe(2_113_782_000);
    expect(bothOrders(T7, nhSplit(p7), SH500())).toEqual([2_113_782_000, 2_113_782_000]);
  });

  it("분리 신고와 같다(기본공제 기사용)", () => {
    expect(aggOf(T7, [nhSplit(p7), SH500()], 2_500_000).totalTax).toBe(aggOf(T7, [...separated(p7), SH500()], 2_500_000).totalTax);
  });
});

// ───────────── P3-4 게이트 7 경계 — 토지 파트 단독 40% ↔ 누진 교차점에서 1원 연속 ─────────────
// 토지 1년 6개월 파트 과세표준 x가 1,318,800,000을 넘으면 토지도 1호(45%·누진공제 65,940,000)가 되어 건물 10년 파트와 세율이 같아진다.
// 종전 게이트 7은 그때 파트를 접어 이 교차점도 절벽이었다(단기 파트 스캔 198곳 계열). 1호 승리 분기만 고치고
// 게이트 7을 그대로 두면(A0) 같은 계열 절벽이 최대 72,534,000으로 커진다(계획서 §3.1).
describe("P3-4 게이트 7 경계 — 토지 파트 과세표준 1,318,799,999 ↔ 1,318,800,000", () => {
  const at = (landGain: number) => bothOrders(T7, nhSplit({ ...p7, landSale: 200_000_000 + landGain }), SH500());
  it("2,024,087,998 → 2,024,088,000 (산출세액 +1원 · 지방소득세 절사 +1원), 두 순서 동일", () => {
    // 토지 파트(장특 없음)의 과세표준 = 양도차익 — 짝 주택(60%)이 기본공제를 먼저 받는다.
    // 2호 = 토지 max(40%, 누진) + 건물 1,014,060,000 + 짝 298,500,000 · 1호 = prog(토지 + 2,400,000,000 + 497,500,000)
    const clause2 = (x: number) => Math.max(Math.floor(x * 0.4), prog(x)) + 1_014_060_000 + 298_500_000;
    const clause1 = (x: number) => prog(x + 2_400_000_000 + 497_500_000);
    expect(Math.floor(1_318_800_000 * 0.4)).toBe(prog(1_318_800_000));
    expect([clause2(1_318_799_999), clause1(1_318_799_999)]).toEqual([1_840_079_999, 1_831_394_999]);
    expect([clause2(1_318_800_000), clause1(1_318_800_000)]).toEqual([1_840_080_000, 1_831_395_000]);
    expect(at(1_318_799_999)).toEqual([withLocal(1_840_079_999), withLocal(1_840_079_999)]);
    expect(at(1_318_800_000)).toEqual([withLocal(1_840_080_000), withLocal(1_840_080_000)]);
    expect([withLocal(1_840_079_999), withLocal(1_840_080_000)]).toEqual([2_024_087_998, 2_024_088_000]);
  });
});

// ───────────── 대조군 — 불변 ─────────────
/** 토지·건물 분리취득 주택(2주택 세대) — 기준시가는 양도가와 같은 비율. 토지 비율 0.8, 비도시 지역. */
function houseSplit(S: number, T: string, bld: string, land: string, area: number): TransferTaxInput {
  const landT = Math.floor(S * 0.8);
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 400_000_000,
    landTransferPrice: landT, buildingTransferPrice: S - landT,
    landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT,
    landAcquisitionPrice: 250_000_000, buildingAcquisitionPrice: 150_000_000,
    acquisitionDate: D(bld), landAcquisitionDate: D(land), transferDate: D(T),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 55, acquisitionArea: area, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 36, isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
}

describe("P3-5·P3-6 대조군 — 단건·주택 split은 종전 값 그대로", () => {
  it("단건: 재현 셀 자산 단독 S·S+1 연속(단건 = 다건 자산 1건)", () => {
    for (const S of [1_931_999_994, 1_931_999_995]) {
      expect(aggOf(T1, [nhSplit(repro(S))]).totalTax).toBe(calculateTransferTax(nhSplit(repro(S)), rates).totalTax);
    }
    const d = calculateTransferTax(nhSplit(repro(1_931_999_995)), rates).totalTax - calculateTransferTax(nhSplit(repro(1_931_999_994)), rates).totalTax;
    expect(d).toBeLessThanOrEqual(1);
  });

  it("주택 split은 비주택 규칙을 타지 않는다 — 수정 전 값 그대로(두 순서)", () => {
    // P1형: 토지 20년 · 건물 2년 6개월, 배율 이내(330㎡) · P4형(G-3): 토지 1년 8개월 나중 취득 · 건물 15년.
    // 값은 수정 전 엔진 실측(이 수정은 `propertyType !== "housing"`만 바꾼다).
    const p1 = houseSplit(2_000_000_000, T1, "2020-09-20", "2003-03-20", 330);
    const p4 = houseSplit(1_500_000_000, T1, "2008-03-20", "2021-07-20", 330);
    expect(bothOrders(T1, p1, N900())).toEqual([HOUSE_P1, HOUSE_P1]);
    expect(bothOrders(T1, p4, N900())).toEqual([HOUSE_P4, HOUSE_P4]);
  });
});
