/**
 * 분할·다건 lot ① 정산 × 단기(가목 1, 30%)·장기(가목 2) 세율 안분
 *
 * 과세표준을 단기·장기 그룹으로 나누는 비율(`calcSplitModeTax`)이 sub-lot **총이익**(양도가 − 취득가)이었다.
 * ① 정산(PR #2010)이 켜지면 필요경비가 그룹마다 다르다 — ① 채택분은 개산공제(영 §163⑥4), 그 외 몫은
 * 양도 주식수 비례 실비(사용자 결정 A안), 단서 swap 이면 ① 환산 취득가액이 빠진다. 그런데 안분은 그것을
 * 보지 않아 단기 그룹 몫이 틀렸다(과세표준 합계는 맞고 세율 배분만 틀린 조용한 오류).
 *
 * 공통: 코스피 대주주(비중소) · 양도 2025-12-01 2,000주 × 200,000 · 양도 당시 기준시가 100,000
 *   A 1980-06 1,000주 × 10,000 — 의제 lot, ① 환산 = 200,000 × 20,000 ÷ 100,000 = 40,000 채택(장기)
 *   B 2025-06 1,000주 × 150,000 — 단기(1년 미만)
 *   실비 10,000,000 → ① 몫 5,000,000 / 그 외 몫 5,000,000 · 개산공제 = 20,000 × 1,000 ÷ 100 = 200,000
 *   양도소득금액 = 210,000,000 − 5,200,000 = 204,800,000 · 과세표준 202,300,000
 *   그룹 순이익: 장기 A = 160,000,000 − 200,000 / 단기 B = 50,000,000 − 5,000,000 = 45,000,000
 *
 *   ST-1  단기 몫 = floor(과세표준 × 45,000,000 ÷ 204,800,000) — 종전(총이익 50,000,000 ÷ 210,000,000)이 아니다
 *   ST-2  swap(단서) — ① 몫 실비가 크면 ① 환산 취득가액을 되더한 순이익으로 나눈다
 *   ST-3  ① 미선택이면 종전 그대로(총이익 비율)
 *   ST-4  다종목 합산(기본공제 순차 배분 후 재계산) 경로도 같은 안분
 *   ST-5  이동평균법(풀) — ① 몫이 매도분 전체에 섞이므로 단기 그룹 필요경비 = 필요경비 × 단기 주식수 ÷ 매도 주식수
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import { applyStockTaxRate } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { base } from "./pre-deemed-lots-fixture";

const D = (s: string) => new Date(s);

function input(actualExpenses: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return base({
    shareCount: 2000,
    costAllocationMethod: "fifo",
    preDeemedLotClause1: "estimated",
    acquisitionDatePriceAvg1Month: 20_000,
    actualExpenses,
    acquisitionLots: [
      { id: "A", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "B", acquisitionDate: D("2025-06-01"), shareCount: 1000, perShareAcquisitionPrice: 150_000, acquisitionCause: "purchase" },
    ],
    transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 2000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
    ...o,
  } as Partial<StockTransferInput>);
}

/** 단기 그룹 몫 → 그룹별 세율 → 합산 → 10원 미만 절사 (안분 비율만 독립 계산) */
function expectedTax(taxBase: number, shortNet: number, totalNet: number): number {
  const shortBase = Math.floor((taxBase * shortNet) / totalNet);
  const t =
    applyStockTaxRate(shortBase, "listed_major", false, true).calculatedTax +
    applyStockTaxRate(taxBase - shortBase, "listed_major", false, false).calculatedTax;
  return Math.floor(t / 10) * 10;
}

describe("ST-1 ① 개산공제·실비 귀속을 반영한 단기 몫", () => {
  it("과세표준 202,300,000 · 단기 순이익 45,000,000 ÷ 204,800,000", () => {
    const r = calculateStockTransferTax(input(10_000_000));
    expect(r.acquisitionPrice).toBe(190_000_000);
    expect(r.expenses).toBe(5_200_000);
    expect(r.transferIncome).toBe(204_800_000);
    expect(r.taxBase).toBe(202_300_000);
    expect(r.calculatedTax).toBe(expectedTax(202_300_000, 45_000_000, 204_800_000));
    // 종전(총이익 비율)과 실제로 갈리는 사례다
    expect(r.calculatedTax).not.toBe(expectedTax(202_300_000, 50_000_000, 210_000_000));
  });
});

