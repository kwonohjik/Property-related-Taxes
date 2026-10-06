/**
 * 분할·다건 lot × 차손 sub-lot — 단기(가목 1, 30%)·장기(가목 2) 세율 안분의 영 §167의2① 통산
 *
 * 종전 `calcSplitModeTax`는 단기 몫을 «양(+)인 단기 sub-lot 총이익»으로, 분모를 «전 sub-lot 순이익»으로 잡아
 * 차손 sub-lot 이 섞이면 단기 몫이 과세표준을 넘었다(장기 그룹 몫은 음수 → 세액 0).
 * 영 §167의2①: 1호 같은 세율 그룹 안에서 먼저 통산, 2호 남은 차손은 다른 세율 그룹 이익에서 공제.
 *
 * 공통: 코스피 대주주(비중소) · 양도 2025-12-01 × 200,000
 *   LS-1  장기 그룹 순차손 → 단기 이익에서 공제 · 과세표준 전액 30% (종전 26,250,000 → 5,250,000)
 *   LS-2  단기 그룹 순차손 → 장기 이익에서 공제 · 과세표준 전액 가목 2)
 *   LS-3  단기 그룹 안의 차손 sub-lot 을 단기 이익과 먼저 통산(1호) — 단기 몫 = 순이익 50,000,000 ÷ 100,000,000
 *   LS-4  ① 정산 경로(`settledGroupGains`)도 단기 차손 sub-lot 을 단기 그룹에 넣는다
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { applyStockTaxRate } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { base } from "./pre-deemed-lots-fixture";

const D = (s: string) => new Date(s);
type Lot = [id: string, date: string, perShare: number];

function run(lots: Lot[], o: Partial<StockTransferInput> = {}) {
  return calculateStockTransferTax(
    base({
      shareCount: 1000 * lots.length,
      costAllocationMethod: "fifo",
      acquisitionDate: D(lots[0][1]),
      acquisitionLots: lots.map(([id, date, p]) => ({
        id, acquisitionDate: D(date), shareCount: 1000, perShareAcquisitionPrice: p, acquisitionCause: "purchase",
      })),
      transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000 * lots.length, perShareTransferPrice: 200_000 }],
      ...o,
    } as Partial<StockTransferInput>),
  );
}

/** 단기 그룹 몫 → 그룹별 세율 → 합산 → 10원 미만 절사 */
function expectedTax(taxBase: number, shortNet: number, totalNet: number): number {
  const shortBase = Math.floor((taxBase * shortNet) / totalNet);
  const t =
    (shortBase > 0 ? applyStockTaxRate(shortBase, "listed_major", false, true).calculatedTax : 0) +
    (taxBase - shortBase > 0 ? applyStockTaxRate(taxBase - shortBase, "listed_major", false, false).calculatedTax : 0);
  return Math.floor(t / 10) * 10;
}

describe("LS-1 장기 그룹 순차손", () => {
  it("장기 −80,000,000 · 단기 +100,000,000 → 과세표준 17,500,000 전액 30%", () => {
    const r = run([["A", "2020-01-02", 280_000], ["B", "2025-06-01", 100_000]]);
    expect(r.transferIncome).toBe(20_000_000);
    expect(r.taxBase).toBe(17_500_000);
    expect(r.calculatedTax).toBe(5_250_000);
  });
});

describe("LS-2 단기 그룹 순차손", () => {
  it("장기 +100,000,000 · 단기 −80,000,000 → 과세표준 전액 가목 2)", () => {
    const r = run([["A", "2020-01-02", 100_000], ["B", "2025-06-01", 280_000]]);
    expect(r.taxBase).toBe(17_500_000);
    expect(r.calculatedTax).toBe(expectedTax(17_500_000, 0, 1));
    expect(r.calculatedTax).toBe(3_500_000);
  });
});

describe("LS-3 같은 세율 그룹 안 통산 먼저(영 §167의2①1호)", () => {
  it("장기 +50,000,000 · 단기 +100,000,000 · 단기 −50,000,000 → 단기 몫 50 ÷ 100", () => {
    const r = run([["A", "2020-01-02", 150_000], ["B", "2025-03-03", 100_000], ["C", "2025-06-02", 250_000]]);
    expect(r.transferIncome).toBe(100_000_000);
    expect(r.calculatedTax).toBe(expectedTax(r.taxBase, 50_000_000, 100_000_000));
    // 종전(단기 양(+) sub-lot 만 — 단기 몫 100 ÷ 100 = 전액 30%)과 갈린다
    expect(r.calculatedTax).not.toBe(expectedTax(r.taxBase, 100_000_000, 100_000_000));
  });
});

describe("LS-4 ① 정산 경로 — 단기 차손 sub-lot", () => {
  it("1980 ① lot + 단기 +50,000,000 · 단기 −50,000,000 → 단기 그룹 순차손이라 전액 가목 2)", () => {
    const r = run([["A", "1980-06-01", 10_000], ["B", "2025-03-03", 150_000], ["C", "2025-06-02", 250_000]], {
      preDeemedLotClause1: "estimated",
      acquisitionDatePriceAvg1Month: 20_000,
      actualExpenses: 9_000_000,
      transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 3000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
    } as Partial<StockTransferInput>);
    expect(r.lotMatchingDetail?.preDeemedClause1Summary?.clause1Shares).toBe(1000);
    expect(r.calculatedTax).toBe(expectedTax(r.taxBase, 0, 1));
  });
});
