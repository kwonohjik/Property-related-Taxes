/**
 * anchor: 다건 합산 — 토지·건물 분리취득 주택의 **배율 초과 비사업용 토지 파트**는 1호(합산 누진)가 이겨도 파트로 남아 짝 비사업용 토지의 8호 버킷과 합산된다.
 *
 * [결함] 다건 `assetTaxOf` → `resolveSplitAwareTax`의 자산 안 비교(§104⑤)에서 1호가 이기고 그 값이 자산 단위 세액과 같으면 `splitPartDetail`을 붙이지 않았다.
 *   그러면 다건 합산이 그 자산을 파트(토지·건물·배율 초과분) 대신 자산 하나로 접어, 배율 초과분(§104①8호)이 짝 비사업용 토지의 8호 버킷과 합산되지 못했다.
 *   결과: 입력 순서 의존(같은 두 자산이 [P,n] 145,816,000 ↔ [n,P] 163,548,000)과 양도가 1원 차이의 큰 절벽(163,149,928 → 145,269,502).
 *
 * [수정] 다건 호출(`aggregateFiling` — 종전 이름 `keepExcessPartsOnClause1Win`)에서만, 파트 중 비사업용 토지(`non_business_land`)가 있으면 ③ 분기에서도 파트를 남긴다.
 *   근거: 소득세법 §104⑤ 후단 — 비사업용 토지와 그 외 토지를 「제2호의 금액을 계산할 때」 별개 자산으로 본다(승패와 무관).
 *   단건은 합산할 짝이 없어 플래그를 넘기지 않는다(단건 불변). 배율 초과분이 없는 주택 split은 종전 그대로다.
 *   (비주택 토지·건물 split은 2026-10-16 파트 유지로 확장 — `aggregate-split-nonhouse-parts-kept.anchor.test.ts`.)
 *   #2214는 같은 호 키가 다른 rateGroup에 있으면 파트를 접는 가드를 두었다(호 버킷이 세율군 안에서만 합산되던 D1 때문).
 *   2026-10-16 D1 해소로 호 버킷을 신고 전체에서 합산하게 되어 가드를 제거했다(계획서 `transfer-104-5-clause-bucket-return-wide.plan.md`).
 *
 * 기대값은 엔진을 베끼지 않고 독립 산식(`prog`)으로 도출했다. 파트 과세표준은 엔진 echo를 입력으로 삼았다(주석에 값 명시) —
 * 호별 합산·누진·비사업용 +10%p·지방소득세 절사는 이 파일의 산식이 낸다. 모의 세율표는 누진 8구간(소득세법 §55①).
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
const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false,
      region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};

interface HouseP {
  S: number;
  T: string;
  /** 건물 취득일 · 토지 취득일 */
  bld: string;
  land: string;
  /** 양도가 중 토지 비율 */
  lp: number;
  /** 토지 면적(㎡) — non_urban 배율을 넘으면 초과분이 비사업용 토지로 분리된다. */
  area: number;
  res: number;
  oneHH: boolean;
  hh: number;
  rhe?: boolean;
}

/** 토지·건물 분리취득 주택 — 토지 취득가 2.5억 + 건물 1.5억, 기준시가는 양도가와 같은 비율. */
function housePart(o: HouseP): TransferTaxInput {
  const landT = Math.floor(o.S * o.lp);
  const bldT = o.S - landT;
  return baseTransferInput({
    propertyType: "housing", transferPrice: o.S, acquisitionPrice: 400_000_000,
    landTransferPrice: landT, buildingTransferPrice: bldT,
    landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: bldT,
    landAcquisitionPrice: 250_000_000, buildingAcquisitionPrice: 150_000_000,
    acquisitionDate: D(o.bld), landAcquisitionDate: D(o.land), transferDate: D(o.T),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 55, acquisitionArea: o.area, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: o.res, isOneHousehold: o.oneHH, householdHousingCount: o.hh,
    expenses: 0, annualBasicDeductionUsed: 0,
    ...(o.rhe ? { rentalHousingException: rentalA } : {}),
  } as Partial<TransferTaxInput>);
}

