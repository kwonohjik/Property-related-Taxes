/**
 * C-2/C-3 거래정지 확장
 *
 * C-2: 거래정지(양도일) 시 비상장 보충 평가의 full(결산서)·사례49(액면가) 모드 허용.
 *   현행 api 게이트가 marketType==="unlisted" 한정이라 거래정지 상장주식엔 silent strip.
 *   → 게이트를 `|| tradingHaltAtTransfer`로 확장. 엔진(calcUnlistedValuation)은 기지원.
 * C-3: 거래정지(양도일) + 취득 후 상장(§165⑤)은 법령상 양립 불가
 *   (§165⑤ 양도일 §3항 전제 ↔ 상증령 §52의2③ 거래정지 제외). validate + Zod 차단.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 엔진 입력 base (StockTransferInput — Date 객체) */
function engineBase(overrides: Partial<StockTransferInput>): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1000,
    totalIssuedShares: 10000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 500000,
    acquisitionMode: "estimated",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    transferYearNetIncomePerShare: 30000,
    transferYearNetAssetPerShare: 200000,
    acquisitionYearNetIncomePerShare: 20000,
    acquisitionYearNetAssetPerShare: 150000,
    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

/** 완전 유효 입력 (Zod superRefine 도달용 — halt-acquisition-c1 baseInput 미러) */
function zodBaseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.2,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0.2,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 10_000,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: false,
    acquisitionYearNetIncomePerShare: 6_000,
    acquisitionYearNetAssetPerShare: 5_000,
    transferYearNetIncomePerShare: 6_000,
    transferYearNetAssetPerShare: 5_000,
    bookLost: false,
    expenseMode: "estimated",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  };
}

// ============================================================
// C2 — 거래정지 full/사례49 (api 게이트 확장)
//   ※ Pre-Do BASELINE(게이트 marketType 한정 strip → undefined)은 게이트 확장으로 해소,
//      C2-API-1이 수정 후 도달을 고정(throwaway baseline 제거).
// ============================================================
describe("C2 거래정지 full/사례49 확장", () => {
  it("C2-API-1: 거래정지(코스닥) + 사례49 → acqFaceValueOnly body 도달(strip 해소)", () => {
    const form = {
      ...createInitialStockFormData(),
      marketType: "kosdaq" as const,
      acquisitionMode: "estimated" as const,
      transferPriceMode: "actual" as const,
      transferActualInputMode: "per_share" as const,
      perShareTransferPrice: "200000",
      shareCount: "1000",
      tradingHaltAtTransfer: true,
      acqFaceValueOnly: true,
      acqFaceValuePerShare: "5000",
      transferYearNetIncomePerShare: "30000",
      transferYearNetAssetPerShare: "200000",
    };
    const body = buildStockTransferApiBody(form);
    expect(body.acqFaceValueOnly).toBe(true);
    expect(body.acqFaceValuePerShare).toBe(5000);
  });

  it("C2-ENGINE-1: 거래정지 full == 비상장 full (동일 입력 동치)", () => {
    // 거래정지(코스닥) vs 비상장 — 동일 보충평가 입력 → 환산취득가 동일
    const halt = calculateStockTransferTax(engineBase({ marketType: "kosdaq", tradingHaltAtTransfer: true }));
    const unlisted = calculateStockTransferTax(engineBase({ marketType: "unlisted", tradingHaltAtTransfer: false }));
    expect(halt.acquisitionPrice).toBe(unlisted.acquisitionPrice);
    expect(halt.acquisitionPrice).toBeGreaterThan(0);
  });

  it("C2-ENGINE-2: 거래정지(코스닥) + 사례49 → 취득 액면가 + 양도 §165④ 보충평가", () => {
    const r = calculateStockTransferTax(
      engineBase({
        marketType: "kosdaq",
        tradingHaltAtTransfer: true,
        acqFaceValueOnly: true,
        acqFaceValuePerShare: 5000,
      }),
    );
    expect(r.valuationDetail?.method).toBe("acq_face_value_only");
    expect(r.acquisitionPrice).toBeGreaterThan(0);
    expect(r.appliedRules).toContain("거래정지우회");
  });

  it("C2-REGRESS-1: 거래정지(코스닥) simple → 현행 보충평가 불변", () => {
    const r = calculateStockTransferTax(engineBase({ marketType: "kosdaq", tradingHaltAtTransfer: true }));
    expect(r.valuationDetail?.method).toBe("weighted_avg");
    expect(r.appliedRules).toContain("거래정지우회");
  });
});

// ============================================================
// C3 — 거래정지 + 취득후상장 차단 (Zod refine 신규)
// ============================================================
describe("C3 거래정지 + 취득후상장 양립 불가 차단", () => {
  it("C3-ZOD-0 (baseline): 단독(거래정지 OR 취득후상장)은 스키마 통과", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    expect(schema.safeParse(zodBaseInput({ tradingHaltAtTransfer: true })).success).toBe(true);
    expect(
      schema.safeParse(zodBaseInput({ acquiredBeforeListing: true, listingDate: new Date("2020-01-01") })).success,
    ).toBe(true);
  });

  it("C3-ZOD-1: tradingHaltAtTransfer + acquiredBeforeListing → Zod reject(§52의2③)", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const result = schema.safeParse(
      zodBaseInput({
        tradingHaltAtTransfer: true,
        acquiredBeforeListing: true,
        listingDate: new Date("2020-01-01"),
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("§52의2③"))).toBe(true);
    }
  });

  it("C3-VALIDATE-1: 거래정지 + 취득후상장 → validate error(§52의2③ G-5)", () => {
    const form = {
      ...createInitialStockFormData(),
      marketType: "kosdaq" as const,
      acquisitionMode: "estimated" as const,
      tradingHaltAtTransfer: true,
      acquiredBeforeListing: true,
      listingDate: "2020-01-01",
    };
    const errors = validateStep2Domestic(form);
    expect(
      errors.some((e) => e.field === "tradingHaltAtTransfer" && e.message.includes("§52의2③")),
    ).toBe(true);
  });
});
