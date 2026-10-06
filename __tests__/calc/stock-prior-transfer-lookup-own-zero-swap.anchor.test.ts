/**
 * 과점주주 §158② 기신고 이력 합산 — 「그 회차가 실제로 뺀 금액」을 가져오는가 (2026-10-07)
 *
 * `resultData`는 엔진을 실제로 호출한 결과를 JSON 왕복한 것이다(형제 real-shape anchor 와 같은 원칙).
 * 공통: 코스피 비중소 · §94①4다 요건 충족 · 1회차당 2,000주(또는 1,000주) × 200,000 · 3차 양도 2026-02-26
 *
 *   LZ-1  1차 단건 환산 + §97②2호 단서 → 취득가액 0 으로 가져온다(환산 80,000,000 은 그 회차에서 차감되지 않았다)
 *         다음 회차 산출세액 181,410,000(종전) → 215,010,000
 *   LZ-2  2차 자기 필요경비 0 + 1차 합산 → 2차 후보 필요경비 0 (종전: 합산 총액으로 내려가 1차분 1,000,000 이중)
 *   LZ-3  2차 ① lot 단독 + 부분 swap(당회차 취득가액 0) → 2차 후보 취득가액 0 (종전: 1차분 100,000,000 이중)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { filterPriorStockTransferCandidates, aggregatePriorStockTransfers } from "@/lib/calc/stock-prior-transfer-lookup";
import { LOCAL_USER_ID } from "@/lib/storage/constants";
import type { CalculationRecord } from "@/lib/storage/types";

const D = (s: string) => new Date(s);
const CORP = "(주)과점";
const NOW = D("2026-02-26");

function input(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi", isMajorShareholder: true, selfShareRatio: 0.7, selfMarketCap: 0, isLargestShareholderGroup: false,
    combinedShareRatio: 0, combinedMarketCap: 0, priorYearEndDate: D("2025-12-31"), isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false, isSmallMediumEnterprise: false, isMidsizeEnterprise: false, isListedSmallShareholder: false,
    isVentureCompany: false, isKOTCTrading: false, acquisitionDate: D("2010-06-01"), transferDate: NOW, shareCount: 2000,
    totalIssuedShares: 100_000, acquisitionCause: "purchase", transferPriceMode: "actual", perShareTransferPrice: 200_000,
    acquisitionMode: "actual", perShareAcquisitionPrice: 50_000, acquiredBeforeListing: false, tradingHaltAtTransfer: false, bookLost: false,
    expenseMode: "actual", actualExpenses: 0, filingType: "preliminary", filingDate: D("2026-04-30"), isElectronicFiling: false,
    filingViolation: "none", isFraudulent: false, isInternationalTransaction: false, realEstateGroupBasicDeductionUsed: 0,
    isQualifyingBlockShareholder: true, blockShareholderRealEstateRatio: 0.65, blockShareholderOwnershipRatio: 0.7,
    cumulativeTransferRatio: 0.7, aggregationFirstTransferDate: D("2023-06-20"),
    ...o,
  } as StockTransferInput;
}

/** 엔진 결과 → 저장 형태(JSON 왕복) */
function record(id: string, transferDate: string, r: ReturnType<typeof calculateStockTransferTax>): CalculationRecord {
  return {
    id, userId: LOCAL_USER_ID, taxType: "stock_transfer", title: `${CORP} ${transferDate}`,
    inputData: { securityName: CORP, securityCode: "", transferDate, shareCount: String(r.shareCount) },
    resultData: JSON.parse(JSON.stringify(r)),
    taxLawVersion: transferDate, linkedCalculationId: null, clientId: null,
    createdAt: `${transferDate}T00:00:00.000Z`, updatedAt: `${transferDate}T00:00:00.000Z`,
  };
}

const lookup = (recs: CalculationRecord[]) =>
  filterPriorStockTransferCandidates(recs, { transferDate: NOW, securityName: CORP, clientId: null }).candidates;

/** 기신고 합산값으로 이번 회차를 계산 */
const withPrior = (p: { transferPrice: number; acquisitionPrice: number; expenses: number; shareCount: number }) =>
  calculateStockTransferTax(input({
    priorTransferPrice: p.transferPrice, priorAcquisitionPrice: p.acquisitionPrice, priorExpenses: p.expenses,
    priorShareCount: p.shareCount, priorAggregationSourceCount: 1,
  }));

/** 1차 — 필요경비 1,000,000 · 단서 없음 */
const first = () => calculateStockTransferTax(input({ transferDate: D("2024-03-04"), actualExpenses: 1_000_000 }));