describe("ST-2 단서 swap", () => {
  it("실비 100,000,000 — ① 몫 50,000,000 > 환산 40,000,000 + 개산공제 200,000 → 환산 취득가액 제외", () => {
    const r = calculateStockTransferTax(input(100_000_000));
    // 취득가액 = B 150,000,000 (A 의 ① 환산 40,000,000 제외) · 필요경비 = 실비 전액 100,000,000
    expect(r.acquisitionPrice).toBe(150_000_000);
    expect(r.expenses).toBe(100_000_000);
    expect(r.transferIncome).toBe(150_000_000);
    // 장기 A = 160,000,000 + 40,000,000 − 50,000,000 = 150,000,000 / 단기 B = 50,000,000 − 50,000,000 = 0
    expect(r.calculatedTax).toBe(expectedTax(r.taxBase, 0, 150_000_000));
  });
});

describe("ST-2b 단서 swap + 단기 그룹 순이익 > 0", () => {
  it("B 단가 100,000 · 실비 100,000,000 — 분모(양도소득금액)에 ① 환산 취득가액을 되더한다", () => {
    const base2 = input(100_000_000);
    const r = calculateStockTransferTax({
      ...base2,
      acquisitionLots: [base2.acquisitionLots![0], { ...base2.acquisitionLots![1], perShareAcquisitionPrice: 100_000 }],
    });
    // 장기 A = 160,000,000 + 40,000,000 − 50,000,000 = 150,000,000 / 단기 B = 100,000,000 − 50,000,000 = 50,000,000
    expect(r.transferIncome).toBe(200_000_000);
    expect(r.calculatedTax).toBe(expectedTax(r.taxBase, 50_000_000, 200_000_000));
  });
});

describe("ST-3 ① 미선택 — 종전 그대로", () => {
  it("총이익 비율(단기 50,000,000 ÷ 전체 총이익)", () => {
    const r = calculateStockTransferTax(input(10_000_000, { preDeemedLotClause1: undefined, acquisitionDatePriceAvg1Month: undefined }));
    const gross = r.lotMatchingDetail!;
    expect(r.calculatedTax).toBe(expectedTax(r.taxBase, 50_000_000, gross.totalGain));
  });
});

describe("ST-4 다종목 집계 엔진 (합산 모드 — 기본공제 순차 배분 후 재계산 경로)", () => {
  it("먼저 양도한 다른 종목이 기본공제 250만을 다 쓰면 과세표준 = 양도소득금액 204,800,000 · 같은 그룹 순이익 안분", () => {
    const other = base({ acquisitionDate: D("2010-03-02"), transferDate: D("2025-03-01"), shareCount: 100, perShareAcquisitionPrice: 10_000 });
    const agg = calculateStockTransferTaxAggregate([input(10_000_000), other], "aggregate");
    const r = agg.items[0] as unknown as { taxBase: number; calculatedTax: number };
    expect(r.taxBase).toBe(204_800_000);
    expect(r.calculatedTax).toBe(expectedTax(204_800_000, 45_000_000, 204_800_000));
  });
});

describe("ST-5 이동평균법(풀)", () => {
  it("단기 그룹 필요경비는 매도 주식수 비례", () => {
    const r = calculateStockTransferTax(input(10_000_000, { costAllocationMethod: "moving_avg" }));
    const d = r.lotMatchingDetail!;
    expect(d.preDeemedClause1Summary?.pooled).toBe(true);
    const short = d.matched.filter((m) => m.isShortTerm);
    expect(short.length).toBeGreaterThan(0);
    const shortShares = short.reduce((s, m) => s + m.saleShares, 0);
    const shortGross = short.reduce((s, m) => s + m.perLotGain, 0);
    const soldShares = d.matched.reduce((s, m) => s + m.saleShares, 0);
    const shortNet = shortGross - Math.floor((r.expenses * shortShares) / soldShares);
    expect(r.calculatedTax).toBe(expectedTax(r.taxBase, shortNet, r.transferIncome));
  });
});
