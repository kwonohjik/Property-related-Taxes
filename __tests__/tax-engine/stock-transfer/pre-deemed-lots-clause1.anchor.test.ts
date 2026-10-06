/**
 * 분할·다건 lot 의제취득일 전 매수 — 영 §176의2④ 「① 의제취득일 현재 가액 vs ② 실가 + 생산자물가상승분」 중 많은 것
 *
 * 계획서 `docs/00-pm/stock-lot-pre-deemed-clause1.plan.md` §7 (사용자 결정 2026-10-06: Q-1 상장 환산 + 비상장·기타 매매사례,
 *   Q-4 A안 실비 양도주식수 비례 귀속, Q-6 자본조정 동반 차단, moving_avg 허용+고지)
 *
 * 기대값은 probe 실측(엔진 직접 호출, 2026-10-06) — 단건 모드(P1·P5)와의 **패리티**가 중심이다.
 *   공통: 코스피 대주주(비중소) · 양도 2025-12-01 200,000/주 · 1980-06 매수 단가 10,000(② 1주당 12,910 = floor(10,000 × 5057 ÷ 3917))
 *
 *   LC1-1  1lot/1sale ① 환산 > ②      — 단건 P1 패리티: 취득 40,000,000 · 개산공제 200,000 · 세액 31,460,000
 *   LC1-2  1lot/1sale ① 환산 < ②      — ② 채택(현행 P2): 취득 12,910,000 · 실비 · 세액 36,918,000
 *   LC1-3  혼합 3lot                   — 취득 65,000,000 · 필요경비 533,334 · 세액 46,393,330
 *   LC1-4  단서 swap                   — 단건 P5 패리티(1lot) + 혼합 P6(양도소득금액 245,000,000)
 *   LC1-5  한 lot ① · 다른 lot ②        — sub-lot별 max
 *   LC1-6  비상장 매매사례 ①            — 개산공제 base = 의제일 §165④ 보충평가 · 단서 없음 · 단건 sale_case 패리티
 *   LC1-10 moving_avg                   — 매도별 풀 평균(40,000 → 45,000) · ① 몫 풀 비율 안분
 *   LC1-11 specific · LC1-12 매도 2건    — 지정 쌍 단가 · 매도 lot별 분모
 *   LC1-14~19 가드                      — 의제 lot 없음 · 혼합 원인 · 입력 누락(②만+경고) · 자본조정 · 동액
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { base } from "./pre-deemed-lots-fixture";

const D = (s: string) => new Date(s);


/** 1lot/1sale — 코스피 · ① 환산(의제일 종가평균 acqAvg · 양도 종가평균 100,000) */
function oneLot(acqAvg: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return base({
    costAllocationMethod: "fifo",
    preDeemedLotClause1: "estimated",
    acquisitionDatePriceAvg1Month: acqAvg,
    acquisitionLots: [{ id: "a1", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
    transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
    ...o,
  } as Partial<StockTransferInput>);
}

/** 혼합 3lot — A 1980-06 600주×10,000 · B 1984-06 400주×(bPrice) · C 2010-03 1,000주×50,000 · 1,500주 FIFO */
function mixed(acqAvg: number, o: Partial<StockTransferInput> = {}, bPrice = 30_000): StockTransferInput {
  return base({
    costAllocationMethod: "fifo",
    shareCount: 1500,
    preDeemedLotClause1: "estimated",
    acquisitionDatePriceAvg1Month: acqAvg,
    acquisitionLots: [
      { id: "A", acquisitionDate: D("1980-06-01"), shareCount: 600, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "B", acquisitionDate: D("1984-06-01"), shareCount: 400, perShareAcquisitionPrice: bPrice, acquisitionCause: "purchase" },
      { id: "C", acquisitionDate: D("2010-03-02"), shareCount: 1000, perShareAcquisitionPrice: 50_000, acquisitionCause: "purchase" },
    ],
    transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1500, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
    ...o,
  } as Partial<StockTransferInput>);
}

describe("LC1-1·2 1lot/1sale — 단건 패리티", () => {
  it("LC1-1 ① 40,000,000 > ② → 취득 40,000,000 · 개산공제 200,000 · 세액 31,460,000 (단건 P1과 같다)", () => {
    const r = calculateStockTransferTax(oneLot(20_000));
    expect(r.acquisitionPrice).toBe(40_000_000);
    expect(r.expenses).toBe(200_000);
    expect(r.transferIncome).toBe(159_800_000);
    expect(r.calculatedTax).toBe(31_460_000);
  });
  it("LC1-2 ① 10,000 < ② 12,910 → ② 채택 · 실비(0) · 세액 36,918,000 (현행 P2와 같다)", () => {
    const r = calculateStockTransferTax(oneLot(5_000));
    expect(r.acquisitionPrice).toBe(12_910_000);
    expect(r.expenses).toBe(0);
    expect(r.calculatedTax).toBe(36_918_000);
  });
});

describe("LC1-3 혼합 3lot", () => {
  it("A·B ① 40,000/주 · C 실가 — 취득 65,000,000 · 필요경비 = 개산 200,000 + 실비 귀속 333,334 = 533,334 · 세액 46,393,330", () => {
    const r = calculateStockTransferTax(mixed(20_000, { actualExpenses: 1_000_000 }));
    expect(r.acquisitionPrice).toBe(65_000_000);
    expect(r.expenses).toBe(533_334);
    expect(r.calculatedTax).toBe(46_393_330);
  });
});

describe("LC1-4 단서 swap", () => {
  it("단건 P5 패리티 — 의제일 6,500 → ① 13,000,000 · 개산 65,000 < 실비 30,000,000 → 양도소득금액 170,000,000 · 세액 33,500,000", () => {
    const r = calculateStockTransferTax(oneLot(6_500, { actualExpenses: 30_000_000 }));
    expect(r.expenses).toBe(30_000_000);
    expect(r.transferIncome).toBe(170_000_000);
    expect(r.calculatedTax).toBe(33_500_000);
  });
  it("혼합 P6 — ① 몫 실비 20,000,000 > 13,065,000 → swap · 양도소득금액 245,000,000 · 세액 48,500,000", () => {
    const r = calculateStockTransferTax(mixed(6_500, { actualExpenses: 30_000_000 }, 10_000));
    expect(r.expenses).toBe(30_000_000);
    expect(r.acquisitionPrice).toBe(25_000_000);
    expect(r.transferIncome).toBe(245_000_000);
    expect(r.calculatedTax).toBe(48_500_000);
  });
});

/** 총 취득가액·필요경비를 직접 주는 «독립 산출» — ②·① 미개입(2000년대 lot)·같은 세율·기본공제 파이프라인만 쓴다 */
function simulateTax(acq: number, expenses: number, sold = 1500): number {
  return calculateStockTransferTax(
    base({
      shareCount: sold,
      actualExpenses: expenses,
      acquisitionLots: [{ id: "S", acquisitionDate: D("2000-06-01"), shareCount: sold, perShareAcquisitionPrice: acq / sold, acquisitionCause: "purchase" }],
      transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: sold, perShareTransferPrice: 200_000 }],
      costAllocationMethod: "fifo",
    } as Partial<StockTransferInput>),
  ).calculatedTax;
}