/** 비사업용 토지 짝 자산. */
function nblLand(T: string, price: number, acq: number, acquiredOn: string, ratio?: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land", transferPrice: price, acquisitionPrice: acq, acquisitionDate: D(acquiredOn), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: true,
    ...(ratio !== undefined ? { nonBusinessLandAreaRatio: ratio } : {}),
    expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
}

/** 단기 보유 주택 짝 자산(2주택 세대). */
function shortHouse(T: string, price: number, acq: number, acquiredOn: string): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: price, acquisitionPrice: acq, acquisitionDate: D(acquiredOn), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
}

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (T: string, items: TransferTaxItemInput[], basic = 0, strategy?: "FIRST") =>
  calculateTransferTaxAggregate(
    { taxYear: Number(T.slice(0, 4)), properties: items, annualBasicDeductionUsed: basic, ...(strategy ? { basicDeductionAllocation: strategy } : {}) },
    rates,
  );
/** 두 입력 순서 모두 같은 결과를 내는지 함께 본다. */
function bothOrders(T: string, a: TransferTaxInput, b: TransferTaxInput, basic = 0, strategy?: "FIRST") {
  const ab = aggOf(T, [asItem(a, "P"), asItem(b, "Q")], basic, strategy);
  const ba = aggOf(T, [asItem(b, "Q"), asItem(a, "P")], basic, strategy);
  return { ab, ba };
}

// 사용자 사례 P — 주택 분리취득 + 배율 초과, 양도 2023-03-20, 16억(토지 0.8), 건물 2년6월·토지 20년, 700㎡ non_urban, 거주 36개월, 1세대1주택.
const P_USER: HouseP = { S: 1_600_000_000, T: "2023-03-20", bld: "2020-09-20", land: "2003-03-20", lp: 0.8, area: 700, res: 36, oneHH: true, hh: 1 };
// 짝 n — 비사업용 토지 양도 5억 / 취득 3억(보유 6년 1월).
const N_USER = () => nblLand("2023-03-20", 500_000_000, 300_000_000, "2017-02-20");

describe("사용자 사례 — 주택 분리취득+배율 초과 P + 비사업용 토지 n: 입력 순서와 무관하게 163,548,000", () => {
  // 엔진 echo(파트 과세표준): P — 토지 25,750,001 · 건물 42,500,000(둘 다 1호) · 배율 초과 152,000,000(8호) / n 176,000,000(8호) / P 기본공제 2,500,000.
  //   1호(전체 합산) = prog(220,250,001 + 176,000,000) = 132,560,000
  //   2호(호별 합산) = 1호 버킷 prog(68,250,001) 10,620,000 + 8호 버킷 nblTax(152,000,000 + 176,000,000) 138,060,000 = 148,680,000
  const clause1 = prog(220_250_001 + 176_000_000);
  const clause1Bucket = prog(25_750_001 + 42_500_000);
  const clause8 = nblTax(152_000_000 + 176_000_000);
  const clause2 = clause1Bucket + clause8;

  it("독립 산식: 1호 132,560,000 < 2호 148,680,000 → 산출세액 148,680,000 · 총 163,548,000", () => {
    expect(clause1).toBe(132_560_000);
    expect(clause8).toBe(138_060_000);
    expect(clause2).toBe(148_680_000);
    expect(withLocal(Math.max(clause1, clause2))).toBe(163_548_000);
  });

  it("[P,n] = [n,P] = 163,548,000 — 배율 초과분이 n과 8호 버킷으로 합산된다", () => {
    const { ab, ba } = bothOrders(P_USER.T, housePart(P_USER), N_USER());
    for (const r of [ab, ba]) {
      expect(r.calculatedTax).toBe(148_680_000);
      expect(r.totalTax).toBe(163_548_000);
      expect(r.calculatedTaxByGeneral).toBe(clause1);
      expect(r.clause8TaxBase).toBe(328_000_000);
      expect(r.clause8Tax).toBe(clause8);
    }
  });
});

