/**
 * US-10 · US-11 anchor — 양도소득세 누진세율표 연혁(소득세법 §55①) · 장기보유특별공제 표1 연혁(§95② 표1)
 *
 * 법령상 값은 시행본 원문(KoreanLaw MST 94271·98343·131369·149361·188354·199742·202803, 2026-11-09 대조)의 구간 정액에서
 * 이 파일이 독립적으로 구간 누적식으로 계산한다(seed의 누진공제 상수에 의존하지 않는다).
 */
import { describe, it, expect } from "vitest";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateProgressiveTax } from "@/lib/tax-engine/tax-utils";
import { parseProgressiveRate } from "@/lib/tax-engine/schemas/rate-table.schema";
import { table1RateAt, table1StepRate } from "@/lib/tax-engine/data/lthd-table1-era";
import { calcLongTermRate } from "@/lib/tax-engine/transfer-tax-mixed-use-inheritance";
import { computeLthdRateSplit } from "@/lib/tax-engine/redevelopment-lthd-table2";
import {
  SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE,
  TRANSFER_RATE_ERA_UNSUPPORTED_NOTICE,
} from "@/lib/tax-engine/transfer-tax-rate-era-notice";
import { LTHD_TABLE1_UNSUPPORTED_NOTICE } from "@/lib/tax-engine/data/lthd-table1-era";
import { baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

/** 구간 상한(원)과 세율로 법정 누적식 계산 — 마지막 구간은 상한 Infinity. */
function statutory(taxBase: number, steps: ReadonlyArray<readonly [number, number]>): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of steps) {
    if (taxBase <= upper) return tax + Math.floor((taxBase - lower) * rate);
    tax += Math.floor((upper - lower) * rate);
    lower = upper;
  }
  throw new Error("unreachable");
}
const M = 1_000_000;
const T_2008 = [[10 * M, 0.09], [40 * M, 0.18], [80 * M, 0.27], [Infinity, 0.36]] as const;
const T_2009 = [[12 * M, 0.06], [46 * M, 0.16], [88 * M, 0.25], [Infinity, 0.35]] as const;
const T_2010 = [[12 * M, 0.06], [46 * M, 0.15], [88 * M, 0.24], [Infinity, 0.35]] as const;
const T_2012 = [[12 * M, 0.06], [46 * M, 0.15], [88 * M, 0.24], [300 * M, 0.35], [Infinity, 0.38]] as const;
const T_2014 = [[12 * M, 0.06], [46 * M, 0.15], [88 * M, 0.24], [150 * M, 0.35], [Infinity, 0.38]] as const;
const T_2017 = [[12 * M, 0.06], [46 * M, 0.15], [88 * M, 0.24], [150 * M, 0.35], [500 * M, 0.38], [Infinity, 0.40]] as const;
const T_2018 = [[12 * M, 0.06], [46 * M, 0.15], [88 * M, 0.24], [150 * M, 0.35], [300 * M, 0.38], [500 * M, 0.40], [Infinity, 0.42]] as const;

/** 양도일에 선택되는 progressive_rate 행으로 산출세액을 구한다(엔진과 같은 `calculateProgressiveTax`). */
function seedTax(transferDate: string, taxBase: number): number {
  const row = loadFallbackTransferRates(D(transferDate)).get("transfer:progressive_rate:_default") as
    | { rateTable: unknown }
    | undefined;
  const { brackets } = parseProgressiveRate(row?.rateTable);
  return calculateProgressiveTax(taxBase, brackets);
}