describe("LC1-5 한 lot ① · 다른 lot ② (취득월별 ②가 다르다)", () => {
  it("A(1980-06) ① 40,000 · B(1984-06, 60,000 → ② 61,185) ② 채택 · 개산 120,000 + 실비 귀속 600,000 = 720,000", () => {
    const r = calculateStockTransferTax(mixed(20_000, { actualExpenses: 1_000_000 }, 60_000));
    // 600×40,000 + 400×61,185(= floor(60,000 × 5057 ÷ 4959)) + 500×50,000
    expect(r.acquisitionPrice).toBe(73_474_000);
    expect(r.expenses).toBe(720_000);
    const sub = r.lotMatchingDetail!.matched;
    expect(sub.map((m) => [m.acquisitionLotId, m.preDeemedSelected, m.perShareBuyPrice])).toEqual([
      ["A", "clause1", 40_000],
      ["B", "clause2", 61_185],
      [undefined, undefined, 50_000],
    ]);
    const d = r.preDeemedLotsDetail!;
    expect(d.deemedDate).toBe("1986-01-01");
    expect(d.lots.map((l) => [l.lotId, l.clause2PerShare])).toEqual([["A", 12_910], ["B", 61_185]]);
    expect(d.clause1).toMatchObject({ method: "estimated", clause1Shares: 600, otherShares: 900, soldShares: 1500, clause1Amount: 24_000_000 });
    expect(d.clause1?.settlement).toMatchObject({
      totalActualExpenses: 1_000_000, clause1SideActual: 400_000, otherSideActual: 600_000,
      estimatedBase: 12_000_000, estimatedDeduction: 120_000, swapApplied: false, expenses: 720_000,
    });
    expect(r.calculatedTax).toBe(simulateTax(73_474_000, 720_000));
  });
});

