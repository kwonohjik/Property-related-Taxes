/**
 * 이동평균법(lot) — 매도 후 잔고 축소를 부동소수로 하면 정수로 나누어떨어지는 평균이 1원 내려간다
 *
 * 계획서: docs/02-design/features/stock-valuation-details-moving-avg-81-4.plan.md §2.2·§6
 *
 * `matchMovingAvg`는 매도 뒤 모든 lot의 잔여를 같은 비율(after ÷ before)로 줄인다(평균 보존).
 * 그 비율을 부동소수로 곱하면 잔여가 424.99999…가 되고, 정확히는 31,897인 평균이 31,896으로 잘려
 * 그 1원이 매도 주식수만큼 곱해진다. 잔고 주식수는 늘 정수이고 비율은 유리수이므로 정확히 셀 수 있다.
 *
 *   MA-EXACT-1  734 매수 → 309 매도 → 100 매수 → 525 매도 — 2차 단가 31,897 (종전 31,896 · 취득가액 525 과소)
 *   MA-EXACT-2  실무형 수치(10주·100원 단위) — 2차 단가 47,010 (종전 47,009 · 500 과소)
 *   MA-EXACT-3  전량 매도 뒤 재매수 — 판 lot 가중치가 0으로 돌아가야 한다(정수 가중치 트랙의 초기화 지점)
 *   C1-EXACT-1  ① 채택 주식수가 정확히 593주(종전 592.9999…) — 개산공제 기준액 4,248,252 · 경고 문구 593주
 *   C1-EXACT-2  ① 몫이 진짜 분수(매도마다 ①/② 선택이 갈림) — 1,699/3주 · 기준액·실비 몫을 유리수 정답으로
 *   대조군      소수가 생기지 않는 이동평균(LC1-10 · B-3)은 `moving-avg-b3.test.ts`·`pre-deemed-lots-clause1.anchor.test.ts`가 지킨다
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { base } from "./pre-deemed-lots-fixture";

const D = (s: string) => new Date(s);

type Lot = [date: string, shares: number, perShare: number];
type Sale = [date: string, shares: number, perShare: number, std?: number];

function ma(acq: Lot[], trn: Sale[], o: Partial<StockTransferInput> = {}): StockTransferInput {
  return base({
    costAllocationMethod: "moving_avg",
    acquisitionDate: D(acq[0][0]),
    transferDate: D(trn[trn.length - 1][0]),
    shareCount: trn.reduce((s, t) => s + t[1], 0),
    acquisitionLots: acq.map(([d, n, p], i) => ({
      id: `a${i}`, acquisitionDate: D(d), shareCount: n, perShareAcquisitionPrice: p, acquisitionCause: "purchase" as const,
    })),
    transferLots: trn.map(([d, n, p, std], i) => ({
      id: `t${i}`, transferDate: D(d), shareCount: n, perShareTransferPrice: p,
      ...(std !== undefined ? { transferStdPricePerShare: std } : {}),
    })),
    ...o,
  } as Partial<StockTransferInput>);
}

const pricesBySale = (r: ReturnType<typeof calculateStockTransferTax>) =>
  [...new Map(r.lotMatchingDetail!.matched.map((m) => [m.saleDate.getTime(), m.perShareBuyPrice])).values()];

describe("MA-EXACT 이동평균 단가 — 매도 후 잔고 축소를 정확히", () => {
  it("MA-EXACT-1 2차 매도 단가 (425×23,013 + 100×69,654) ÷ 525 = 31,897 · 취득가액 23,856,942", () => {
    const r = calculateStockTransferTax(
      ma(
        [["2025-01-10", 734, 23_013], ["2025-03-10", 100, 69_654]],
        [["2025-02-10", 309, 24_151], ["2025-04-10", 525, 83_316]],
      ),
    );
    expect(pricesBySale(r)).toEqual([23_013, 31_897]);
    expect(r.acquisitionPrice).toBe(309 * 23_013 + 525 * 31_897);
  });

  it("MA-EXACT-2 실무형 수치 — (350×51,000 + 150×37,700) ÷ 500 = 47,010 · 취득가액 40,335,000", () => {
    const r = calculateStockTransferTax(
      ma(
        [["2025-01-10", 680, 51_000], ["2025-03-10", 150, 37_700]],
        [["2025-02-10", 330, 52_000], ["2025-04-10", 500, 53_000]],
      ),
    );
    expect(pricesBySale(r)).toEqual([51_000, 47_010]);
    expect(r.acquisitionPrice).toBe(40_335_000);
  });

  it("MA-EXACT-3 전량 매도 뒤 다시 매수 — 이미 판 lot 단가가 새 평균에 섞이지 않는다 (2차 단가 20,000)", () => {
    const r = calculateStockTransferTax(
      ma(
        [["2025-01-10", 100, 10_000], ["2025-03-10", 50, 20_000]],
        [["2025-02-10", 100, 12_000], ["2025-04-10", 50, 25_000]],
      ),
    );
    expect(pricesBySale(r)).toEqual([10_000, 20_000]);
    expect(r.acquisitionPrice).toBe(2_000_000);
  });
});

describe("C1-EXACT 의제취득일 전 매수 lot ① 정산 — 이동평균 풀 지분을 정확히", () => {
  it("C1-EXACT-1 ① 채택 137 + 775 × 456/775 = 593주 · 기준액 7,164 × 593 = 4,248,252 · 경고 593주", () => {
    const r = calculateStockTransferTax(
      ma(
        [["1982-08-11", 593, 313], ["2012-12-14", 319, 70_059]],
        [["2010-09-05", 137, 110_762, 35_481], ["2013-01-13", 775, 100_387, 38_496]],
        { preDeemedLotClause1: "estimated", acquisitionDatePriceAvg1Month: 7_164 },
      ),
    );
    const c = r.preDeemedLotsDetail!.clause1!;
    expect(c.clause1Shares).toBe(593);
    expect(c.otherShares).toBe(319);
    expect(c.settlement?.estimatedBase).toBe(4_248_252);
    expect(c.settlement?.estimatedDeduction).toBe(42_482);
    expect(r.warnings.some((w) => w.includes("① 의제취득일 현재 가액 채택 593주"))).toBe(true);
  });

  it("C1-EXACT-2 ①/② 선택이 매도마다 갈리면 ① 몫은 분수 — 1,699 × 899⅔/2,699 = 1,699/3주", () => {
    // A(의제 전) 1,000 · C 2,000 → 매도1 301주는 ① 10,000 < ② 12,910 이라 ② · 매도2 1,699주는 ① 40,000 > ② 라 ①
    const r = calculateStockTransferTax(
      ma(
        [["1980-06-01", 1_000, 10_000], ["2010-03-02", 2_000, 50_000]],
        [["2024-05-01", 301, 50_000, 100_000], ["2025-12-01", 1_699, 200_000, 100_000]],
        { preDeemedLotClause1: "estimated", acquisitionDatePriceAvg1Month: 20_000, actualExpenses: 1_000_000 },
      ),
    );
    const c = r.preDeemedLotsDetail!.clause1!;
    expect(c.clause1Shares).toBeCloseTo(1_699 / 3, 9);
    expect(c.soldShares).toBe(2_000);
    // 기준액 floor(20,000 × 1,699/3) = floor(11,326,666.6…) · 실비 몫 floor(1,000,000 × (1,699/3) ÷ 2,000) = floor(283,166.6…)
    expect(c.settlement?.estimatedBase).toBe(11_326_666);
    expect(c.settlement?.clause1SideActual).toBe(283_166);
    expect(c.settlement?.otherSideActual).toBe(1_000_000 - 283_166);
    // ① 취득가액 합 floor(1,699/3 × 40,000) = floor(22,653,333.3…)
    expect(c.clause1Amount).toBe(22_653_333);
  });

  it("결과는 JSON 왕복이 된다(BigInt 누출 없음 — 결과는 IndexedDB에 저장된다)", () => {
    const r = calculateStockTransferTax(
      ma(
        [["1980-06-01", 1_000, 10_000], ["2010-03-02", 2_000, 50_000]],
        [["2024-05-01", 301, 50_000, 100_000], ["2025-12-01", 1_699, 200_000, 100_000]],
        { preDeemedLotClause1: "estimated", acquisitionDatePriceAvg1Month: 20_000 },
      ),
    );
    expect(() => JSON.stringify(r)).not.toThrow();
  });
});
