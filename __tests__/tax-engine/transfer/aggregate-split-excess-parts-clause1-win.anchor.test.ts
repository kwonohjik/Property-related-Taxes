/**
 * anchor: 다건 합산 — 토지·건물 분리취득 주택의 **배율 초과 비사업용 토지 파트**는 1호(합산 누진)가 이겨도 파트로 남아 짝 비사업용 토지의 8호 버킷과 합산된다.
 *
 * [결함] 다건 `assetTaxOf` → `resolveSplitAwareTax`의 자산 안 비교(§104⑤)에서 1호가 이기고 그 값이 자산 단위 세액과 같으면 `splitPartDetail`을 붙이지 않았다.
 *   그러면 다건 합산이 그 자산을 파트(토지·건물·배율 초과분) 대신 자산 하나로 접어, 배율 초과분(§104①8호)이 짝 비사업용 토지의 8호 버킷과 합산되지 못했다.
 *   결과: 입력 순서 의존(같은 두 자산이 [P,n] 145,816,000 ↔ [n,P] 163,548,000)과 양도가 1원 차이의 큰 절벽(163,149,928 → 145,269,502).
 *
 * [수정] 다건 호출(`keepExcessPartsOnClause1Win`)에서만, 파트 중 비사업용 토지(`non_business_land`)가 있으면 ③ 분기에서도 파트를 남긴다.
 *   근거: 소득세법 §104⑤ 후단 — 비사업용 토지와 그 외 토지를 「제2호의 금액을 계산할 때」 별개 자산으로 본다(승패와 무관).
 *   단건은 합산할 짝이 없어 플래그를 넘기지 않는다(단건 불변). 배율 초과분이 없는 자산도 종전 그대로다.
 *   가드(`otherGroupBucketKeys`): 배율 초과분과 같은 호 버킷 키의 자산·파트가 **다른 rateGroup**에 있으면 접는다 — 다건은 같은 그룹 안에서만 호 버킷을
 *   묶으므로(D1) 파트를 남겨도 합산되지 못해 2호만 부당하게 낮아진다. D1(그룹 경계) 재검토 전까지의 보호 장치다.
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

describe("가드 — 같은 호 키가 다른 rateGroup에 있으면 자산 단위로 둔다(현행 유지)", () => {
  // P: 16억(토지 0.5) · 건물 2018-03-15 · 토지 2014-09-15 · 700㎡ non_urban · 정착 55㎡ · 거주 24 · 2주택 세대(비과세 아님), 양도 2020-09-15.
  // 짝 Q: 비사업용 토지 12억 / 3억(취득 2014-08-15). P는 단건 승자가 progressive 그룹, Q는 non_business_land 그룹이라 D1이 8호 버킷 합산을 막는다.
  //   파트를 남기면 산출세액 803,519,999(8호 버킷이 Q와 합쳐지지 못한 채 2호가 낮아짐) — 가드가 막아 현행 818,960,000을 유지한다.
  //   오라클 정답(8호를 그룹 너머 합산)은 826,219,999 — D1 별건에서 고친다(아래 todo).
  const p = () => housePart({ S: 1_600_000_000, T: "2020-09-15", bld: "2018-03-15", land: "2014-09-15", lp: 0.5, area: 700, res: 24, oneHH: false, hh: 2 });
  const q = () => nblLand("2020-09-15", 1_200_000_000, 300_000_000, "2014-08-15");

  it("[P,Q] = [Q,P]: 산출 818,960,000 · 총 900,856,000 (파트를 남기면 803,519,999로 내려간다)", () => {
    const { ab, ba } = bothOrders("2020-09-15", p(), q());
    for (const r of [ab, ba]) {
      expect(r.properties.find((x) => x.propertyId === "P")?.rateGroup).toBe("progressive");
      expect(r.properties.find((x) => x.propertyId === "Q")?.rateGroup).toBe("non_business_land");
      expect(r.calculatedTax).toBe(818_960_000);
      expect(r.totalTax).toBe(900_856_000);
    }
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

  it("한 필지 일부 비사업용(computePartialNblTax) + 짝 비사업용 토지: 양 순서 537,339,000", () => {
    // 항상 파트를 붙이는 형제 경로 — 이 수정과 무관해야 한다.
    const partial = nblLand("2023-03-20", 1_300_000_000, 300_000_000, "2020-09-20", 0.5);
    const { ab, ba } = bothOrders("2023-03-20", partial, N_USER());
    expect([ab.totalTax, ba.totalTax]).toEqual([537_339_000, 537_339_000]);
  });

  it("§155⑳ 적용 자산(나중 취득 토지 없음, 배율 초과 있음) + 짝 비사업용 토지: 양 순서 499,986,142", () => {
    const rhe = housePart({ S: 1_500_000_000, T: "2020-09-15", bld: "2005-09-15", land: "2005-09-15", lp: 0.8, area: 700, res: 120, oneHH: true, hh: 1, rhe: true });
    const single = calculateTransferTax(rhe, rates);
    expect(single.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(single.splitDetail?.laterLandPart).toBeUndefined();
    const { ab, ba } = bothOrders("2020-09-15", rhe, nblLand("2020-09-15", 1_200_000_000, 300_000_000, "2014-08-15"));
    expect([ab.totalTax, ba.totalTax]).toEqual([499_986_142, 499_986_142]);
  });

  it("DOWN-3: 배율 초과분 없는 비주택 토지·건물 split + 짝 비사업용 12억/3억 — 산출 979,160,000 유지(범위 밖: B-ALL 확장 금지)", () => {
    // 토지 1년6월 2.5억/2억, 건물 5년 19억/3억, 2020-09-15. 배율 초과분이 없으므로 이 수정은 건드리지 않는다.
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
      expect(r.calculatedTax).toBe(979_160_000);
      expect(r.totalTax).toBe(1_077_076_000);
    }
  });
});

describe("보류 — 이번 범위 밖 (사용자 결정으로 분리)", () => {
  // ① B-ALL 확장: 배율 초과분이 없는 토지·건물 split(다른 호 유형)까지 파트를 남기면 gate 7(`transfer-tax-split-rate.ts` 세율 동일 합산)과
  //    Q3 합산 단위 키가 어긋나 새 불연속이 생긴다. 별건으로 재검토한다.
  it.todo("배율 초과분 없는 토지·건물 split(DOWN-3 유형)도 파트를 남겨 호별 합산되는가 — gate 7 · Q3 키 정합 후");
  // ② D1: `classifyRateGroup`이 자산 승자(rateGroup)를 따르는 경계 — P 양도가 1,602,397,704 → 1,602,397,705에서 164,015,074 → 146,457,311.
  //    rateGroup 승자 의존이라 이 수정으로는 사라지지 않는다. 별건으로 재검토한다.
  it.todo("D1 경계: P 양도가 1,602,397,704 → 1,602,397,705에서 164,015,074 → 146,457,311 (rateGroup 승자 의존)");
  // ③ D1 그룹 경계: 위 가드 셀(P progressive 그룹 · Q non_business_land 그룹)의 오라클 정답은 8호 버킷을 그룹 너머 합산한 산출 826,219,999다.
  //    현행(가드로 자산 단위 유지)은 818,960,000 — 정답과의 차이는 D1(classifyRateGroup이 자산 승자를 따름) 재검토에서 다룬다.
  it.todo("가드 셀 [P,Q]: 8호 버킷을 rateGroup 너머 합산해 산출 826,219,999 (현행 818,960,000 — D1 별건)");
});