describe("LC1-6 비상장 매매사례 ①", () => {
  const unlisted = (o: Partial<StockTransferInput> = {}) =>
    base({
      marketType: "unlisted",
      costAllocationMethod: "fifo",
      preDeemedLotClause1: "sale_case",
      acquisitionMarketSamplePrice: 60_000,
      acquisitionMarketSampleDate: D("1985-12-20"),
      acquisitionYearNetIncomePerShare: 100_000,
      acquisitionYearNetAssetPerShare: 100_000,
      acquisitionLots: [{ id: "a1", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
      transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000 }],
      ...o,
    } as Partial<StockTransferInput>);

  it("① 60,000,000 > ② → 취득 60,000,000 · 개산공제 = 의제일 기준시가 100,000 × 1,000주 × 1% = 1,000,000 · 단서 없음", () => {
    const r = calculateStockTransferTax(unlisted());
    expect(r.acquisitionPrice).toBe(60_000_000);
    expect(r.expenses).toBe(1_000_000);
    expect(r.preDeemedLotsDetail?.clause1?.settlement).toMatchObject({ estimatedBase: 100_000_000, estimatedDeduction: 1_000_000, swapApplied: false });
    expect(r.preDeemedLotsDetail?.clause1?.settlement?.swapComparison).toBeUndefined();
  });
  it("단건 sale_case 와 패리티 — 같은 자산을 단건 모드로 돌린 값과 같다", () => {
    const lot = calculateStockTransferTax(unlisted());
    const single = calculateStockTransferTax(
      base({
        marketType: "unlisted",
        acquisitionMode: "sale_case",
        expenseMode: "estimated",
        acquisitionMarketSamplePrice: 60_000,
        acquisitionMarketSampleDate: D("1985-12-20"),
        acquisitionYearNetIncomePerShare: 100_000,
        acquisitionYearNetAssetPerShare: 100_000,
        preDeemedActualPricePerShare: 10_000,
      } as Partial<StockTransferInput>),
    );
    expect(single.preDeemedAcquisitionDetail?.selected).toBe("clause1");
    expect([lot.acquisitionPrice, lot.expenses, lot.transferIncome, lot.calculatedTax]).toEqual([
      single.acquisitionPrice, single.expenses, single.transferIncome, single.calculatedTax,
    ]);
  });
  it("매매사례 ① < ② 이면 ② · 실비", () => {
    const r = calculateStockTransferTax(unlisted({ acquisitionMarketSamplePrice: 5_000, actualExpenses: 300_000 }));
    expect(r.acquisitionPrice).toBe(12_910_000);
    expect(r.expenses).toBe(300_000);
    expect(r.preDeemedLotsDetail?.clause1?.clause1Shares).toBe(0);
    expect(r.preDeemedLotsDetail?.clause1?.settlement).toBeUndefined();
  });
});