describe("US-10 누진세율 연혁 — 행 선택(effective_date ≤ 양도일 중 최신)과 법정표", () => {
  // 과세표준 397,500,000 — 리뷰 US-10 시나리오 ①(법령상 2010 산출세액 124,225,000)
  const TB = 397_500_000;

  it("2010 시행본: 과표 397,500,000 → 124,225,000 (종전 seed 133,600,000)", () => {
    expect(statutory(TB, T_2010)).toBe(124_225_000);
    expect(seedTax("2010-12-01", TB)).toBe(124_225_000);
    expect(seedTax("2009-12-31", TB)).not.toBe(124_225_000); // 2009 표 (6/16/25/35)
  });

  it.each([
    // [양도일 전날, 시행일 당일, 전날 표, 당일 표, 과세표준]
    ["2008-03-20", "2008-03-21", null, T_2008, TB],
    ["2008-12-31", "2009-01-01", T_2008, T_2009, TB],
    ["2009-12-31", "2010-01-01", T_2009, T_2010, TB],
    ["2011-12-31", "2012-01-01", T_2010, T_2012, TB],
    ["2013-12-31", "2014-01-01", T_2012, T_2014, TB],
    ["2016-12-31", "2017-01-01", T_2014, T_2017, 637_500_000],
    ["2017-12-31", "2018-01-01", T_2017, T_2018, 637_500_000],
  ] as const)("시행일 경계 %s ↔ %s", (before, onDay, beforeTable, onTable, tb) => {
    if (beforeTable) expect(seedTax(before, tb)).toBe(statutory(tb, beforeTable));
    expect(seedTax(onDay, tb)).toBe(statutory(tb, onTable));
  });

  it("원 단위 법령상 값 (과표 397,500,000 / 637,500,000)", () => {
    expect(seedTax("2008-03-21", 397_500_000)).toBe(131_400_000);
    expect(seedTax("2009-01-01", 397_500_000)).toBe(124_985_000);
    expect(seedTax("2012-01-01", 397_500_000)).toBe(127_150_000);
    expect(seedTax("2014-01-01", 397_500_000)).toBe(131_650_000);
    expect(seedTax("2017-01-01", 397_500_000)).toBe(131_650_000);
    expect(seedTax("2015-06-01", 637_500_000)).toBe(222_850_000); // 2014~2016: 5억 초과도 38%
    expect(seedTax("2017-06-01", 637_500_000)).toBe(225_600_000); // 2017: 5억 초과 40%
    expect(seedTax("2018-01-01", 637_500_000)).toBe(232_350_000);
  });

  it("2008-03-20 이전 양도: 종전 근사 행 유지(미지원) — 133,600,000", () => {
    expect(seedTax("2008-03-20", 397_500_000)).toBe(133_600_000);
  });

  it("구간 경계 원 단위 — 2009 표 4,600만·8,800만, 2012 표 3억", () => {
    expect(seedTax("2009-06-01", 46 * M)).toBe(statutory(46 * M, T_2009));
    expect(seedTax("2009-06-01", 88 * M + 1_000)).toBe(statutory(88 * M + 1_000, T_2009));
    expect(seedTax("2012-06-01", 300 * M)).toBe(statutory(300 * M, T_2012));
    expect(seedTax("2012-06-01", 300 * M + 1_000)).toBe(statutory(300 * M + 1_000, T_2012));
  });

  it("엔진 통과: 일반 2주택(중과 없음) 산출세액 = 해당 양도일 법정표(과세표준 기준)", () => {
    const cases: Array<[string, ReadonlyArray<readonly [number, number]>]> = [
      ["2010-12-01", T_2010],
      ["2012-06-01", T_2012],
      ["2015-06-01", T_2014],
      ["2017-06-01", T_2017],
    ];
    for (const [transferDate, table] of cases) {
      const r = calculateTransferTax(
        baseTransferInput({
          transferPrice: 1_000_000_000,
          acquisitionPrice: 400_000_000,
          acquisitionDate: D("2005-03-01"),
          transferDate: D(transferDate),
          householdHousingCount: 2,
        }),
        loadFallbackTransferRates(D(transferDate)),
      );
      expect(r.calculatedTax).toBe(statutory(r.taxBase, table));
    }
  });
});

