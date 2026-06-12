/**
 * C-1 — 취득일 거래정지·관리종목: 취득시 기준시가만 §165④ 보충 평가
 *
 * 계획: docs/00-pm/stock-transfer-halt-acquisition-c1.plan.md
 * 설계: docs/02-design/features/stock-transfer-halt-acquisition-c1.{engine,ui}.design.md
 * 법령: 소령 §165③ 후문 "양도일ㆍ취득일 이전 1개월" (MST 286211) + 상증령 §52의2③ (MST 283637)
 *       §165⑤ 비적용 판정 (계산식이 상장일 기반 취득 후 상장 전제 — plan §1.2)
 *
 * 산식: 환산취득가 = 양도가액 × (취득시 §165④ 보충평가 ÷ 양도시 1개월 종가평균)
 *       80% 하한은 분자(취득기준시가) 미적용 (양측 경로 관행 일관)
 *
 *   C1-ENGINE-1: NI 6,000/NA 5,000 → 분자 5,600 → 취득가 5,600,000 · 개산공제 56,000
 *   C1-ENGINE-2: NA 단독 (§165④3) → 분자 5,000 → 5,000,000
 *   C1-ENGINE-3: 부동산과다보유 가중 반전 → 분자 5,400 → 5,400,000
 *   C1-ENGINE-4: 양도정지+취득정지 = 양도정지 단독 동일 (분기 선행)
 *   C1-ENGINE-5: unlisted+취득정지 = unlisted 단독 동일 (분기 가드)
 *   C1-ENGINE-6: 분모 0 → 방어 (취득가 0 + warning)
 *   C1-EXEMPT-1: K-OTC·장내 비과세 정보성 취득가 = 본체 동일 산식 (mirror)
 *   C1-VALIDATE-1/2 · C1-ZOD-1
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  stockTransferInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false,        // 장외 (과세) — 산출 확인용
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
    transferActualInputMode: "per_share", // Zod default "total" 회피 (refine: 총액 모드 transferTotalPrice 필수)
    perShareTransferPrice: 10_000,       // 양도가 10,000,000
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 10_000,  // 분모 (양도일 정상)
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: true,      // ★ C-1
    acquisitionYearNetIncomePerShare: 6_000,
    acquisitionYearNetAssetPerShare: 5_000,
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

describe("C-1: 취득일 거래정지 — 혼합 환산 (소령 §165③·§165④)", () => {
  // 분자 = floor((6,000×3 + 5,000×2) ÷ 5) = 5,600
  // 환산취득가 = floor(10,000,000 × 5,600 ÷ 10,000) = 5,600,000
  // 개산공제 = floor(5,600 × 1,000 × 1%) = 56,000
  it("C1-ENGINE-1: NI 6,000/NA 5,000 → 취득가 5,600,000 · 개산공제 56,000", () => {
    const r = calculateStockTransferTax(baseInput());
    expect(r.transferPrice).toBe(10_000_000);
    expect(r.acquisitionPrice).toBe(5_600_000);
    expect(r.estimatedBase).toBe(5_600_000);
    expect(r.expenses).toBe(56_000);
    expect(r.transferIncome).toBe(4_344_000); // 10M − 5.6M − 56K
    expect(r.valuationDetail?.method).toBe("halt_acquisition_conversion");
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_600);
    expect(r.valuationDetail?.conversionAcqStdPerShare).toBe(5_600);
    expect(r.valuationDetail?.conversionTransferStd).toBe(10_000);
    expect(r.valuationDetail?.netAssetFloorApplied).toBe(false); // 분자 80% 하한 미적용
    expect(r.appliedRules).toContain("취득일거래정지우회");
  });

  it("C1-ENGINE-2: 순자산 단독 (§165④3) → 분자 5,000 → 취득가 5,000,000", () => {
    const r = calculateStockTransferTax(
      baseInput({ netAssetOnlyReason: "no_business_or_short_or_closed" }),
    );
    expect(r.acquisitionPrice).toBe(5_000_000);
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_000);
    expect(r.valuationDetail?.netAssetOnlyReason).toBe("no_business_or_short_or_closed");
  });

  it("C1-ENGINE-3: 부동산과다보유 가중 반전 (2:3) → 분자 5,400 → 취득가 5,400,000", () => {
    const r = calculateStockTransferTax(
      baseInput({ isHeavyRealEstateForValuation: true }),
    );
    // (6,000×2 + 5,000×3) ÷ 5 = 5,400
    expect(r.acquisitionPrice).toBe(5_400_000);
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_400);
  });

  it("C1-ENGINE-4: 양도정지+취득정지 = 양도정지 단독과 동일 (분기 선행)", () => {
    const bothHalt = calculateStockTransferTax(
      baseInput({
        tradingHaltAtTransfer: true,
        transferYearNetIncomePerShare: 8_000,
        transferYearNetAssetPerShare: 7_000,
      }),
    );
    const transferHaltOnly = calculateStockTransferTax(
      baseInput({
        tradingHaltAtTransfer: true,
        tradingHaltAtAcquisition: false,
        transferYearNetIncomePerShare: 8_000,
        transferYearNetAssetPerShare: 7_000,
      }),
    );
    expect(bothHalt.acquisitionPrice).toBe(transferHaltOnly.acquisitionPrice);
    expect(bothHalt.expenses).toBe(transferHaltOnly.expenses);
    expect(bothHalt.finalTax).toBe(transferHaltOnly.finalTax);
    expect(bothHalt.valuationDetail?.method).toBe(transferHaltOnly.valuationDetail?.method);
    expect(bothHalt.appliedRules).toContain("거래정지우회");
    expect(bothHalt.appliedRules).not.toContain("취득일거래정지우회");
  });

  it("C1-ENGINE-5: unlisted + 취득정지 = unlisted 단독과 동일 (분기 가드)", () => {
    const unlistedOverrides: Partial<StockTransferInput> = {
      marketType: "unlisted",
      isMajorShareholder: true,
      selfShareRatio: 0.6,
      selfMarketCap: 2_000_000_000,
      transferYearNetIncomePerShare: 8_000,
      transferYearNetAssetPerShare: 7_000,
    };
    const withHaltFlag = calculateStockTransferTax(baseInput(unlistedOverrides));
    const withoutHaltFlag = calculateStockTransferTax(
      baseInput({ ...unlistedOverrides, tradingHaltAtAcquisition: false }),
    );
    expect(withHaltFlag.acquisitionPrice).toBe(withoutHaltFlag.acquisitionPrice);
    expect(withHaltFlag.finalTax).toBe(withoutHaltFlag.finalTax);
    expect(withHaltFlag.valuationDetail?.method).toBe(withoutHaltFlag.valuationDetail?.method);
    expect(withHaltFlag.appliedRules).not.toContain("취득일거래정지우회");
  });

  it("C1-ENGINE-6: 분모 0 (validate 우회 가정) → 취득가 0 + warning", () => {
    const r = calculateStockTransferTax(
      baseInput({ transferDatePriceAvg1Month: 0 }),
    );
    expect(r.acquisitionPrice).toBe(0);
    expect(r.warnings.some((w) => w.includes("환산취득가 산출 불가"))).toBe(true);
  });

  it("C1-EXEMPT-1: 장내 비대주주 비과세 — 정보성 취득가 = 본체 동일 산식 (mirror)", () => {
    const r = calculateStockTransferTax(baseInput({ isOnMarketTransaction: true }));
    expect(r.isExempt).toBe(true);
    expect(r.finalTax).toBe(0);
    expect(r.acquisitionPrice).toBe(5_600_000); // exempt-informational mirror
    expect(r.valuationDetail?.method).toBe("halt_acquisition_conversion");
  });
});

describe("C-1: validate · Zod", () => {
  it("C1-VALIDATE-1: 취득정지 ON → 분자 면제·취득연도 NI/NA 필수", () => {
    const form = {
      ...createInitialStockFormData(),
      marketType: "kospi" as const,
      acquisitionMode: "estimated" as const,
      shareCount: "1000",
      perShareTransferPrice: "10000",
      transferDate: "2024-06-01",
      acquisitionDate: "2018-01-01",
      transferDatePriceAvg1Month: "10000",
      tradingHaltAtAcquisition: true,
      // 취득연도 NI/NA 미입력 + 분자(acquisitionDatePriceAvg1Month) 미입력
    };
    const errors = validateStep2Domestic(form);
    expect(errors.some((e) => e.field === "acquisitionYearNetIncomePerShare")).toBe(true);
    expect(errors.some((e) => e.field === "acquisitionYearNetAssetPerShare")).toBe(true);
    // 분자는 면제 (G-6 패턴 mirror)
    expect(errors.some((e) => e.field === "acquisitionDatePriceAvg1Month")).toBe(false);
  });

  it("C1-VALIDATE-2: 취득정지 + 취득 후 상장 → 차단 (M-4)", () => {
    const form = {
      ...createInitialStockFormData(),
      marketType: "kospi" as const,
      acquisitionMode: "estimated" as const,
      shareCount: "1000",
      perShareTransferPrice: "10000",
      transferDate: "2024-06-01",
      acquisitionDate: "2018-01-01",
      tradingHaltAtAcquisition: true,
      acquiredBeforeListing: true,
      listingDate: "2020-01-01",
    };
    const errors = validateStep2Domestic(form);
    expect(errors.some((e) => e.field === "tradingHaltAtAcquisition")).toBe(true);
  });

  it("C1-ZOD-1: tradingHaltAtAcquisition 포함 body → 스키마 통과 + strip 부재 (⑫⑬⑭)", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse(baseInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tradingHaltAtAcquisition).toBe(true);
    }
  });

  it("C1-ZOD-2: 취득정지 + 취득 후 상장 body → 스키마 차단 (M-4 refine)", () => {
    const schema = addStockRefines(stockTransferInputSchema);
    const parsed = schema.safeParse(
      baseInput({ acquiredBeforeListing: true, listingDate: new Date("2020-01-01") }),
    );
    expect(parsed.success).toBe(false);
  });
});