describe("경계 쌍 — P 양도가 1원 차이로 총세액이 연속(절벽 없음)", () => {
  const at = (S: number) => bothOrders("2023-03-20", housePart({ ...P_USER, S }), N_USER());
  it("1,597,955,359 → 1,597,955,360: 163,149,928 → 163,149,927 (양 순서 동일)", () => {
    const lo = at(1_597_955_359);
    const hi = at(1_597_955_360);
    expect([lo.ab.totalTax, lo.ba.totalTax]).toEqual([163_149_928, 163_149_928]);
    expect([hi.ab.totalTax, hi.ba.totalTax]).toEqual([163_149_927, 163_149_927]);
  });
});

describe("손계산 셀 — 1호·2호를 독립 산식으로 도출해 max와 일치", () => {
  it("UP-2: 같은 P(거주 24) + 짝 비사업용 12억/3억, 기본공제 배분 FIRST → 산출 465,560,000 · 총 512,116,000", () => {
    // 엔진 echo: P 파트(토지 25,750,001 · 건물 42,500,000 · 배율 초과 152,000,000), 기본공제 2,500,000은 P, 짝 n 792,000,000.
    const clause1 = prog(220_250_001 + 792_000_000); // 389,572,500
    const clause2 = prog(25_750_001 + 42_500_000) + nblTax(152_000_000 + 792_000_000); // 10,620,000 + 454,940,000
    expect(clause1).toBe(389_572_500);
    expect(clause2).toBe(465_560_000);
    const p = housePart({ ...P_USER, res: 24 });
    const q = nblLand("2023-03-20", 1_200_000_000, 300_000_000, "2017-02-20");
    const { ab, ba } = bothOrders(P_USER.T, p, q, 0, "FIRST");
    for (const r of [ab, ba]) {
      expect(r.calculatedTax).toBe(Math.max(clause1, clause2));
      expect(r.totalTax).toBe(512_116_000);
      expect(r.clause8TaxBase).toBe(944_000_000);
      expect(r.clause8Tax).toBe(454_940_000);
    }
  });

  it("DOWN-1: 2주택 세대 P(건물·토지 4년5월, 16억 토지 0.5, 700㎡) + 짝 단기주택 14개월 8억/7억, 공제 이미 사용 → 산출 475,860,000 · 총 523,446,000", () => {
    // 엔진 echo: P 파트(토지+건물 1호 995,571,430 · 배율 초과 108,428,571) · 짝 단기주택 100,000,000(1~2년 60%). 기본공제는 이미 사용.
    const clause1 = prog(995_571_430 + 108_428_571 + 100_000_000); // 475,860,000
    const byGroups = prog(995_571_430) + nblTax(108_428_571) + Math.floor(100_000_000 * 0.6); // 382,200,000 + 33,352,856 + 60,000,000
    expect(clause1).toBe(475_860_000);
    expect(byGroups).toBe(475_552_856);
    const p = housePart({ S: 1_600_000_000, T: "2023-03-20", bld: "2018-10-20", land: "2018-10-20", lp: 0.5, area: 700, res: 24, oneHH: false, hh: 2 });
    const q = shortHouse("2023-03-20", 800_000_000, 700_000_000, "2022-01-20");
    const { ab, ba } = bothOrders("2023-03-20", p, q, 2_500_000);
    for (const r of [ab, ba]) {
      expect(r.calculatedTax).toBe(Math.max(clause1, byGroups));
      expect(r.totalTax).toBe(523_446_000);
    }
  });

  it("DOWN-2: P(20억 토지 0.5, 건물 2년/토지 6년, 700㎡, 거주 120) + 같은 짝 단기주택, 2026-06-01 → 산출 265,791,428 · 총 292,370,570", () => {
    // 엔진 echo: P 파트(토지 122,571,430 + 건물 340,000,000 = 1호 462,571,430 · 배율 초과 141,428,571) · 짝 단기주택 97,500,000(기본공제 2,500,000은 짝에 귀속).
    const clause1 = prog(462_571_430 + 141_428_571 + 97_500_000); // 258,690,000
    const byGroups = prog(462_571_430) + nblTax(141_428_571) + Math.floor(97_500_000 * 0.6); // 159,088,572 + 48,202,856 + 58,500,000
    expect(clause1).toBe(258_690_000);
    expect(byGroups).toBe(265_791_428);
    const p = housePart({ S: 2_000_000_000, T: "2026-06-01", bld: "2024-06-01", land: "2020-06-01", lp: 0.5, area: 700, res: 120, oneHH: true, hh: 1 });
    const q = shortHouse("2026-06-01", 800_000_000, 700_000_000, "2025-04-01");
    const { ab, ba } = bothOrders("2026-06-01", p, q);
    for (const r of [ab, ba]) {
      expect(r.calculatedTax).toBe(Math.max(clause1, byGroups));
      expect(r.totalTax).toBe(292_370_570);
    }
  });
});

