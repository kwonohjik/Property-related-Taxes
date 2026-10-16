/**
 * anchor: 다건 기본공제 — 같은 날 감면소득 사이 순서가 **조특법 §133 감면 한도**에 걸릴 때.
 *
 * 계획서: docs/02-design/features/transfer-basic-deduction-133-cap-order.plan.md (C-1~C-6)
 *
 * 부동산거래관리과-0893은 같은 날 감면율이 다르면 「감면율 낮은 소득부터」 공제한다. 그러나 감면율이 높은 쪽이 한도에
 * 걸리면 그쪽에서 공제해도 감면이 줄지 않아 0893 순서가 불리해진다. 사용자 결정(2026-10-16): 한도에 걸리면 **한도 적용 후
 * 세액**으로 순서를 정한다(재일46014-1685 — 납세자에게 유리한 순서). 0893 순서가 첫 후보라 한도가 안 걸리면 결과는 그대로다.
 *
 * 기대값은 독립 산식(모의 세율표 — 누진 8구간, 2023년 이후 누진공제)으로 도출했다.
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

type Prior = { year: number; type: string; amount: number }[];
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
const run = (props: TransferTaxItemInput[], opts: { strategy?: "FIRST"; prior?: Prior } = {}) =>
  calculateTransferTaxAggregate(
    {
      taxYear: props[0].transferDate.getFullYear(),
      annualBasicDeductionUsed: 0,
      properties: props,
      ...(opts.strategy ? { basicDeductionAllocation: opts.strategy } : {}),
      ...(opts.prior ? { priorReductionUsage: opts.prior } : {}),
    },
    rates,
  );
const allocOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.properties.map((p) => [p.propertyId, p.allocatedBasicDeduction]));
const stepOf = (r: ReturnType<typeof run>) => r.steps.find((s) => s.label === "기본공제")?.formula ?? "";

/** 자경농지(조특법 §69 · 100%) — 취득 2010-06-01 · 장기보유특별공제 30%. */
const F = (T: string, price: number) =>
  item("F", T, { transferPrice: price, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"), reductions: [{ type: "self_farming", farmingYears: 10 }] } as Partial<TransferTaxItemInput>);
/** 공익수용(조특법 §77 · 전액 현금보상) — 취득 2010-06-01 · 장기보유특별공제 30%. */
const X = (T: string, price: number) =>
  item("X", T, {
    transferPrice: price, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-06-01"),
    reductions: [{ type: "public_expropriation", cashCompensation: price, bondCompensation: 0, businessApprovalDate: D("2018-01-01") }],
  } as Partial<TransferTaxItemInput>);

const FAVORABLE_CAP = "같은 날 감면소득 — 조특법 §133 감면 한도를 반영해 납세자에게 유리한 순서(재일46014-1685)";
const LOWER_RATE = "같은 날 감면소득 — 감면율 낮은 소득부터(부동산거래관리과-0893)";

describe("C-1 — 자경 감면이 연간 한도(1억)에 걸리면 자경에서 공제하는 쪽이 유리하다", () => {
  // 2026-06-01 양도. F 8억 / 3억 → 소득 350,000,000 · X 4억 / 3억 → 70,000,000(현금 15%).
  //   D = 420,000,000 − 2,500,000 = 417,500,000 · A = prog(D) = 141,060,000.
  //   F에서 공제: 자경 원시 A × 347,500,000 / D = 117,409,221 → 한도 100,000,000 ·
  //               수용 A × 70,000,000 × 15% / D = A × 10,500,000 / D = 3,547,616.
  //   X에서 공제(0893): 자경 118,253,892 → 100,000,000 · 수용 A × 10,125,000 / D = 3,420,916.
  //   총 부담 = 결정세액 + 지방소득세 10% + 농어촌특별세(수용 감면 × 20%; 자경은 비과세).
  const T = "2026-06-01";
  const A = prog(417_500_000);
  const xOnF = div(A, 10_500_000, 417_500_000);
  const xOnX = div(A, 10_125_000, 417_500_000);
  const total = (red: number, ruralBase: number) => {
    const det = A - red;
    return det + Math.floor(det / 10) + Math.floor(ruralBase / 5);
  };

  it("독립 산식: 산출 141,060,000 · 후보 총 부담 41,973,145(F) < 42,087,175(X)", () => {
    expect(A).toBe(141_060_000);
    expect(div(A, 347_500_000, 417_500_000)).toBe(117_409_221);
    expect([xOnF, xOnX]).toEqual([3_547_616, 3_420_916]);
    expect(total(100_000_000 + xOnF, xOnF)).toBe(41_973_145);
    expect(total(100_000_000 + xOnX, xOnX)).toBe(42_087_175);
  });

  it("[F,X] = [X,F]: F에 공제 · 감면 103,547,616 · 총 부담 41,973,145", () => {
    for (const r of [run([F(T, 800_000_000), X(T, 400_000_000)]), run([X(T, 400_000_000), F(T, 800_000_000)])]) {
      expect(allocOf(r)).toEqual({ F: 2_500_000, X: 0 });
      expect(r.calculatedTax).toBe(A);
      expect(r.reductionAmount).toBe(100_000_000 + xOnF);
      expect(r.totalTax).toBe(41_973_145);
    }
  });
});

describe("C-3 — 연간 한도 밖이어도 5년 누적 한도에 걸리면 같은 판정이다", () => {
  // 2026-06-01 양도. F 6억 / 3억 → 210,000,000 · X 4억 / 3억 → 70,000,000.
  //   D = 277,500,000 · A = prog(D) = 85,510,000. 자경 원시 ≈ 6,400만(연 1억 미만)이지만 2023년 자경 감면 1.5억이 있어
  //   5년 한도(2억) 잔여 50,000,000에 걸린다(조특법 §133①2호나목).
  //   F에서 공제: 수용 A × 10,500,000 / D = 3,235,513 · X에서 공제: A × 10,125,000 / D = 3,119,958.
  const T = "2026-06-01";
  const prior: Prior = [{ year: 2023, type: "self_farming", amount: 150_000_000 }];
  const A = prog(277_500_000);
  const xOnF = div(A, 10_500_000, 277_500_000);
  const det = A - 50_000_000 - xOnF;

  it("독립 산식: 산출 85,510,000 · 수용 3,235,513 · 총 부담 36,149,037", () => {
    expect(A).toBe(85_510_000);
    expect(xOnF).toBe(3_235_513);
    expect(det + Math.floor(det / 10) + Math.floor(xOnF / 5)).toBe(36_149_037);
  });

  it("[F,X] = [X,F]: F에 공제 · 감면 53,235,513 · 총 부담 36,149,037", () => {
    for (const r of [run([F(T, 600_000_000), X(T, 400_000_000)], { prior }), run([X(T, 400_000_000), F(T, 600_000_000)], { prior })]) {
      expect(allocOf(r)).toEqual({ F: 2_500_000, X: 0 });
      expect(r.reductionAmount).toBe(50_000_000 + xOnF);
      expect(r.totalTax).toBe(36_149_037);
    }
  });

  it("이력이 없으면 한도에 안 걸려 0893 그대로 — X에 공제", () => {
    expect(allocOf(run([F(T, 600_000_000), X(T, 400_000_000)]))).toEqual({ F: 0, X: 2_500_000 });
  });
});

describe("C-4 — 2024 양도(자경·수용이 §133①의 1억을 공유): 한도에 걸려도 0893 순서가 남는다", () => {
  // 공유 한도는 유형별 원시 감면 비중으로 나눠 깎인다 — F에서 공제하면 수용 몫이 커져 농어촌특별세만 는다
  // (실측 50,840,845 > 50,824,798). 감면 합계는 어느 쪽이든 1억이다.
  const T = "2024-06-01";
  it("[F,X] = [X,F]: X에 공제 · 감면 100,000,000 · 총 부담이 F에 공제한 후보(FIRST [F,X])보다 작다", () => {
    const fFirst = run([F(T, 800_000_000), X(T, 400_000_000)], { strategy: "FIRST" });
    expect(allocOf(fFirst)).toEqual({ F: 2_500_000, X: 0 });
    for (const r of [run([F(T, 800_000_000), X(T, 400_000_000)]), run([X(T, 400_000_000), F(T, 800_000_000)])]) {
      expect(allocOf(r)).toEqual({ F: 0, X: 2_500_000 });
      expect(r.reductionAmount).toBe(100_000_000);
      expect(r.totalTax).toBeLessThan(fFirst.totalTax);
    }
  });
});

describe("C-5 — 양도일이 다르면 한도에 걸려도 먼저 양도한 자산부터(§103② 명문)", () => {
  // C-1의 X를 한 달 먼저 양도 — F에서 공제하는 쪽이 유리해도 X가 먼저다.
  it("양 순서 모두 X에 공제 · 총 부담 42,087,175", () => {
    for (const r of [run([F("2026-06-01", 800_000_000), X("2026-05-01", 400_000_000)]), run([X("2026-05-01", 400_000_000), F("2026-06-01", 800_000_000)])]) {
      expect(allocOf(r)).toEqual({ F: 0, X: 2_500_000 });
      expect(r.totalTax).toBe(42_087_175);
    }
  });
});

describe("C-6 — 계산 과정 「기본공제」 문구: 한도 때문에 0893과 다른 순서를 택했을 때만 바뀐다", () => {
  it("C-1 사례 — 한도 반영 유리한 순서 문구 · 0893 문구 없음", () => {
    const s = stepOf(run([F("2026-06-01", 800_000_000), X("2026-06-01", 400_000_000)]));
    expect(s).toContain(FAVORABLE_CAP);
    expect(s).not.toContain(LOWER_RATE);
  });

  it("한도가 안 걸리는 사례(PR #2220 A-4) — 종전 0893 문구 그대로", () => {
    const s = stepOf(run([F("2026-06-01", 400_000_000), X("2026-06-01", 500_000_000)]));
    expect(s).toContain(LOWER_RATE);
    expect(s).not.toContain(FAVORABLE_CAP);
  });
});
