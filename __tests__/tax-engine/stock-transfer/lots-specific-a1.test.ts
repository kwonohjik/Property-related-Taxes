/**
 * A-1 — 취득 다건 + 양도 단건 모드 개별법(specific) 활성화
 *
 * 계획: docs/00-pm/stock-transfer-remaining-followups.plan.md (Track A-1)
 * 설계: docs/02-design/features/stock-transfer-lots-specific-a1.{engine,ui}.design.md
 *
 * 엔진은 split 모드 specific(matchSpecific)을 이미 지원 — 본 PR은 UI·API·validate·Zod의
 * 차단을 해제하고 합성 단일 매도(SYNTH_SINGLE_TRANSFER_ID)에 매칭을 배선한다(엔진 0줄).
 *
 *   A1-ENGINE-1: 엔진 직접 호출 — 합성 매도 + 매칭으로 acquisitionPrice 정확 (현행 통과·회귀 가드)
 *   A1-API-1:    buildStockTransferApiBody — lots-only specific → body.specificMatchings 배선 (변경 전 미배선)
 *   A1-API-2:    transferLotId가 sentinel로 강제 + shareCount 0 행 필터
 *   A1-ZOD-1:    합성 body + 유효 매칭 → 스키마 통과 (변경 전 Refine 3 차단)
 *   A1-ZOD-2:    배정 합계 ≠ 매도 수량 → 무결성 체크 실패
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
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { SYNTH_SINGLE_TRANSFER_ID } from "@/lib/stores/calc-wizard-stock-types";

// ============================================================
// 엔진 base (비상장 대주주 — 과세 경로)
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
    acquisitionDate: new Date("2020-01-01"),
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
    id: SYNTH_SINGLE_TRANSFER_ID,
    transferDate: new Date("2025-07-01"),
    shareCount,
    perShareTransferPrice: perShare,
  };
}

describe("A-1: lots-only 개별법(specific)", () => {
  // --------------------------------------------------------
  it("A1-ENGINE-1: 매칭(a 1000 + b 200)으로 취득가 14,000,000 정확", () => {
    const acquisitionLots: AcquisitionLot[] = [
      { id: "a", acquisitionDate: new Date("2020-01-01"), shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
      { id: "b", acquisitionDate: new Date("2023-01-01"), shareCount: 500,  perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
    ];
    const result = calculateStockTransferTax(
      baseInput({
        shareCount: 1200,
        acquisitionLots,
        transferLots: [synthTransferLot(1200, 18_000)],
        costAllocationMethod: "specific",
        specificMatchings: [
          { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 1000 },
          { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "b", shareCount: 200 },
        ],
      }),
    );
    expect(result.lotMatchingDetail).toBeDefined();
    expect(result.lotMatchingDetail?.matched).toHaveLength(2);
    // acquisitionPrice = 1000×10000 + 200×20000 = 14,000,000
    expect(result.acquisitionPrice).toBe(14_000_000);
    expect(result.transferPrice).toBe(1200 * 18_000);
    expect(result.appliedRules).toContain("로트개별법");
  });

  // --------------------------------------------------------
  it("A1-API-1·2: buildStockTransferApiBody — specificMatchings 배선 + sentinel 강제 + 0행 필터", () => {
    const form = {
      ...createInitialStockFormData(),
      marketType: "unlisted" as const,
      acquisitionMode: "actual" as const,
      acquisitionActualInputMode: "lots" as const,
      lotsMode: "single" as const,
      costAllocationMethod: "specific" as const,
      shareCount: "1200",
      transferPriceMode: "actual" as const,
      transferActualInputMode: "per_share" as const,
      perShareTransferPrice: "18000",
      transferDate: "2025-07-01",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2020-01-01", shareCount: "1000", perShareAcquisitionPrice: "10000", acquisitionCause: "purchase" as const },
        { id: "b", acquisitionDate: "2023-01-01", shareCount: "500", perShareAcquisitionPrice: "20000", acquisitionCause: "purchase" as const },
      ],
      specificMatchings: [
        // transferLotId가 임의 값이라도 API가 sentinel로 강제해야 함
        { transferLotId: "ignored", acquisitionLotId: "a", shareCount: "1000" },
        { transferLotId: "x", acquisitionLotId: "b", shareCount: "200" },
        // shareCount 0 → 필터링
        { transferLotId: "y", acquisitionLotId: "c", shareCount: "0" },
      ],
    };
    const body = buildStockTransferApiBody(form);
    const matchings = body.specificMatchings as Array<{
      transferLotId: string;
      acquisitionLotId: string;
      shareCount: number;
    }>;
    expect(matchings).toHaveLength(2); // 0행 필터
    expect(matchings.every((m) => m.transferLotId === SYNTH_SINGLE_TRANSFER_ID)).toBe(true);
    expect(matchings.find((m) => m.acquisitionLotId === "a")?.shareCount).toBe(1000);
    expect(matchings.find((m) => m.acquisitionLotId === "b")?.shareCount).toBe(200);
  });

  // --------------------------------------------------------
  it("A1-ZOD-1: 합성 body + 유효 매칭(합계=매도 수량) → 스키마 통과", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse({
      ...baseInput(),
      acquisitionActualInputMode: "lots",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2020-01-01", shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
        { id: "b", acquisitionDate: "2023-01-01", shareCount: 500, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        { id: SYNTH_SINGLE_TRANSFER_ID, transferDate: "2025-07-01", shareCount: 1200, perShareTransferPrice: 18_000 },
      ],
      costAllocationMethod: "specific",
      specificMatchings: [
        { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 1000 },
        { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "b", shareCount: 200 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  // --------------------------------------------------------
  it("A1-ZOD-2: 배정 합계(1100) ≠ 매도 수량(1200) → 무결성 체크 실패", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse({
      ...baseInput(),
      acquisitionActualInputMode: "lots",
      acquisitionLots: [
        { id: "a", acquisitionDate: "2020-01-01", shareCount: 1000, perShareAcquisitionPrice: 10_000, acquisitionCause: "purchase" },
        { id: "b", acquisitionDate: "2023-01-01", shareCount: 500, perShareAcquisitionPrice: 20_000, acquisitionCause: "purchase" },
      ],
      transferLots: [
        { id: SYNTH_SINGLE_TRANSFER_ID, transferDate: "2025-07-01", shareCount: 1200, perShareTransferPrice: 18_000 },
      ],
      costAllocationMethod: "specific",
      specificMatchings: [
        { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "a", shareCount: 1000 },
        { transferLotId: SYNTH_SINGLE_TRANSFER_ID, acquisitionLotId: "b", shareCount: 100 },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