describe("LC1-10 moving_avg — 매도마다 풀 평균이 달라진다", () => {
  const ma = () =>
    base({
      costAllocationMethod: "moving_avg",
      shareCount: 1500,
      preDeemedLotClause1: "estimated",
      acquisitionDatePriceAvg1Month: 20_000,
      acquisitionLots: [
        { id: "A", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
        { id: "C", acquisitionDate: D("2010-03-02"), shareCount: 1000, perShareAcquisitionPrice: 50_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        { id: "t1", transferDate: D("2024-05-01"), shareCount: 500, perShareTransferPrice: 150_000, transferStdPricePerShare: 100_000 },
        { id: "t2", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 },
      ],
    } as Partial<StockTransferInput>);
  it("매도1 풀 평균 (30,000×1,000 + 50,000×1,000)/2,000 = 40,000 · 매도2 (40,000×750 + 50,000×750)/1,500 = 45,000", () => {
    const r = calculateStockTransferTax(ma());
    // 매도2(1,000주)는 FIFO 보유기간 트랙이 A 잔여 500 + C 500 으로 나눈다 — 단가는 풀 평균 45,000 공통
    expect(r.lotMatchingDetail!.matched.map((m) => [m.saleShares, m.perShareBuyPrice])).toEqual([[500, 40_000], [500, 45_000], [500, 45_000]]);
    expect(r.acquisitionPrice).toBe(65_000_000);
    const c = r.preDeemedLotsDetail!.clause1!;
    // ① 몫 = 풀 지분 비율 — 매도1 1,000/2,000 × 500 = 250주 · 매도2 750/1,500 × 1,000 = 500주
    expect(c).toMatchObject({ pooled: true, clause1Shares: 750, clause1Amount: 27_500_000 });
    expect(c.settlement?.estimatedDeduction).toBe(150_000);
    expect(r.expenses).toBe(150_000);
    expect(r.transferIncome).toBe(275_000_000 - 65_000_000 - 150_000);
    expect(r.warnings.some((w) => w.includes("이동평균법은 ① 환산이 매도 건마다 달라"))).toBe(true);
    // sub-lot 별 선택은 없다(풀 평균)
    expect(r.lotMatchingDetail!.matched.every((m) => m.preDeemedSelected === undefined)).toBe(true);
  });
});

describe("LC1-11·12 specific · 매도 lot별 분모", () => {
  it("specific — 지정 쌍 A 600 + C 400: A ① 40,000 → 취득 44,000,000 · 개산 120,000", () => {
    const r = calculateStockTransferTax(
      base({
        costAllocationMethod: "specific",
        shareCount: 1000,
        preDeemedLotClause1: "estimated",
        acquisitionDatePriceAvg1Month: 20_000,
        acquisitionLots: [
          { id: "A", acquisitionDate: D("1980-06-01"), shareCount: 600, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
          { id: "C", acquisitionDate: D("2010-03-02"), shareCount: 1000, perShareAcquisitionPrice: 50_000, acquisitionCause: "purchase" },
        ],
        transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
        specificMatchings: [
          { transferLotId: "t1", acquisitionLotId: "A", shareCount: 600 },
          { transferLotId: "t1", acquisitionLotId: "C", shareCount: 400 },
        ],
      } as Partial<StockTransferInput>),
    );
    expect(r.acquisitionPrice).toBe(44_000_000);
    expect(r.expenses).toBe(120_000);
  });
  it("매도 2건(분모가 다름) — t1 400주 @100,000 ÷ 50,000 → 40,000 · t2 600주 @200,000 ÷ 200,000 → 20,000", () => {
    const r = calculateStockTransferTax(
      base({
        costAllocationMethod: "fifo",
        shareCount: 1000,
        preDeemedLotClause1: "estimated",
        acquisitionDatePriceAvg1Month: 20_000,
        acquisitionLots: [{ id: "A", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
        transferLots: [
          { id: "t1", transferDate: D("2025-06-01"), shareCount: 400, perShareTransferPrice: 100_000, transferStdPricePerShare: 50_000 },
          { id: "t2", transferDate: D("2025-12-01"), shareCount: 600, perShareTransferPrice: 200_000, transferStdPricePerShare: 200_000 },
        ],
      } as Partial<StockTransferInput>),
    );
    expect(r.lotMatchingDetail!.matched.map((m) => [m.transferLotId, m.perShareBuyPrice, m.preDeemedClause1PerShare])).toEqual([
      ["t1", 40_000, 40_000],
      ["t2", 20_000, 20_000],
    ]);
    expect(r.acquisitionPrice).toBe(28_000_000);
    expect(r.expenses).toBe(200_000);
    expect(r.transferIncome).toBe(160_000_000 - 28_000_000 - 200_000);
  });
});

describe("LC1-14~19 가드", () => {
  it("LC1-14 의제 lot 이 없으면(2000년대 lot) ① 을 골라도 변화 0 + 안내", () => {
    const r = calculateStockTransferTax(
      oneLot(20_000, {
        acquisitionLots: [{ id: "a1", acquisitionDate: D("2000-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
      }),
    );
    expect(r.acquisitionPrice).toBe(10_000_000);
    expect(r.preDeemedLotsDetail).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("의제취득일 전 매수 lot 이 없어"))).toBe(true);
  });
  it("LC1-15 증여 lot 은 ① 비대상(평가액 그대로) — 같은 1980 날짜여도", () => {
    const r = calculateStockTransferTax(
      mixed(20_000, {
        shareCount: 1000,
        acquisitionLots: [
          { id: "A", acquisitionDate: D("1980-06-01"), shareCount: 600, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
          { id: "G", acquisitionDate: D("1980-07-01"), shareCount: 400, perShareAcquisitionPrice: 30_000, acquisitionCause: "gift" },
        ],
        transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
      }),
    );
    expect(r.acquisitionPrice).toBe(600 * 40_000 + 400 * 30_000);
  });
  it("LC1-16 엔진 직접 호출 — 양도 당시 기준시가 누락이면 ②만 + 경고(조용히 ①로 가지 않는다)", () => {
    const r = calculateStockTransferTax(
      oneLot(20_000, {
        transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000 }],
      }),
    );
    expect(r.acquisitionPrice).toBe(12_910_000);
    expect(r.preDeemedLotsDetail?.clause1?.unresolvedShares).toBe(1000);
    expect(r.warnings.some((w) => w.includes("양도 당시 기준시가가 없어 ① 환산을 산정하지 못한"))).toBe(true);
  });
  it("LC1-17 자본조정 동반 — ① 비교를 하지 않고 ②만 + 경고 (Q-6)", () => {
    const r = calculateStockTransferTax(
      oneLot(20_000, {
        capitalAdjustments: [{ type: "bonus_capital_reserve", eventDate: D("2000-01-01"), ratio: 0.1 }],
      } as Partial<StockTransferInput>),
    );
    expect(r.preDeemedLotsDetail?.clause1).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("① 비교를 하지 않았습니다") && w.includes("자본조정"))).toBe(true);
  });
  it("엔진 직접 호출 — 비상장 환산(Phase 2)·상장 매매사례는 ②만 + 경고", () => {
    const a = calculateStockTransferTax(oneLot(20_000, { marketType: "unlisted" }));
    expect(a.acquisitionPrice).toBe(12_910_000);
    expect(a.warnings.some((w) => w.includes("비상장·기타자산의 환산취득가액은 아직 지원하지 않습니다"))).toBe(true);
    const b = calculateStockTransferTax(oneLot(20_000, { preDeemedLotClause1: "sale_case", acquisitionMarketSamplePrice: 60_000 }));
    expect(b.acquisitionPrice).toBe(12_910_000);
    expect(b.warnings.some((w) => w.includes("상장주식은 매매사례가액을 쓸 수 없습니다"))).toBe(true);
  });
  it("LC1-19 동액이면 ② — ① = ② = 12,910 (의제일 종가평균으로 역산 불가하므로 실가를 맞춘다)", () => {
    // ① = 200,000 × 20,000 ÷ 100,000 = 40,000 → ② 를 40,000 으로 맞추려면 1985-12 매수 단가 40,000 (배율 1)
    const r = calculateStockTransferTax(
      oneLot(20_000, {
        acquisitionLots: [{ id: "a1", acquisitionDate: D("1985-12-01"), shareCount: 1000, perShareAcquisitionPrice: 40_000, acquisitionCause: "purchase" }],
        actualExpenses: 300_000,
      }),
    );
    expect(r.lotMatchingDetail!.matched[0].preDeemedSelected).toBe("clause2");
    expect(r.acquisitionPrice).toBe(40_000_000);
    expect(r.expenses).toBe(300_000);
    expect(r.preDeemedLotsDetail?.clause1?.settlement).toBeUndefined();
  });
  it("① 방식 미선택 — 현행 ②만 (PR #2006 동작 · 기존 경고 문구)", () => {
    const r = calculateStockTransferTax(oneLot(20_000, { preDeemedLotClause1: undefined }));
    expect(r.acquisitionPrice).toBe(12_910_000);
    expect(r.warnings.some((w) => w.includes("매수 건별 입력에서 산정하지 않습니다"))).toBe(true);
    expect(r.preDeemedLotsDetail?.clause1).toBeUndefined();
  });
});

describe("LC1-4c 단서 swap 경계 — 동률은 본문 · +1원이면 swap (단건과 같은 부등호)", () => {
  // 의제일 6,500 → ① 13,000,000 + 개산공제 65,000 = 13,065,000
  it("실비 13,065,000(동률) → 본문(개산공제 65,000) · 취득가액 13,000,000 차감", () => {
    const r = calculateStockTransferTax(oneLot(6_500, { actualExpenses: 13_065_000 }));
    expect(r.preDeemedLotsDetail?.clause1?.settlement).toMatchObject({ swapApplied: false, expenses: 65_000 });
    expect(r.expenses).toBe(65_000);
    expect(r.acquisitionPrice).toBe(13_000_000);
  });
  it("실비 13,065,001 → 단서 swap · 필요경비 13,065,001 · 취득가액 차감 제외", () => {
    const r = calculateStockTransferTax(oneLot(6_500, { actualExpenses: 13_065_001 }));
    expect(r.preDeemedLotsDetail?.clause1?.settlement).toMatchObject({ swapApplied: true, swapRemovedAcquisition: 13_000_000 });
    expect(r.expenses).toBe(13_065_001);
    expect(r.acquisitionPrice).toBe(0);
    expect(r.transferIncome).toBe(200_000_000 - 13_065_001);
    expect(r.appliedRules).toContain("§97②단서swap");
  });
  it("매매사례 ①은 단서 대상이 아니다 — 실비가 아무리 커도 개산공제(본문)", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "unlisted",
        costAllocationMethod: "fifo",
        preDeemedLotClause1: "sale_case",
        acquisitionMarketSamplePrice: 60_000,
        acquisitionYearNetIncomePerShare: 100_000,
        acquisitionYearNetAssetPerShare: 100_000,
        actualExpenses: 900_000_000,
        acquisitionLots: [{ id: "a1", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
        transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000 }],
      } as Partial<StockTransferInput>),
    );
    expect(r.preDeemedLotsDetail?.clause1?.settlement?.swapApplied).toBe(false);
    expect(r.expenses).toBe(1_000_000);
  });
});

