/**
 * 주식 분류 anchor — 리뷰 2026-08-28 #7·#14
 *
 * 두 결함 모두 **비과세·감경 예외를 법문보다 넓게 적용**하고 있었다.
 * 좁히는 방향이라 조문 본문을 직접 확인하고 착수했다.
 *
 * ── #7 §94② 기타자산에 §94①3호 비과세가 그대로 발동 ────────────────────────
 *   소득세법 §94②(lawId 001565, 시행 2026-07-01)
 *     「제1항제3호 및 제4호에 모두 해당되는 경우에는 **제4호를 적용한다**」
 *   조특법 §14① 각 호 외의 부분(lawId 001584)
 *     「… 양도로 발생하는 소득은 「소득세법」 **제94조제1항제3호**에 따른 양도소득에
 *      포함하지 아니한다」
 *   ⇒ 비과세 3갈래는 전부 **3호 축**이다. 4호가 적용된 소득에는 닿을 수 없다.
 *
 * ── #14 비상장 벤처 40억 임계에 「K-OTC 거래」 요건 누락 ──────────────────────
 *   소득세법 시행령 §167의8①2호 나목(lawId 003956, 시행 2026-07-01)
 *     「… 시가총액이 10억원(**「자본시장과 금융투자업에 관한 법률 시행령」 제178조제1항에
 *      따라 거래되는** 「벤처기업육성에 관한 특별법」 제2조제1항에 따른 벤처기업의 주식등의
 *      경우에는 40억원으로 한다) 이상인 경우」
 *   ⇒ 40억 예외는 **거래 방법 + 벤처기업**의 곱이다. 코드는 벤처만 봤다.
 *      「단서」가 아니라 **본문 괄호**다.
 *
 *   CL-94-2-1~5  (#7)
 *   CL-VC-1~5    (#14)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { getMajorShareholderThreshold } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function base(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
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
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 30_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...overrides,
  } as StockTransferInput;
}

// ============================================================
// #7 — §94② 기타자산 × §94①3호 비과세
// ============================================================

describe("CL-94-2 (#7): §94② 4호 적용 소득에는 §94①3호 비과세가 닿지 않는다", () => {
  it("CL-94-2-1: 상장 소액주주 장내 + 부동산과다보유 → 과세(장외 대조군과 같은 세액)", () => {
    const onMarket = calculateStockTransferTax(
      base({ isHeavyRealEstateForRate: true, isOnMarketTransaction: true }),
    );
    const offMarket = calculateStockTransferTax(
      base({ isHeavyRealEstateForRate: true, isOnMarketTransaction: false }),
    );

    // 전제 — §94②가 실제로 발동해 기타자산으로 분류된다.
    expect(onMarket.taxCategory).toBe("other_asset_heavy_re");
    expect(onMarket.appliedSection94).toBe("①4라");
    expect(onMarket.appliedRules).toContain("§94②우선");

    expect(onMarket.isExempt).toBe(false);
    expect(onMarket.finalTax).toBe(offMarket.finalTax);
    expect(onMarket.localIncomeTax).toBe(offMarket.localIncomeTax);
    expect(onMarket.finalTax).toBeGreaterThan(0);
  });

  it("CL-94-2-2: 비상장 K-OTC 중소 소액주주 + 부동산과다보유 → 나목 단서 비과세 차단", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "unlisted",
        isHeavyRealEstateForRate: true,
        isKOTCTrading: true,
        isSmallMediumEnterprise: true,
        isListedSmallShareholder: true,
        perShareTransferPrice: 500_000,
        perShareAcquisitionPrice: 100_000,
      }),
    );
    expect(r.taxCategory).toBe("other_asset_heavy_re");
    expect(r.isExempt).toBe(false);
    expect(r.finalTax).toBeGreaterThan(0);
  });

  it("CL-94-2-3: 기타자산 직접 선택 + 벤처 + K-OTC → 조특법 §14①7호 비과세 차단", () => {
    // `other_asset` 직접 선택은 §94① 3호에 애초에 해당하지 않는다(section94_2Applied: false).
    // 그래서 게이트는 「§94②가 발동했는가」가 아니라 **「기타자산으로 분류됐는가」**여야 한다.
    const r = calculateStockTransferTax(
      base({
        marketType: "other_asset",
        isHeavyRealEstateForRate: true,
        isKOTCTrading: true,
        isVentureCompany: true,
        perShareTransferPrice: 500_000,
        perShareAcquisitionPrice: 100_000,
      }),
    );
    expect(r.taxCategory).toBe("other_asset_heavy_re");
    expect(r.appliedRules).not.toContain("§94②우선"); // 3호 비해당이라 ②는 발동하지 않는다
    expect(r.isExempt).toBe(false);
    expect(r.finalTax).toBeGreaterThan(0);
  });

  it("CL-94-2-4: 과점주주(§94①4 다목) 축에서도 같다", () => {
    const r = calculateStockTransferTax(
      base({
        isQualifyingBlockShareholder: true,
        isOnMarketTransaction: true,
        perShareTransferPrice: 500_000,
        perShareAcquisitionPrice: 100_000,
      }),
    );
    expect(r.taxCategory).toBe("other_asset_block_shareholder");
    expect(r.isExempt).toBe(false);
    expect(r.finalTax).toBeGreaterThan(0);
  });

  it("CL-94-2-5: 4호 플래그가 없으면 종전대로 비과세(회귀 가드 — 정당한 비과세를 깨지 않는다)", () => {
    const inMarket = calculateStockTransferTax(base({ isOnMarketTransaction: true }));
    expect(inMarket.taxCategory).toBe("listed_non_major_in_market");
    expect(inMarket.isExempt).toBe(true);
    expect(inMarket.finalTax).toBe(0);

    const kotcVenture = calculateStockTransferTax(
      base({ marketType: "unlisted", isKOTCTrading: true, isVentureCompany: true }),
    );
    expect(kotcVenture.isExempt).toBe(true);
    expect(kotcVenture.exemptReason).toBe("kotc_venture");
  });

  it("CL-94-2-6: 항등식 — appliedRules 에 §94②우선이 있으면 isExempt 는 항상 false", () => {
    const combos: Array<Partial<StockTransferInput>> = [
      { isHeavyRealEstateForRate: true, isOnMarketTransaction: true },
      { isQualifyingBlockShareholder: true, isOnMarketTransaction: true },
      { marketType: "unlisted", isHeavyRealEstateForRate: true, isKOTCTrading: true, isVentureCompany: true },
      { marketType: "unlisted", isQualifyingBlockShareholder: true, isKOTCTrading: true, isSmallMediumEnterprise: true, isListedSmallShareholder: true },
    ];
    for (const c of combos) {
      const r = calculateStockTransferTax(base(c));
      if (r.appliedRules.includes("§94②우선")) {
        expect(r.isExempt).toBe(false);
      }
    }
  });
});

// ============================================================
// #14 — 비상장 벤처 40억 임계 × K-OTC 거래 요건
// ============================================================

describe("CL-VC (#14): 비상장 벤처 40억 임계는 「§178①에 따라 거래되는」 경우만", () => {
  const JUDGMENT_DATE = new Date("2023-12-31");

  it("CL-VC-1: 벤처 + K-OTC → 40억", () => {
    const t = getMajorShareholderThreshold("unlisted", JUDGMENT_DATE, {
      isVentureCompany: true,
      isKOTCTrading: true,
    });
    expect(t.marketCapThreshold).toBe(4_000_000_000);
    expect(t.isVentureRule).toBe(true);
  });

  it("CL-VC-2: 벤처인데 K-OTC 아님 → 본칙 10억", () => {
    const t = getMajorShareholderThreshold("unlisted", JUDGMENT_DATE, {
      isVentureCompany: true,
      isKOTCTrading: false,
    });
    expect(t.marketCapThreshold).toBe(1_000_000_000);
    expect(t.isVentureRule).toBe(false);
  });

  it("CL-VC-3: K-OTC 인데 벤처 아님 → 본칙 10억", () => {
    const t = getMajorShareholderThreshold("unlisted", JUDGMENT_DATE, {
      isVentureCompany: false,
      isKOTCTrading: true,
    });
    expect(t.marketCapThreshold).toBe(1_000_000_000);
    expect(t.isVentureRule).toBe(false);
  });

  it("CL-VC-4: 엔진 세액 — 벤처 ON·K-OTC OFF·시총 15억이면 대주주로 판정된다", () => {
    const input = base({
      marketType: "unlisted",
      isVentureCompany: true,
      isKOTCTrading: false,
      selfShareRatio: 0.001,
      selfMarketCap: 1_500_000_000,
      isSmallMediumEnterprise: false,
      perShareTransferPrice: 500_000,
      perShareAcquisitionPrice: 100_000,
    });
    const r = calculateStockTransferTax(input);
    expect(r.appliedThreshold?.marketCap).toBe(1_000_000_000);
    expect(r.taxCategory).toBe("unlisted_major");
    // 대주주 누진(3억 초과 25%) — 비대주주 20% 였다면 세액이 더 작다.
    expect(r.appliedRate).toBe(0.25);
  });

  it("CL-VC-5: 40억이 세액을 가르는 구간은 「K-OTC 아닌 경우」뿐 — K-OTC면 §14①7호로 비과세", () => {
    // 대칭 확인: isKOTCTrading + 벤처 + 비대주주 → 조특법 §14①7호 비과세(0)
    const r = calculateStockTransferTax(
      base({
        marketType: "unlisted",
        isVentureCompany: true,
        isKOTCTrading: true,
        selfShareRatio: 0.001,
        selfMarketCap: 1_500_000_000,
        perShareTransferPrice: 500_000,
        perShareAcquisitionPrice: 100_000,
      }),
    );
    expect(r.appliedThreshold?.marketCap).toBe(4_000_000_000);
    expect(r.isExempt).toBe(true);
    expect(r.finalTax).toBe(0);
  });

  it("CL-VC-6: 상장 시장은 이 분기와 무관(회귀 가드)", () => {
    const t = getMajorShareholderThreshold("kosdaq", JUDGMENT_DATE, {
      isVentureCompany: true,
      isKOTCTrading: true,
    });
    expect(t.isVentureRule).toBe(false);
    expect(t.ruleSource).toBe("§157");
  });
});