describe("LZ-1 단건 환산 + §97②2호 단서 회차", () => {
  const r1 = calculateStockTransferTax(input({
    transferDate: D("2024-03-04"), acquisitionMode: "estimated", acquisitionStdMode: "monthly_avg",
    transferDatePriceAvg1Month: 100_000, acquisitionDatePriceAvg1Month: 20_000, actualExpenses: 100_000_000,
  } as Partial<StockTransferInput>));

  it("전제 — 1차는 단서로 환산 80,000,000 을 차감하지 않았다(양도소득금액 400,000,000 − 100,000,000)", () => {
    expect(r1.swapApplied).toBe(true);
    expect(r1.ownAcquisitionPrice).toBe(80_000_000);
    expect(r1.transferIncome).toBe(300_000_000);
  });
  it("후보 취득가액 0 · 필요경비 = 대체된 실비 · 사유 플래그", () => {
    const [c] = lookup([record("r1", "2024-03-04", r1)]);
    expect([c.acquisitionPrice, c.expenses, c.acquisitionExcludedBySwap]).toEqual([0, 100_000_000, true]);
    // 기신고분 순액 = 그 회차 양도소득금액
    expect(c.transferPrice - c.acquisitionPrice - c.expenses).toBe(r1.transferIncome);
  });
  it("다음 회차 산출세액 215,010,000 (종전 경로 181,410,000 — 33,600,000 과소)", () => {
    const sum = aggregatePriorStockTransfers(lookup([record("r1", "2024-03-04", r1)]));
    const r = withPrior({
      transferPrice: sum.priorTransferPrice, acquisitionPrice: sum.priorAcquisitionPrice,
      expenses: sum.priorExpenses, shareCount: sum.priorShareCount,
    });
    expect(r.calculatedTax).toBe(215_010_000);
  });
  it("단서 없는 회차는 플래그 false · 취득가액 그대로", () => {
    const [c] = lookup([record("a1", "2024-03-04", first())]);
    expect([c.acquisitionPrice, c.acquisitionExcludedBySwap]).toEqual([100_000_000, false]);
  });
});

describe("LZ-2 당회차 필요경비 0 + 앞 회차 합산", () => {
  it("2차 후보 필요경비 0 — 합산 총액(1차분 1,000,000 포함)으로 내려가지 않는다", () => {
    const a1 = first();
    const a2 = calculateStockTransferTax(input({
      transferDate: D("2025-03-04"), actualExpenses: 0, priorTransferPrice: a1.ownTransferPrice,
      priorAcquisitionPrice: a1.ownAcquisitionPrice, priorExpenses: a1.ownExpenses, priorShareCount: 2000,
    }));
    expect([a2.ownExpenses, a2.expenses]).toEqual([0, 1_000_000]);
    const cs = lookup([record("a1", "2024-03-04", a1), record("a2", "2025-03-04", a2)]);
    expect(cs.map((c) => c.expenses)).toEqual([1_000_000, 0]);
    expect(aggregatePriorStockTransfers(cs).priorExpenses).toBe(1_000_000);
  });
});

describe("LZ-3 ① lot 단독 + 부분 swap — 당회차 취득가액 0", () => {
  it("2차 후보 취득가액 0 — 1차분 100,000,000 이 두 번 들어가지 않는다", () => {
    const a1 = first();
    const e2 = calculateStockTransferTax(input({
      transferDate: D("2025-03-04"), shareCount: 1000, costAllocationMethod: "fifo", preDeemedLotClause1: "estimated",
      acquisitionDatePriceAvg1Month: 20_000, actualExpenses: 100_000_000,
      priorTransferPrice: a1.ownTransferPrice, priorAcquisitionPrice: a1.ownAcquisitionPrice, priorExpenses: a1.ownExpenses, priorShareCount: 2000,
      acquisitionLots: [{ id: "x", acquisitionDate: D("1980-06-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" }],
      transferLots: [{ id: "t", transferDate: D("2025-03-04"), shareCount: 1000, perShareTransferPrice: 200_000, transferStdPricePerShare: 100_000 }],
    } as Partial<StockTransferInput>));
    expect(e2.preDeemedLotsDetail?.clause1?.settlement?.swapRemovedAcquisition).toBe(40_000_000);
    expect([e2.ownAcquisitionPrice, e2.acquisitionPrice, e2.swapApplied]).toEqual([0, 100_000_000, false]);
    const cs = lookup([record("a1", "2024-03-04", a1), record("e2", "2025-03-04", e2)]);
    expect(cs.map((c) => [c.acquisitionPrice, c.expenses, c.acquisitionExcludedBySwap])).toEqual([
      [100_000_000, 1_000_000, false],
      [0, 100_000_000, false],
    ]);
  });
});