describe("LC1-20 K-OTC 비과세 echo — 정상 경로와 같은 헬퍼 (계획서 Q-10)", () => {
  const kotc = (o: Partial<StockTransferInput> = {}) =>
    base({
      marketType: "unlisted",
      isMajorShareholder: false,
      isKOTCTrading: true,
      isSmallMediumEnterprise: true,
      isListedSmallShareholder: true,
      costAllocationMethod: "fifo",
      acquisitionMarketSamplePrice: 60_000,
      acquisitionYearNetIncomePerShare: 100_000,
      acquisitionYearNetAssetPerShare: 100_000,
      acquisitionLots: [{ id: "a1", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
      transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000 }],
      ...o,
    } as Partial<StockTransferInput>);
  it("비과세 echo 취득가액(`acquisitionPrice`)에 ②(12,910,000)가 반영되고 ① 선택 시 ①(60,000,000)이 반영된다", () => {
    const a = calculateStockTransferTax(kotc());
    expect(a.isExempt).toBe(true);
    expect(a.acquisitionPrice).toBe(12_910_000);
    const b = calculateStockTransferTax(kotc({ preDeemedLotClause1: "sale_case" }));
    expect(b.isExempt).toBe(true);
    expect(b.acquisitionPrice).toBe(60_000_000);
  });
});