describe("US-11 장기보유특별공제 표1 연혁 leaf", () => {
  it("2018-12-31 단계표: 3년 10 · 4년 12 · 5년 15 · 6년 18 · 7년 21 · 8년 24 · 9년 27 · 10년 이상 30", () => {
    const d = D("2018-12-31");
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((y) => table1RateAt(y, d))).toEqual([
      0, 0.1, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27, 0.3, 0.3, 0.3,
    ]);
    expect(table1StepRate(3)).toBe(0.1);
  });

  it("2019-01-01 연 2%: 3년 6 … 15년 이상 30 (15년 30%)", () => {
    const d = D("2019-01-01");
    expect([3, 4, 9, 10, 14, 15, 20].map((y) => table1RateAt(y, d))).toEqual([0.06, 0.08, 0.18, 0.2, 0.28, 0.3, 0.3]);
  });

  it("양도일 생략은 현행(연 2%) — 종전 호출부와 같다", () => {
    expect(table1RateAt(4)).toBe(0.08);
    expect(calcLongTermRate(4, 0, false)).toBe(0.08);
  });

  it("2008-01-01 경계: 전날은 종전 식(미지원·고지), 당일부터 단계표", () => {
    expect(table1RateAt(4, D("2007-12-31"))).toBe(0.08);
    expect(table1RateAt(4, D("2008-01-01"))).toBe(0.12);
  });

  it("정본 calcLongTermRate · computeLthdRateSplit(표1)도 양도일 시행본을 따른다", () => {
    expect(calcLongTermRate(5, 0, false, false, D("2018-12-31"))).toBe(0.15);
    expect(calcLongTermRate(5, 0, false, false, D("2019-01-01"))).toBe(0.1);
    expect(computeLthdRateSplit(7, false, 0, 0, D("2018-12-31")).total).toBe(0.21);
    expect(computeLthdRateSplit(7, false, 0, 0, D("2019-01-01")).total).toBe(0.14);
  });
});

describe("US-11 엔진 — 양도차익 3억, 보유 6년(2012-06-15 취득), 일반 2주택", () => {
  const run = (transferDate: string) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: D("2012-06-15"),
        transferDate: D(transferDate),
        householdHousingCount: 2,
      }),
      loadFallbackTransferRates(D(transferDate)),
    );

  it("2018-12-31 양도: 표1 6년 18% = 54,000,000 (종전 12% 36,000,000)", () => {
    expect(run("2018-12-31").longTermHoldingDeduction).toBe(54_000_000);
  });
  it("2019-01-01 양도: 연 2% 6년 12% = 36,000,000", () => {
    expect(run("2019-01-01").longTermHoldingDeduction).toBe(36_000_000);
  });
});

describe("Q-30 (b) 미지원 고지 — 세액 불변", () => {
  const run = (transferDate: string, houses: number, propertyType: "building" | "housing" = "building", acq = "2000-01-10") =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: D(acq),
        transferDate: D(transferDate),
        householdHousingCount: houses,
        propertyType,
      }),
      loadFallbackTransferRates(D(transferDate)),
    );
  const warns = (transferDate: string, houses: number, propertyType: "building" | "housing" = "building") =>
    run(transferDate, houses, propertyType).warnings ?? [];

  it("2008-03-20 양도: 세율표 연혁 미지원 고지(표1은 2008-01-01 이후라 지원) / 2008-03-21부터는 없다", () => {
    const w = warns("2008-03-20", 2);
    expect(w).toContain(TRANSFER_RATE_ERA_UNSUPPORTED_NOTICE);
    expect(w).not.toContain(LTHD_TABLE1_UNSUPPORTED_NOTICE);
    expect(warns("2008-03-21", 2)).not.toContain(TRANSFER_RATE_ERA_UNSUPPORTED_NOTICE);
  });

  it("2007-12-31 양도: 표1 연혁 미지원 고지(장특 발생) / 2008-01-01은 없다", () => {
    expect(warns("2007-12-31", 2)).toContain(LTHD_TABLE1_UNSUPPORTED_NOTICE);
    expect(warns("2008-01-01", 2)).not.toContain(LTHD_TABLE1_UNSUPPORTED_NOTICE);
  });

  it("2009-01-01~03-15 양도 + 3주택 이상: 45% 미지원 고지 / 03-16·2주택·2008-12-31은 없다", () => {
    expect(warns("2009-01-01", 3, "housing")).toContain(SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE);
    expect(warns("2009-03-15", 3, "housing")).toContain(SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE);
    expect(warns("2009-03-16", 3, "housing")).not.toContain(SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE);
    expect(warns("2009-03-15", 2, "housing")).not.toContain(SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE);
    expect(warns("2008-12-31", 3, "housing")).not.toContain(SEC104_6_THREE_HOUSE_UNSUPPORTED_NOTICE);
  });
});
