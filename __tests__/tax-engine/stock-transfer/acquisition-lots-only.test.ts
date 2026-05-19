/**
 * LO-1~5 — 취득가액 다건 입력 모드 (acquisitionActualInputMode = "lots")
 *
 * 계획서: docs/00-pm/stock-transfer-acquisition-lots-only.plan.md v2
 * 엔진 디자인: docs/02-design/features/stock-transfer-acquisition-lots-only.engine.design.md v2
 *
 * 케이스:
 *   LO-1 (E-3): FIFO 3 lot (합계 > 양도) — 일부 lot 차감, 합산 정확
 *   LO-2 (E-3 변형): 이동평균 — 가중평균 단가 × 양도 수량
 *   LO-3 (LO-1 변형): FIFO 양도 < 매수 합계 — 잔량 lot 미반영
 *   LO-4 (E-6): Zod refine — total + lots 조합 차단
 *   LO-5 (E-1): per_share 모드 회귀 — lotMatchingDetail 미생성
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";

// ============================================================
// 공용 base (비상장 대주주 — 과세 경로)
// ============================================================

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2024-12-31"),
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: new Date("2022-01-10"),
    transferDate: new Date("2025-07-01"),
    shareCount: 1200,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 18_000,
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2025-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

function synthTransferLot(shareCount: number, perShare: number): TransferLot {
  return {
    id: "__synth_single_transfer__",
    transferDate: new Date("2025-07-01"),
    shareCount,
    perShareTransferPrice: perShare,
  };
}

describe("LO: 취득가액 다건 입력 모드", () => {
  // --------------------------------------------------------
  it("LO-1: FIFO 3 lot — 양도 1200주 (a 1000 + b 200 차감), 취득가 합산 정확", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2022-01-10"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-05-20"), shareCount: 500,  perShareAcquisitionPrice: 12_000, acquisitionCause: "purchase" },
      { id: "c", acquisitionDate: new Date("2024-03-15"), shareCount: 800,  perShareAcquisitionPrice: 15_000, acquisitionCause: "purchase" },
    ];
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 1200,
        acquisitionLots,
        transferLots: [synthTransferLot(1200, 18_000)],
        costAllocationMethod: "fifo",
      }),
    );
    expect(result.lotMatchingDetail).toBeDefined();
    // FIFO: a 전량(1000) + b 200주
    // acquisitionPrice = 1000×10000 + 200×12000 = 12,400,000
    expect(result.acquisitionPrice).toBe(12_400_000);
    // transferPrice = 1200×18000 = 21,600,000
    expect(result.transferPrice).toBe(21_600_000);
  });

  // --------------------------------------------------------
  it("LO-2: 이동평균 — 가중평균 단가 × 양도 수량 (1000@10000 + 500@12000 → 가중평균 10666원)", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2022-01-10"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-05-20"), shareCount: 500,  perShareAcquisitionPrice: 12_000, acquisitionCause: "purchase" },
    ];
    // 가중평균 = floor((1000*10000 + 500*12000) / 1500) = floor(10666.67) = 10666
    // 양도 1200주 → acquisitionPrice = 10666 × 1200 = 12,799,200
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 1200,
        acquisitionLots,
        transferLots: [synthTransferLot(1200, 18_000)],
        costAllocationMethod: "moving_avg",
      }),
    );
    expect(result.lotMatchingDetail).toBeDefined();
    expect(result.lotMatchingDetail?.weightedAvgPerShare).toBe(10_666);
    expect(result.acquisitionPrice).toBe(10_666 * 1200);
  });

  // --------------------------------------------------------
  it("LO-3: FIFO + 양도 < 매수 합계 (300주 양도, a lot 300주만 차감)", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2022-01-10"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-05-20"), shareCount: 500,  perShareAcquisitionPrice: 12_000, acquisitionCause: "purchase" },
    ];
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 300,
        acquisitionLots,
        transferLots: [synthTransferLot(300, 18_000)],
        costAllocationMethod: "fifo",
      }),
    );
    expect(result.lotMatchingDetail).toBeDefined();
    // FIFO: a lot 300주만 차감 → 300×10000 = 3,000,000
    expect(result.acquisitionPrice).toBe(3_000_000);
    expect(result.transferPrice).toBe(300 * 18_000);
  });

  // --------------------------------------------------------
  it("LO-4 (재정의): Zod refine — total + lots 조합은 통과 (2026-05-18 제약 해제). 합성 transferLot은 API 책임.", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse({
      ...baseInput(),
      transferActualInputMode: "total",
      transferTotalPrice: 21_600_000,
      perShareTransferPrice: undefined,
      acquisitionActualInputMode: "lots",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2022-01-10", shareCount: 1200, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        // API 변환이 Math.round(21_600_000 / 1200) = 18000 으로 합성
        { id: "__synth_single_transfer__", transferDate: "2025-07-01", shareCount: 1200, perShareTransferPrice: 18_000 },
      ],
      costAllocationMethod: "fifo",
    });
    expect(parsed.success).toBe(true);
  });

  // --------------------------------------------------------
  it("LO-T-1: total + lots — 정확히 나누어 떨어지는 케이스 (21,600,000 ÷ 1200 = 18,000)", () => {
    // API 변환 시뮬레이션: Math.round(21_600_000 / 1200) = 18_000
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2022-01-10"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-05-20"), shareCount: 500,  perShareAcquisitionPrice: 12_000, acquisitionCause: "purchase" },
    ];
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 1200,
        acquisitionLots,
        transferLots: [synthTransferLot(1200, 18_000)], // 합성 단가
        costAllocationMethod: "fifo",
      }),
    );
    expect(result.transferPrice).toBe(21_600_000); // 정확 일치 (잔돈 없음)
    expect(result.acquisitionPrice).toBe(12_400_000); // FIFO: 1000*10000 + 200*12000
  });

  it("LO-T-2: total + lots — 정확히 안 떨어지는 케이스 잔돈 ≤ shareCount-1원 (21,600,001 ÷ 1200 → round 18,000, 1원 손실)", () => {
    // 21,600,001 / 1200 = 18000.0008... → round 18000
    // transferPrice = 18000 × 1200 = 21,600,000 (사용자 입력 21,600,001 대비 1원 손실)
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2022-01-10"), shareCount: 1200, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
    ];
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 1200,
        acquisitionLots,
        transferLots: [synthTransferLot(1200, 18_000)], // round 결과
        costAllocationMethod: "fifo",
      }),
    );
    // 잔돈 손실 ≤ shareCount - 1 = 1199원 한계 내
    const userIntent = 21_600_001;
    const diff = Math.abs(result.transferPrice - userIntent);
    expect(diff).toBeLessThan(1200);
  });

  // --------------------------------------------------------
  it("LO-5: per_share 모드 회귀 — lotMatchingDetail 미생성, perShareAcquisitionPrice × shareCount 사용", () => {
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 500,
        // acquisitionActualInputMode 미지정 → default "per_share"
        perShareAcquisitionPrice: 10_000,
        // acquisitionLots/transferLots/costAllocationMethod 없음
      }),
    );
    expect(result.lotMatchingDetail).toBeUndefined();
    expect(result.acquisitionPrice).toBe(500 * 10_000);
  });
});
