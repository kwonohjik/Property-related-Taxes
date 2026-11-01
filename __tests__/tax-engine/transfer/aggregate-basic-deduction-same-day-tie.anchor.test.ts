/**
 * anchor: 다건 기본공제 — **같은 날 양도한 자산 사이**의 배분 순서(§103② 동순위).
 *
 * 계획서: docs/02-design/features/transfer-basic-deduction-same-day-tie.plan.md (A-1~A-6)
 *
 * 「소득세법」 §103②은 감면소득 외 → 먼저 양도한 자산 순을 정하지만 **같은 날**(선후 불분명) 양도한 자산 사이와
 * 감면소득 내부의 순서는 정하지 않는다. 국세청 해석이 그 자리를 정한다:
 *   · 재일46014-1685(1997.7.11.) — 어느 부동산을 먼저 양도했는지 불분명하면 **납세자에게 유리하다고 판단되는**
 *     양도자산의 양도소득금액에서부터 순차로 공제.
 *   · 부동산거래관리과-0893(2011.10.20.) — 감면율이 다른 자산을 같은 날 양도하면 **감면율이 낮은** 양도소득금액에서
 *     먼저 공제.
 *
 * 「유리」의 판정(사용자 결정 Q-1): 총 부담(`totalTax`) 최소 → 결정세액 최소 → `propertyId` 순.
 * A-1·A-3은 그 정의를 그대로 단언한다 — 입력 순서대로 배분하는 `FIRST` 전략으로 두 순서를 각각 계산해 작은 쪽과 같아야 한다.
 * A-2·A-4는 기대값을 독립 산식으로 도출했다(모의 세율표 — 누진 8구간, 2023년 이후 누진공제).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function prog(base: number): number {
  const t: [number, number, number][] = [
    [14_000_000, 0.06, 0], [50_000_000, 0.15, 1_260_000], [88_000_000, 0.24, 5_760_000], [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000], [500_000_000, 0.4, 25_940_000], [1_000_000_000, 0.42, 35_940_000], [Infinity, 0.45, 65_940_000],
  ];
  const [, r, d] = t.find(([ub]) => base <= ub)!;
  return Math.floor(base * r) - d;
}
const div = (a: number, n: number, d: number) => Number((BigInt(a) * BigInt(n)) / BigInt(d));

function item(id: string, T: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D(T),
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    ...o,
  };
}
const run = (props: TransferTaxItemInput[], strategy?: "FIRST") =>
  calculateTransferTaxAggregate(
    {
      taxYear: props[0].transferDate.getFullYear(),
      annualBasicDeductionUsed: 0,
      properties: props,
      ...(strategy ? { basicDeductionAllocation: strategy } : {}),
    },
    rates,
  );
const allocOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.properties.map((p) => [p.propertyId, p.allocatedBasicDeduction]));
const cardOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.groupTaxes.map((g) => [g.group, g.groupCalculatedTax]));

describe("A-1 — 같은 날 사업용 토지 + 단기 토지: 입력 순서와 무관하게 유리한 순서", () => {
  // 2026-06-01 양도. A: 3.5억 / 3억 · 2015 → 장특 22% · 소득 39,000,000 · 1호.
  // Z: 3.5억 / 3억 · 2025-01-10 → 소득 50,000,000 · 1~2년 40%. id는 A가 앞이라 propertyId 순이면 A로 간다.
  //   A에 공제: prog(36,500,000) 4,215,000 + 20,000,000 = 24,215,000 × 1.1 = 26,636,500
  //   Z에 공제: prog(39,000,000) 4,590,000 + 19,000,000 = 23,590,000 × 1.1 = 25,949,000
  const T = "2026-06-01";
  const A = () => item("A", T, { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01") });
  const Z = () => item("Z", T, { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2025-01-10") });

  it("두 순서의 후보(FIRST) 중 총 부담이 작은 쪽 — Z에 공제 · 총 25,949,000", () => {
    const aFirst = run([A(), Z()], "FIRST").totalTax;
    const zFirst = run([Z(), A()], "FIRST").totalTax;
    expect([aFirst, zFirst]).toEqual([26_636_500, 25_949_000]);
    for (const r of [run([A(), Z()]), run([Z(), A()])]) {
      expect(r.totalTax).toBe(25_949_000);
      expect(allocOf(r)).toEqual({ A: 0, Z: 2_500_000 });
    }
  });
});

describe("A-2 — 세액이 같으면 propertyId 순으로 정해 세율군 카드도 입력 순서와 무관하다", () => {
  // 2020-09-15 양도. H: 주택 5억 / 3억 · 취득 2019-03-15(1년 6월 — 2021.6.1. 전이라 §104①1호 기본세율 · 단기 세율군).
  // G: 사업용 토지 6억 / 3억 · 취득 2015-01-01(5년 — 장기보유특별공제 10%) → 1호 · 누진 세율군.
  //   두 자산의 1호가 한 버킷이라 누구에게 공제해도 총세액은 같다: prog(200,000,000 + 270,000,000 − 2,500,000) = 161,060,000.
  //   카드만 갈린다 — 세액이 같으므로 propertyId 순(G < H)으로 G에 공제한다.
  //   단기 카드 = floor(161,060,000 × 200,000,000 / 467,500,000) · 누진 카드 = 나머지.
  const T = "2020-09-15";
  const H = () => item("H", T, { propertyType: "housing", householdHousingCount: 2, transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2019-03-15") });
  const G = () => item("G", T, { transferPrice: 600_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"), isNonBusinessLand: false });

  it("독립 산식: 버킷 161,060,000 · 단기 68,902,673 · 누진 92,157,327", () => {
    expect(prog(467_500_000)).toBe(161_060_000);
    expect(div(161_060_000, 200_000_000, 467_500_000)).toBe(68_902_673);
  });

  it("[H,G] = [G,H]: G에 공제 · 카드 단기 68,902,673 / 누진 92,157,327", () => {
    for (const r of [run([H(), G()]), run([G(), H()])]) {
      expect(r.totalTax).toBe(run([G(), H()], "FIRST").totalTax);
      expect(r.calculatedTax).toBe(161_060_000);
      expect(allocOf(r)).toEqual({ H: 0, G: 2_500_000 });
      expect(cardOf(r)).toEqual({ short_term: 68_902_673, progressive: 92_157_327 });
    }
  });
});

describe("A-3 — 부분 비사업용 + 비사업용: 파트 안 기본공제가 세율 높은 파트로 가면 두 후보의 세액이 같다", () => {
  // 2026-06-01 양도. P: 13억 / 3억 · 2015 · 면적 50% 비사업용. N: 비사업용 토지 5억 / 3억 · 2017-02-20.
  // P의 비사업용 파트와 N은 8호 한 버킷이라 어느 쪽에서 공제해도 8호 과세표준에서 빠진다.
  // 종전에는 P에 주면 파트 비율로 나뉘어 1호 파트까지 줄어 419,155,000 · N에 주면 418,990,000이었다.
  const T = "2026-06-01";
  const P = () => item("P", T, { transferPrice: 1_300_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"), isNonBusinessLand: true, nonBusinessLandAreaRatio: 0.5 } as Partial<TransferTaxItemInput>);
  const N = () => item("N", T, { transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2017-02-20"), isNonBusinessLand: true });

  it("후보 모두 418,990,000 — 양 순서 동일", () => {
    expect([run([P(), N()], "FIRST").totalTax, run([N(), P()], "FIRST").totalTax]).toEqual([418_990_000, 418_990_000]);
    expect(run([P(), N()]).totalTax).toBe(418_990_000);
    expect(run([N(), P()]).totalTax).toBe(418_990_000);
    expect(allocOf(run([P(), N()]))).toEqual(allocOf(run([N(), P()])));
  });
});

describe("A-4 — 감면율이 다른 감면소득을 같은 날 양도: 감면율이 낮은 소득에서 먼저 공제(부동산거래관리과-0893)", () => {
  // 2026-06-01 양도. 비감면소득 없음.
  //   F: 자경농지 4억 / 3억 · 2010-06-01 → 장특 30% · 소득 70,000,000 · 감면 100%
  //   X: 공익수용 5억 / 3억 · 2010-06-01 · 현금보상 5억 → 장특 30% · 소득 140,000,000 · 감면 15%
  //   과세표준 D = 210,000,000 − 2,500,000 = 207,500,000 · 산출 A = prog(207,500,000) = 58,910,000
  //   기본공제 C 2,500,000은 전부 감면율이 낮은 X에서:
  //     자경 = A × 70,000,000 / D = 19,873,253
  //     수용 = A × (140,000,000 − 2,500,000) × 15% / D = A × 20,625,000 / D = 5,855,512
  //   종전에는 C를 감면대상소득 비중(833,333 / 1,666,666)으로 나눠 19,636,666 + 5,891,000 = 25,527,666이었다.
  const T = "2026-06-01";
  const E77 = { type: "public_expropriation", cashCompensation: 500_000_000, bondCompensation: 0, businessApprovalDate: D("2018-01-01") };
  const F = () => item("F", T, { transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [{ type: "self_farming", farmingYears: 10 }] } as Partial<TransferTaxItemInput>);
  const X = () => item("X", T, { transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [E77] } as Partial<TransferTaxItemInput>);
  const A = prog(207_500_000);

  it("독립 산식: 산출 58,910,000 · 자경 19,873,253 · 수용 5,855,512", () => {
    expect(A).toBe(58_910_000);
    expect(div(A, 70_000_000, 207_500_000)).toBe(19_873_253);
    expect(div(A, 20_625_000, 207_500_000)).toBe(5_855_512);
  });

  it("[F,X] = [X,F]: X에 공제 · 감면 25,728,765", () => {
    for (const r of [run([F(), X()]), run([X(), F()])]) {
      expect(r.calculatedTax).toBe(A);
      expect(allocOf(r)).toEqual({ F: 0, X: 2_500_000 });
      const byType = Object.fromEntries(r.reductionBreakdown.map((b) => [b.type, b.rawAggregateReduction]));
      expect(byType).toEqual({ self_farming: 19_873_253, public_expropriation: 5_855_512 });
      expect(r.reductionAmount).toBe(19_873_253 + 5_855_512);
    }
  });
});

describe("A-4b — 감면율이 낮은 쪽이 한계세율도 낮아도 감면율이 기준이다", () => {
  // A-4와 반대로 자경농지 F의 소득이 크다(6억 / 3억 → 장특 30% · 210,000,000) · 수용 X는 작다(4억 / 3억 → 70,000,000).
  // 종전 동순위 기준(단독 적용세율 내림차순)이면 F가 먼저라 100% 감면소득에서 공제가 빠진다.
  // ⚠️ 자경 감면이 조특법 §133 연간 한도(1억)에 걸리는 금액이면 F에서 빼도 감면이 줄지 않아 해석례 순서가 오히려 불리하다
  //   (실측 F 8억: 103,420,916 < 103,547,616). 그때는 한도 적용 후 세액으로 순서를 정한다(사용자 결정 2026-10-16 —
  //   `aggregate-basic-deduction-133-cap-order.anchor.test.ts` C-1). 여기서는 한도에 걸리지 않는 금액으로 감면율 기준만 고정한다.
  const T = "2026-06-01";
  const E77 = { type: "public_expropriation", cashCompensation: 400_000_000, bondCompensation: 0, businessApprovalDate: D("2018-01-01") };
  const F = () => item("F", T, { transferPrice: 600_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [{ type: "self_farming", farmingYears: 10 }] } as Partial<TransferTaxItemInput>);
  const X = () => item("X", T, { transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [E77] } as Partial<TransferTaxItemInput>);

  it("[F,X] = [X,F]: X에 공제 — F에 주는 후보(FIRST [F,X])보다 감면이 크다", () => {
    const fFirst = run([F(), X()], "FIRST");
    expect(allocOf(fFirst)).toEqual({ F: 2_500_000, X: 0 });
    for (const r of [run([F(), X()]), run([X(), F()])]) {
      expect(allocOf(r)).toEqual({ F: 0, X: 2_500_000 });
      expect(r.reductionAmount).toBeGreaterThan(fFirst.reductionAmount);
    }
  });
});

describe("A-5 — 양도일이 다르면 유리 판정 없이 먼저 양도한 자산부터(§103② 명문)", () => {
  // A-1의 A를 먼저 양도 — Z에 주는 쪽이 유리해도 A가 먼저다.
  const A = () => item("A", "2026-03-01", { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01") });
  const Z = () => item("Z", "2026-06-01", { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2025-01-10") });

  it("양 순서 모두 A에 공제 — Z에 주는 후보보다 총 부담이 커도 그렇다", () => {
    const aFirst = run([A(), Z()], "FIRST").totalTax;
    const zFirst = run([Z(), A()], "FIRST").totalTax;
    expect(aFirst).toBeGreaterThan(zFirst);
    for (const r of [run([A(), Z()]), run([Z(), A()])]) {
      expect(allocOf(r)).toEqual({ A: 2_500_000, Z: 0 });
      expect(r.totalTax).toBe(aFirst);
    }
  });
});

describe("A-6 — 같은 날이어도 감면소득 외가 먼저(§103② 1단계) — 유리 판정은 그 안에서만", () => {
  // A-4의 두 감면 자산 + 같은 날 사업용 토지 B(감면 없음). 기본공제는 B가 전부 흡수한다.
  const T = "2026-06-01";
  const E77 = { type: "public_expropriation", cashCompensation: 500_000_000, bondCompensation: 0, businessApprovalDate: D("2018-01-01") };
  const F = () => item("F", T, { transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [{ type: "self_farming", farmingYears: 10 }] } as Partial<TransferTaxItemInput>);
  const X = () => item("X", T, { transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [E77] } as Partial<TransferTaxItemInput>);
  const B = () => item("B", T, { transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"), isNonBusinessLand: false });

  it("세 순서 모두 B에 공제", () => {
    for (const props of [[F(), X(), B()], [B(), X(), F()], [X(), B(), F()]]) {
      expect(allocOf(run(props))).toEqual({ F: 0, X: 0, B: 2_500_000 });
    }
  });
});

describe("D-5 — 계산 과정 「기본공제」 단계에 같은 날 처리 근거를 남긴다(동순위가 없으면 종전 문구)", () => {
  const stepOf = (r: ReturnType<typeof run>) => r.steps.find((s) => s.label === "기본공제")?.formula ?? "";
  const FAVORABLE = "같은 날 양도 — 납세자에게 유리한 순서(재일46014-1685)";
  const LOWER_RATE = "같은 날 감면소득 — 감면율 낮은 소득부터(부동산거래관리과-0893)";
  const E77 = { type: "public_expropriation", cashCompensation: 500_000_000, bondCompensation: 0, businessApprovalDate: D("2018-01-01") };

  it("같은 날 비감면 자산 2건 — 유리한 순서 문구", () => {
    const T = "2026-06-01";
    const r = run([
      item("A", T, { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01") }),
      item("Z", T, { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2025-01-10") }),
    ]);
    expect(stepOf(r)).toContain(FAVORABLE);
    expect(stepOf(r)).not.toContain(LOWER_RATE);
  });

  it("같은 날 감면율이 다른 감면소득 — 감면율 낮은 소득부터 문구", () => {
    const T = "2026-06-01";
    const r = run([
      item("F", T, { transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [{ type: "self_farming", farmingYears: 10 }] } as Partial<TransferTaxItemInput>),
      item("X", T, { transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [E77] } as Partial<TransferTaxItemInput>),
    ]);
    expect(stepOf(r)).toContain(LOWER_RATE);
    expect(stepOf(r)).not.toContain(FAVORABLE);
  });

  it("FIRST(입력 순서) — 같은 날 다른 자산끼리는 입력 순서로 배분하므로 감면율 문구를 남기지 않는다", () => {
    const T = "2026-06-01";
    const F = () => item("F", T, { transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [{ type: "self_farming", farmingYears: 10 }] } as Partial<TransferTaxItemInput>);
    const X = () => item("X", T, { transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [E77] } as Partial<TransferTaxItemInput>);
    for (const props of [[F(), X()], [X(), F()]]) {
      const r = run(props, "FIRST");
      expect(allocOf(r)[props[0].propertyId]).toBe(2_500_000);
      expect(stepOf(r)).not.toContain(LOWER_RATE);
    }
  });

  it("FIRST — 한 자산 안의 현금분·채권분(감면율이 다르다)은 감면율 낮은 것부터라 문구를 남긴다", () => {
    const XB = item("XB", "2026-06-01", {
      transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"),
      reductions: [{ ...E77, cashCompensation: 250_000_000, bondCompensation: 250_000_000 }],
    } as Partial<TransferTaxItemInput>);
    expect(stepOf(run([XB], "FIRST"))).toContain(LOWER_RATE);
    expect(stepOf(run([XB]))).toContain(LOWER_RATE);
  });

  it("양도일이 다르면 두 문구 모두 없다 — 종전 문구 그대로", () => {
    const r = run([
      item("A", "2026-03-01", { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01") }),
      item("Z", "2026-06-01", { transferPrice: 350_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2025-01-10") }),
    ]);
    expect(stepOf(r)).toBe("연 한도 2,500,000 - 기사용 0 = 2,500,000 (감면 외 소득 → 양도일이 빠른 자산 (소득세법 §103②) 배분)");
  });
});
