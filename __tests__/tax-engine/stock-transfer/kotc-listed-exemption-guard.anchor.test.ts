/**
 * K-1~K-4 anchor — §94①3 나목 단서 비과세는 **비상장 전용**이다
 *
 * ## 조문 (KoreanLaw MCP 실측)
 *
 * 소득세법 §94①3 **나목** (mst 280405):
 *   「주권**비상장**법인의 주식등. 다만, … 주권비상장법인의 대주주에 해당하지 아니하는 자가
 *    [한국금융투자협회]가 행하는 … **장외매매거래**에 의하여 양도하는 …
 *    **중소기업 및 중견기업**의 주식등은 **제외**한다.」
 *   ⇒ 단서의 대상은 **나목 본문의 주식**, 즉 주권비상장법인 주식이다.
 *
 * 자본시장법 §286①5호 (mst 283193):
 *   협회 업무 = 「**증권시장에 상장되지 아니한 주권**의 장외매매거래에 관한 업무」
 *   ⇒ **K-OTC는 법문상 비상장주권 전용 시장**이다. 상장주식의 K-OTC 거래는 성립하지 않는다.
 *
 * ## 가목 2) vs 나목 단서 — 축이 정반대다
 *
 *   §94①3 가목 2): **상장** · 장외      → 과세대상에 **포함**
 *   §94①3 나목 단서: **비상장** · K-OTC → 과세대상에서 **제외**(비과세)
 *
 * ## 결함
 *
 * `judgeExemption`의 K-OTC 중소·중견 분기에 marketType 가드가 없어, 상장주식에
 * 비상장 전용 비과세가 적용됐다 — **최종세액 2,997,500 → 0**.
 * UI(`CompanyTypeBlock`)도 시장 게이트 없이 토글을 노출해 3클릭이면 재현됐다.
 *
 * ## 안전망 실측 (수정 전)
 *
 * P-K1(분기 무력화) → 8건 실패했으나 **전부 `unlisted` 케이스**였다.
 * 상장+K-OTC 조합의 비과세를 지키는 테스트는 **0건** — 아무도 보고 있지 않았다.
 *
 * ## 벤처 경로(조특법 §14①7호)는 대상이 아니다 — K-3 참조
 *
 * 계획서: docs/00-pm/stock-transfer-kotc-listed-exemption-gap.plan.md
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function base(over: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2025-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: true,
    acquisitionDate: new Date("2020-07-01"),
    transferDate: new Date("2026-02-26"),
    shareCount: 5_000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 3_000,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    ...over,
  } as StockTransferInput;
}

describe("K-1 — 상장주식에는 나목 단서 비과세가 적용되지 않는다", () => {
  for (const market of ["kospi", "kosdaq", "konex"] as const) {
    it(`K-1-${market}: ${market} + K-OTC + 중소 + 소액주주 → 과세`, () => {
      const r = calculateStockTransferTax(
        base({ marketType: market, isKOTCTrading: true, isOnMarketTransaction: false }),
      );
      expect(r.isExempt).toBe(false);
      expect(r.exemptReason).toBeUndefined();
      expect(r.taxCategory).not.toBe("kotc_sme_mid_exempt");
      expect(r.finalTax).toBeGreaterThan(0);
    });
  }

  it("K-1-세액: kosdaq 조합에서 최종세액 2,997,500 (종전 0)", () => {
    const r = calculateStockTransferTax(
      base({ isKOTCTrading: true, isOnMarketTransaction: false }),
    );
    expect(r.finalTax).toBe(2_997_500);
  });

  it("K-1-조문: 상장 비대주주 장외이므로 §94①3 가목 2)다 (나목 단서 아님)", () => {
    const r = calculateStockTransferTax(
      base({ isKOTCTrading: true, isOnMarketTransaction: false }),
    );
    expect(r.appliedSection94).not.toBe("①3나_단서");
  });

  it("K-1-중견: 중견기업 조합도 동일하게 과세", () => {
    const r = calculateStockTransferTax(
      base({
        isKOTCTrading: true, isOnMarketTransaction: false,
        isSmallMediumEnterprise: false, isMidsizeEnterprise: true,
      }),
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("K-2 (대조군) — 비상장 K-OTC 비과세는 그대로 유지된다", () => {
  it("K-2-1: unlisted + K-OTC + 중소 + 소액주주 → 비과세", () => {
    const r = calculateStockTransferTax(base({ marketType: "unlisted", isKOTCTrading: true }));
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("kotc_sme_mid");
    expect(r.taxCategory).toBe("kotc_sme_mid_exempt");
    expect(r.appliedSection94).toBe("①3나_단서");
    expect(r.finalTax).toBe(0);
  });

  it("K-2-2: unlisted + 중견기업도 비과세", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "unlisted", isKOTCTrading: true,
        isSmallMediumEnterprise: false, isMidsizeEnterprise: true,
      }),
    );
    expect(r.isExempt).toBe(true);
  });

  it("K-2-3: unlisted + 대주주는 단서 요건 미충족 → 과세", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "unlisted", isKOTCTrading: true,
        isMajorShareholder: true, selfShareRatio: 0.15, isListedSmallShareholder: false,
      }),
    );
    expect(r.isExempt).toBe(false);
  });
});

describe("K-3 — 벤처 경로(조특법 §14①7호)는 상장이어도 손대지 않는다", () => {
  /**
   * 위임 체인 실측:
   *   조특법 §14①7호 → 증권거래세법 §3조1호나목(「**증권시장 밖에서** 대통령령으로 정하는 방법」)
   *   → 증권거래세법 시행령 §1조의2①
   *   → 자본시장법 시행령 **§78**(다자간매매체결회사 — **상장주권** 대상) **또는 §178①**(협회 K-OTC — 비상장)
   *
   * ⇒ 벤처 특례는 「거래 장소」로만 한정하며 **상장·비상장을 가리지 않는다**.
   *   나목 단서와 요건 축이 다르므로 marketType 가드를 넣으면 **법 근거 없이 불리하게** 적용된다.
   */
  it("K-3-1: 상장 + 벤처 + 비대주주 → 비과세 유지 (조특법 §14①7호)", () => {
    const r = calculateStockTransferTax(
      base({
        isKOTCTrading: true, isOnMarketTransaction: false,
        isVentureCompany: true, isSmallMediumEnterprise: false, isListedSmallShareholder: false,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("kotc_venture");
  });

  it("K-3-2: 비상장 + 벤처 + 비대주주도 비과세 유지", () => {
    const r = calculateStockTransferTax(
      base({
        marketType: "unlisted", isKOTCTrading: true,
        isVentureCompany: true, isSmallMediumEnterprise: false, isListedSmallShareholder: false,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("kotc_venture");
  });
});

describe("K-4 — K-OTC 미체크 대조군 (가드가 다른 경로를 건드리지 않는다)", () => {
  it("K-4-1: 상장 + 장외 + K-OTC OFF → 종전대로 과세 2,997,500", () => {
    const r = calculateStockTransferTax(base({ isOnMarketTransaction: false }));
    expect(r.isExempt).toBe(false);
    expect(r.finalTax).toBe(2_997_500);
    expect(r.taxCategory).toBe("listed_off_market_non_major");
  });

  it("K-4-2: 상장 + 장내 + 비대주주 → 종전대로 비과세(§94①3 비해당)", () => {
    const r = calculateStockTransferTax(base({ isOnMarketTransaction: true }));
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("non_major_in_market");
  });
});