describe("§155⑳ G-3 재귀 — 나중 취득 토지 특례 자산도 플래그가 전파되어 파트가 남는다", () => {
  // P: 15억(토지 0.8) · 건물 2005-09-15 · 토지 2019-07-15(나중 취득) · 700㎡ · 거주 120 · §155⑳ 적용, 2020-09-15 양도. 짝 n: 12억/3억 비사업용(보유 6년 1월).
  // 엔진 echo: P 파트(토지 746,428,572 + 건물 12,000,000 = 1호 758,428,572 · 배율 초과 203,571,428 — 보유 1~2년 40%와 8호 중 큰 40%), n 789,500,000(기본공제 2,500,000은 n).
  //   배율 초과분의 후보 집합이 {1-2호, 8호}라 n의 {8호} 버킷과 합산되지 않는다 → 합산 단위: P 1호 버킷 / P 초과분 / n.
  //   P: prog(758,428,572) 282,600,000 + 초과분 max(40% 81,428,571 · 8호 77,774,284) 81,428,571 = 364,028,571 / n: nblTax(789,500,000) 374,600,000
  //   2호 합 738,628,571 ≥ 1호 prog(962,000,000 + 789,500,000) 722,235,000 → 738,628,571 · 지방소득세 73,862,857 · 총 812,491,428
  const p = () => housePart({ S: 1_500_000_000, T: "2020-09-15", bld: "2005-09-15", land: "2019-07-15", lp: 0.8, area: 700, res: 120, oneHH: true, hh: 1, rhe: true });
  const q = () => nblLand("2020-09-15", 1_200_000_000, 300_000_000, "2014-08-15");

  it("전제: 단건 §155⑳ 적용 · 나중 취득 토지분(G-3) · 배율 초과분이 모두 성립한다", () => {
    const single = calculateTransferTax(p(), rates);
    expect(single.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(single.splitDetail?.laterLandPart).toBeDefined();
    expect(single.splitDetail?.nonBusinessLandPart).toBeDefined();
  });

  it("[P,n] = [n,P]: 산출 738,628,571 · 총 812,491,428 = max(1호 722,235,000, 2호 738,628,571)", () => {
    const clause1 = prog(962_000_000 + 789_500_000);
    const pTax = prog(746_428_572 + 12_000_000) + Math.max(Math.floor(203_571_428 * 0.4), nblTax(203_571_428));
    const clause2 = pTax + nblTax(789_500_000);
    expect(clause1).toBe(722_235_000);
    expect(clause2).toBe(738_628_571);
    const { ab, ba } = bothOrders("2020-09-15", p(), q());
    for (const r of [ab, ba]) {
      expect(r.calculatedTax).toBe(Math.max(clause1, clause2));
      expect(r.totalTax).toBe(withLocal(738_628_571));
    }
  });
});

describe("세율군이 달라도 같은 호는 신고 전체에서 합산한다 — 배율 초과분 + 다른 세율군의 비사업용 토지", () => {
  // P: 16억(토지 0.5) · 건물 2018-03-15 · 토지 2014-09-15 · 700㎡ non_urban · 정착 55㎡ · 거주 24 · 2주택 세대(비과세 아님), 양도 2020-09-15.
  // 짝 Q: 비사업용 토지 12억 / 3억(취득 2014-08-15). P는 단건 승자가 progressive 세율군, Q는 non_business_land 세율군이다.
  // 엔진 echo(파트 과세표준, 기본공제 전): P 1호 파트(토지+건물) 1,030,285,716 · 배율 초과 103,714,285(8호) / Q 792,000,000(8호).
  //   기본공제 2,500,000은 두 자산이 같은 날 양도라 납세자에게 유리한 쪽(재일46014-1685)인데 어느 쪽이든 8호 버킷에서 빠져 세액이 같다 →
  //   propertyId 순으로 P(파트 중 세율 높은 배율 초과분)에 붙는다: 배율 초과 101,214,285 · Q 792,000,000.
  //   1호(전체 합산) = prog(1,134,000,001 + 789,500,000) = 799,635,000
  //   2호(호별 신고 전체 합산) = 1호 버킷 prog(1,030,285,716) 397,688,572 + 8호 버킷 nblTax(101,214,285 + 792,000,000) 428,531,427 = 826,219,999
  // 종전에는 세율군 안에서만 합산해(D1) 8호 버킷이 갈렸고, #2214 가드가 P를 자산 하나로 접어 818,960,000이었다.
  const p = () => housePart({ S: 1_600_000_000, T: "2020-09-15", bld: "2018-03-15", land: "2014-09-15", lp: 0.5, area: 700, res: 24, oneHH: false, hh: 2 });
  const q = () => nblLand("2020-09-15", 1_200_000_000, 300_000_000, "2014-08-15");
  const clause1 = prog(1_134_000_001 + 789_500_000);
  const bucket1 = prog(1_030_285_716);
  const bucket8 = nblTax(101_214_285 + 792_000_000);

  it("독립 산식: 1호 799,635,000 < 2호 826,219,999", () => {
    expect(clause1).toBe(799_635_000);
    expect(bucket1).toBe(397_688_572);
    expect(bucket8).toBe(428_531_427);
    expect(bucket1 + bucket8).toBe(826_219_999);
  });

  it("[P,Q] = [Q,P]: 산출 826,219,999 · 총 908,841,998 — 8호 버킷이 세율군 너머로 합산된다", () => {
    const { ab, ba } = bothOrders("2020-09-15", p(), q());
    for (const r of [ab, ba]) {
      expect(r.properties.find((x) => x.propertyId === "P")?.rateGroup).toBe("progressive");
      expect(r.properties.find((x) => x.propertyId === "Q")?.rateGroup).toBe("non_business_land");
      expect(r.calculatedTaxByGeneral).toBe(clause1);
      expect(r.calculatedTax).toBe(826_219_999);
      expect(r.totalTax).toBe(withLocal(826_219_999));
      // §104⑤ 크로스(8호 ↔ 주식 9호)가 읽는 8호 echo — 배율 초과분이 포함된다.
      expect([r.clause8TaxBase, r.clause8Tax]).toEqual([893_214_285, bucket8]);
      expect([r.clause1BucketTaxBase, r.clause1BucketTax]).toEqual([1_030_285_716, bucket1]);
    }
  });

  it("세율군 카드: 8호 버킷 세액을 과세표준 비율로 나눈다(나머지는 버킷 안 과세표준이 큰 세율군) — 양 순서 동일 · 합 = 세율군별 합계", () => {
    // progressive 몫 = floor(428,531,427 × 101,214,285 / 893,214,285) = 48,558,898 → 397,688,572 + 48,558,898
    const share = Number((BigInt(bucket8) * 101_214_285n) / 893_214_285n); // 곱이 2^53을 넘어 BigInt로 정확히 나눈다
    expect(share).toBe(48_558_898);
    const { ab, ba } = bothOrders("2020-09-15", p(), q());
    for (const r of [ab, ba]) {
      const card = (g: string) => r.groupTaxes.find((x) => x.group === g)?.groupCalculatedTax;
      expect(card("progressive")).toBe(bucket1 + share);
      expect(card("non_business_land")).toBe(bucket8 - share);
      expect(r.groupTaxes.reduce((s, g) => s + g.groupCalculatedTax, 0)).toBe(r.calculatedTaxByGroups);
    }
  });
});

describe("세율군 승자 전환 경계 — P 양도가 1원 차이로 총세액이 연속", () => {
  // 사용자 사례 계열. 1,602,397,704까지는 P의 단건 승자가 non_business_land, 705부터 progressive 세율군이다.
  // 엔진 echo(705): P 1호 파트 69,419,803 · 8호 버킷(배율 초과 + n) 328,287,724.
  //   2호 = prog(69,419,803) 10,900,752 + nblTax(328,287,724) 138,203,861 = 149,104,613 ≥ 1호 133,143,010
  // 종전에는 705에서 세율군이 바뀌며 8호 버킷이 갈려 총세액 164,015,074 → 146,457,311(−17,557,763)로 떨어졌다.
  const at = (S: number) => bothOrders("2023-03-20", housePart({ ...P_USER, S }), N_USER());
  it("1,602,397,704 → 1,602,397,705: 총 164,015,074 → 164,015,074 (양 순서 동일)", () => {
    expect(prog(69_419_803) + nblTax(328_287_724)).toBe(149_104_613);
    expect(withLocal(149_104_613)).toBe(164_015_074);
    const lo = at(1_602_397_704);
    const hi = at(1_602_397_705);
    expect([lo.ab.totalTax, lo.ba.totalTax]).toEqual([164_015_074, 164_015_074]);
    expect([hi.ab.totalTax, hi.ba.totalTax]).toEqual([164_015_074, 164_015_074]);
  });
});

describe("표시 — 파트를 남긴 자산의 「산출세액 (참고)」 산식 문구와 금액이 맞는다", () => {
  it("사용자 사례 P: 문구가 합산 누진세액 63,755,000(= refCalculatedTax)을 말하고 거짓 등식(과세표준 × 세율 − 누진공제)을 내지 않는다", () => {
    const { ab } = bothOrders(P_USER.T, housePart(P_USER), N_USER());
    const pb = ab.properties.find((x) => x.propertyId === "P")!;
    expect(pb.refCalculatedTax).toBe(63_755_000);
    expect(pb.refCalculatedTaxNote).toContain("합산 누진세액 63,755,000");
    expect(pb.refCalculatedTaxNote).toContain("자산별 합계 63,640,000");
    const formula = buildCalculatedTaxFormula(pb);
    expect(formula).toBe(pb.refCalculatedTaxNote);
    expect(formula).not.toContain("×");
    expect(formula).not.toContain("원");
  });
});

describe("대조군 — 불변이어야 하는 경로 (수정 전 값 그대로)", () => {
  it("단건: 배율 초과 split 주택 단독은 단건 = 다건(자산 1건) = 70,130,500", () => {
    const single = calculateTransferTax(housePart(P_USER), rates);
    expect(single.totalTax).toBe(70_130_500);
    expect(aggOf(P_USER.T, [asItem(housePart(P_USER), "P")]).totalTax).toBe(70_130_500);
  });

  it("한 필지 일부 비사업용(computePartialNblTax) + 짝 비사업용 토지: 양 순서 537,174,000", () => {
    // 항상 파트를 붙이는 형제 경로 — 이 수정과 무관해야 한다.
    // 부분 비사업용 자산의 기본공제는 세율 높은 8호 파트부터라, 어느 쪽에 주어도 8호 버킷에서 빠져 537,174,000으로 같다.
    //   (종전 537,339,000은 파트 비율로 나눠 1호 파트까지 줄인 값 — 계획서 transfer-partial-nbl-loss-offset.investigation.plan.md §6)
    const partial = nblLand("2023-03-20", 1_300_000_000, 300_000_000, "2020-09-20", 0.5);
    const first = (a: TransferTaxInput, b: TransferTaxInput) => bothOrders("2023-03-20", a, b, 0, "FIRST").ab.totalTax;
    expect([first(partial, N_USER()), first(N_USER(), partial)]).toEqual([537_174_000, 537_174_000]);
    const { ab, ba } = bothOrders("2023-03-20", partial, N_USER());
    expect([ab.totalTax, ba.totalTax]).toEqual([537_174_000, 537_174_000]);
  });

  it("§155⑳ 적용 자산(나중 취득 토지 없음, 배율 초과 있음) + 짝 비사업용 토지: 양 순서 499,986,142", () => {
    const rhe = housePart({ S: 1_500_000_000, T: "2020-09-15", bld: "2005-09-15", land: "2005-09-15", lp: 0.8, area: 700, res: 120, oneHH: true, hh: 1, rhe: true });
    const single = calculateTransferTax(rhe, rates);
    expect(single.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(single.splitDetail?.laterLandPart).toBeUndefined();
    const { ab, ba } = bothOrders("2020-09-15", rhe, nblLand("2020-09-15", 1_200_000_000, 300_000_000, "2014-08-15"));
    expect([ab.totalTax, ba.totalTax]).toEqual([499_986_142, 499_986_142]);
  });
});

describe("비주택 split 파트 유지(P3)로 값이 바뀐 셀 — 종전 범위 가드", () => {
  it("DOWN-3: 배율 초과분 없는 비주택 토지·건물 split + 짝 비사업용 12억/3억 — 산출 976,660,000(파트 유지, P3)", () => {
    // 토지 1년6월 2.5억/2억, 건물 5년 19억/3억, 2020-09-15. 배율 초과분이 없어 이 파일의 수정(#2214)은 건드리지 않았고,
    // 종전 값 979,160,000은 자산 하나로 접힌 값(자산 전체 1,490,000,000 누진 604,560,000 + 짝 374,600,000)이었다.
    // 비주택 split 파트 유지(계획서 `transfer-104-5-split-nonhouse-parts-in-aggregate.plan.md`)로
    // 토지 5천만 × 40% 20,000,000 + 건물 prog(1,440,000,000) 582,060,000 + 짝 374,600,000 = 976,660,000(토지·건물 분리 신고와 같다).
    // 손계산·분리 신고 대조는 `aggregate-split-nonhouse-parts-kept.anchor.test.ts` P3-2.
    const nh = baseTransferInput({
      propertyType: "building", transferPrice: 2_150_000_000, transferDate: D("2020-09-15"),
      acquisitionPrice: 500_000_000, acquisitionDate: D("2015-09-15"), landAcquisitionDate: D("2019-03-15"),
      isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
      landTransferPrice: 250_000_000, buildingTransferPrice: 1_900_000_000,
      landStandardPriceAtTransfer: 250_000_000, buildingStandardPriceAtTransfer: 1_900_000_000,
      landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
    const { ab, ba } = bothOrders("2020-09-15", nh, nblLand("2020-09-15", 1_200_000_000, 300_000_000, "2014-08-15"));
    for (const r of [ab, ba]) {
      expect(r.calculatedTax).toBe(976_660_000);
      expect(r.totalTax).toBe(1_074_326_000);
    }
  });
});
