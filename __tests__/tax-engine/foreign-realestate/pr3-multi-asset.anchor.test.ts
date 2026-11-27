/**
 * PR-3 다건 anchor — 한 과세기간 여러 건: 기본공제 1회(§118의7②) · 합산 후 누진 1회(§118의5①) · 같은 과세기간 · 자산별 몫.
 * 기대값은 엔진 코드를 쓰지 않은 손계산(§55① 2023~ 표, 계획서 엔진 K-14와 같은 값).
 *
 * 시료: 자산 a(양도 2026-07-10, 양도차익 437,000,000) + 자산 b(양도 2026-03-05, 양도차익 100,000,000).
 *   합 537,000,000 − 기본공제 2,500,000 = 과세표준 534,500,000 → 5억 초과 10억 이하 42% − 35,940,000 = 188,550,000
 *   지방소득세 = 534,500,000 × 42/1000 − 35,940,000 ÷ 10 = 22,449,000 − 3,594,000 = 18,855,000
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { aAsset, bAsset, k1Input, ratesAt, d, usd } from "./_fixtures";

const rates = ratesAt("2026-07-10");
const run = (assets = [aAsset(), bAsset()]) => calc(k1Input({ assets }), rates);

describe("PR-3 다건 합산 (K-14)", () => {
  it("2건: 기본공제는 합계에서 1회만 — 과세표준 534,500,000 · 산출세액 188,550,000 · 지방소득세 18,855,000", () => {
    const r = run();
    expect(r.rows.map((x) => x.capitalGain)).toEqual([437_000_000, 100_000_000]);
    expect(r.incomeAmountTotal).toBe(537_000_000);
    expect(r.basicDeduction).toBe(2_500_000); // 자산마다 250만이면 5,000,000
    expect(r.taxBase).toBe(534_500_000);
    expect(r.appliedRate).toBe(0.42);
    expect(r.progressiveDeduction).toBe(35_940_000);
    expect(r.calculatedTax).toBe(188_550_000);
    expect(r.localIncomeTax).toBe(18_855_000);
    expect(r.totalTax).toBe(207_405_000);
    expect(r.appliedLawDate).toBe("2026-07-10"); // 가장 늦은 양도일
  });

  it("합산 후 누진 1회 — 자산마다 따로 세율·기본공제를 적용한 합 166,545,000(147,860,000 + 18,685,000)과 다르다", () => {
    const r = run();
    expect(147_860_000 + 18_685_000).toBe(166_545_000); // a 과세표준 434,500,000 · b 97,500,000을 각각 §55①
    expect(r.calculatedTax).toBe(188_550_000);
  });

  it("거주 5년 미만이면 다건이어도 전부 비과세 대상 아님(세액 0) — 행은 echo", () => {
    const r = calc(k1Input({ domesticResidenceYears: 4, assets: [aAsset(), bAsset()] }), rates);
    expect(r.taxCategory).toBe("not_liable");
    expect(r.rows).toHaveLength(2);
    expect([r.calculatedTax, r.localIncomeTax, r.totalTax]).toEqual([0, 0, 0]);
  });
});

describe("§118의7② 기본공제 순서 — 먼저 양도한 자산부터", () => {
  it("b가 먼저 양도(3/5 < 7/10): 기본공제 2,500,000 전부 b 몫", () => {
    const r = run();
    const [a, b] = r.rows;
    expect([a.id, a.basicDeductionAllocated, a.taxBaseAllocated]).toEqual(["a", 0, 437_000_000]);
    expect([b.id, b.basicDeductionAllocated, b.taxBaseAllocated]).toEqual(["b", 2_500_000, 97_500_000]);
  });

  it("양도일을 맞바꾸면(a가 먼저) 기본공제는 a 몫 — 같은 합계, 다른 자산별 몫", () => {
    const r = run([
      aAsset({ transferDate: d("2026-03-05"), transfer: usd(900_000, "2026-03-05", 1_100), transferCosts: [usd(30_000, "2026-03-05", 1_100)] }),
      bAsset({ transferDate: d("2026-07-10"), transfer: usd(300_000, "2026-07-10", 1_200) }),
    ]);
    const [a, b] = r.rows;
    expect([a.basicDeductionAllocated, a.taxBaseAllocated]).toEqual([2_500_000, 434_500_000]);
    expect([b.basicDeductionAllocated, b.taxBaseAllocated]).toEqual([0, 100_000_000]);
    expect(r.taxBase).toBe(534_500_000);
    expect(r.calculatedTax).toBe(188_550_000); // 순서는 합계 세액을 바꾸지 않는다
  });

  it("먼저 양도한 자산의 소득금액이 250만원보다 작으면 남은 공제를 다음 자산에서: b 소득 1,000,000 → b 1,000,000 + a 1,500,000", () => {
    const r = run([aAsset(), bAsset({}, 261_000, 1_000)]); // b 양도가액 261,000,000 − 취득 260,000,000 = 1,000,000
    const [a, b] = r.rows;
    expect(b.incomeAmount).toBe(1_000_000);
    expect([b.basicDeductionAllocated, b.taxBaseAllocated]).toEqual([1_000_000, 0]);
    expect([a.basicDeductionAllocated, a.taxBaseAllocated]).toEqual([1_500_000, 435_500_000]);
    expect(r.basicDeduction).toBe(2_500_000);
    expect(r.taxBase).toBe(435_500_000);
    expect(r.calculatedTax).toBe(148_260_000); // 5억 이하 40% − 25,940,000
    expect(r.localIncomeTax).toBe(14_826_000);
  });

  it("같은 날 양도는 입력 순서", () => {
    const r = run([
      aAsset({ transferDate: d("2026-07-10") }),
      bAsset({ transferDate: d("2026-07-10") }),
    ]);
    expect(r.rows[0].basicDeductionAllocated).toBe(2_500_000);
    expect(r.rows[1].basicDeductionAllocated).toBe(0);
  });

  it("전체 소득금액이 250만원 이하면 공제는 소득금액까지만(과세표준 0)", () => {
    const r = run([bAsset({}, 261_000, 1_000), { ...bAsset({}, 261_200, 1_000), id: "b2", transferDate: d("2026-04-01"), transfer: usd(261_200, "2026-04-01", 1_000) }]);
    expect(r.incomeAmountTotal).toBe(2_200_000);
    expect(r.basicDeduction).toBe(2_200_000);
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });
});

describe("같은 과세기간·입력 검증", () => {
  it("양도일 연도가 다르면 거부(K-16) — 경로 assets[1].transferDate", () => {
    const e = (() => {
      try {
        run([aAsset(), bAsset({ transferDate: d("2025-12-31"), transfer: usd(300_000, "2025-12-31", 1_200) })]);
      } catch (x) {
        return x as TaxCalculationError;
      }
    })();
    expect(e).toBeInstanceOf(TaxCalculationError);
    expect(e?.details?.path).toBe("assets[1].transferDate");
    expect(e?.details?.reason).toBe("TAX_YEAR_MISMATCH");
  });

  it("12-31과 01-01은 서로 다른 과세기간", () => {
    expect(() =>
      run([
        bAsset({ id: "x", transferDate: d("2025-12-31"), transfer: usd(300_000, "2025-12-31", 1_200) }),
        bAsset({ id: "y", transferDate: d("2026-01-01"), transfer: usd(300_000, "2026-01-01", 1_200) }),
      ]),
    ).toThrow(/같은 과세기간/);
  });

  it("2건 중 한 건이 지원 개시 전(2019-12-31)이어도 거부 — 자산 경로를 싣는다", () => {
    expect(() =>
      run([
        aAsset(),
        bAsset({ transferDate: d("2019-12-31"), acquisitionDate: d("2018-01-01"), transfer: usd(300_000, "2019-12-31", 1_200) }),
      ]),
    ).toThrow(/assets\[1\]\.transferDate: 양도일 2020-01-01/);
  });
});