describe("LC1-15b 이월과세 lot 혼재 — 증여자 자본적지출은 ① 몫이 아니라 그 외 몫에 전액 귀속", () => {
  it("A(1980) ① 600주 + 이월과세 G 400주(증여자 자본적지출 400,000) → 필요경비 = 400,000 + 개산공제 120,000 = 520,000", () => {
    const r = calculateStockTransferTax(
      base({
        costAllocationMethod: "fifo",
        shareCount: 1000,
        preDeemedLotClause1: "estimated",
        acquisitionDatePriceAvg1Month: 20_000,
        acquisitionLots: [
          { id: "A", acquisitionDate: D("1980-06-01"), shareCount: 600, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
          {
            id: "G", acquisitionDate: D("2025-06-01"), shareCount: 400, perShareAcquisitionPrice: 90_000, acquisitionCause: "carryover_gift",
            donorAcquisitionDate: D("2020-01-01"), donorAcquisitionPrice: 30_000, donorCapitalExpenditure: 400_000, donorRelation: "spouse",
          },
        ],
        transferLots: [{ id: "t1", transferDate: D("2025-12-01"), shareCount: 1000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
      } as Partial<StockTransferInput>),
    );
    // A ① 40,000 × 600 + G 승계 단가 30,000 × 400
    expect(r.acquisitionPrice).toBe(600 * 40_000 + 400 * 30_000);
    expect(r.preDeemedLotsDetail?.clause1?.settlement).toMatchObject({ otherSideActual: 0, estimatedDeduction: 120_000, expenses: 520_000 });
    expect(r.expenses).toBe(520_000);
  });
});

describe("LC1-21 다종목 합산 엔진 — 종목별 재호출이라 ① 이 그대로 상속된다", () => {
  it("1종목 합산 = 단건 (취득 40,000,000 · 필요경비 200,000)", () => {
    const item = oneLot(20_000);
    const single = calculateStockTransferTax(item);
    const agg = calculateStockTransferTaxAggregate([item], "each_item");
    const r = agg.items[0] as unknown as { acquisitionPrice: number; expenses: number; calculatedTax: number };
    expect([r.acquisitionPrice, r.expenses, r.calculatedTax]).toEqual([40_000_000, 200_000, single.calculatedTax]);
  });
});
