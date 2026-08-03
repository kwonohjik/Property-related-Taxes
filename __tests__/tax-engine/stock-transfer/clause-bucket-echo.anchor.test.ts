/**
 * anchor: 주식 엔진 **§104① 호별 버킷 echo** — §104⑤ 크로스 조정용 (C-3a / 2b-2·2b-3)
 *
 * 계획서: `docs/00-pm/cross-104-5-c3-ui-design.plan.md` §5
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 이력 기반 교차 합산(C-3)은 **저장된 결과만 읽어** 두 엔진을 합친다. 그래서 호별 몫이
 * **입력과 무관하게 항상** 실려 있어야 한다 — 종전 `cross1045Adjustment`는 사용자가
 * `crossClause8TaxBase`를 넣었을 때만 만들어졌다.
 *
 * ⚠️ **`clause1BucketTax`는 §104⑤1호(`clause1Tax`)와 다르다.** 전자는 §104**①**1호 버킷
 *   (호별 합산), 후자는 §104**⑤**1호(과세표준 합계액 × §55①)다. 이름이 겹치면 조정 레이어가
 *   치명적으로 혼동되므로 버킷 쪽에 `Bucket`을 붙였다.
 *
 * 🔒 **주식(§94①3호)은 §104⑤ 대상이 아니다** — 본문이 「§94①1호·2호 및 **4호**」만 열거한다.
 *   그래서 주식 그룹·비과세는 **전부 0**이다(S-3·S-4).
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 기타자산 1건. `gain` = 양도차익(원) */
function otherAsset(gain: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "other_asset",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: true,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: gain / 100 + 10_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
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
    ...o,
  };
}

describe("주식 §104① 호별 버킷 echo — 단건 (2b-3)", () => {
  it("S-1: 기타자산 **1호** — `clause1Bucket*`에만 실린다", () => {
    const r = calculateStockTransferTax(otherAsset(300_000_000));
    expect(r.basicDeductionGroup).toBe("real_estate_and_other_asset");
    // §103② 기본공제 250만원 소진 후 과세표준
    expect(r.taxBase).toBe(297_500_000);
    expect(r.calculatedTax).toBe(93_110_000);
    expect(r.clause1BucketTaxBase).toBe(297_500_000);
    expect(r.clause1BucketTax).toBe(93_110_000);
    expect(r.clause9TaxBase).toBe(0);
    expect(r.clause9Tax).toBe(0);
  });

  it("S-2: 기타자산 **9호**(비사토 과다소유법인) — `clause9*`에만 실린다", () => {
    const r = calculateStockTransferTax(otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.5 }));
    expect(r.taxCategory).toBe("other_asset_block_shareholder_nbl");
    // 기본세율 + 10%p
    expect(r.calculatedTax).toBe(122_860_000);
    expect(r.clause9TaxBase).toBe(297_500_000);
    expect(r.clause9Tax).toBe(122_860_000);
    expect(r.clause1BucketTaxBase).toBe(0);
    expect(r.clause1BucketTax).toBe(0);
  });

  it("S-3: 🔒 **주식 그룹(§94①3호)은 전부 0** — §104⑤ 대상이 아니다", () => {
    const r = calculateStockTransferTax(
      otherAsset(300_000_000, {
        marketType: "kospi",
        isMajorShareholder: true,
        selfShareRatio: 0.05,
        selfMarketCap: 10_000_000_000,
        // ⚠️ 헬퍼 기본값이 `true`라 끄지 않으면 **과점주주 기타자산**으로 분류된다(§94①4호 다목).
        isQualifyingBlockShareholder: false,
      }),
    );
    expect(r.basicDeductionGroup).toBe("stock");
    expect(r.taxBase).toBeGreaterThan(0); // 과세표준은 있는데도
    expect(r.clause1BucketTaxBase).toBe(0);
    expect(r.clause1BucketTax).toBe(0);
    expect(r.clause9TaxBase).toBe(0);
    expect(r.clause9Tax).toBe(0);
  });

  it("S-4: 비과세도 전부 0 (aggregate `!isExempt` 필터와 같은 규약)", () => {
    const r = calculateStockTransferTax(
      otherAsset(300_000_000, {
        marketType: "kospi",
        isMajorShareholder: false,
        isListedSmallShareholder: true,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.clause1BucketTaxBase).toBe(0);
    expect(r.clause1BucketTax).toBe(0);
    expect(r.clause9TaxBase).toBe(0);
    expect(r.clause9Tax).toBe(0);
  });
});

describe("주식 §104① 호별 버킷 echo — aggregate (2b-2)", () => {
  it("S-5: 기타자산 1호 2건 — 1호 버킷이 §104⑤2호 전부", () => {
    const r = calculateStockTransferTaxAggregate([otherAsset(300_000_000), otherAsset(200_000_000)]);
    const c = r.otherAssetComparativeTax!;
    expect(c.aggregatedTaxBase).toBe(497_500_000);
    expect(c.clause1BucketTaxBase).toBe(497_500_000);
    expect(c.clause1BucketTax).toBe(173_060_000);
    expect(c.clause1BucketTax).toBe(c.clause2Tax); // 버킷이 하나뿐
    expect(c.clause9TaxBase).toBe(0);
    expect(c.clause9Tax).toBe(0);
  });

  it("S-6: ⭐ 1호 + 9호 혼재 — **`clause1BucketTax + clause9Tax === clause2Tax`** 불변식", () => {
    const r = calculateStockTransferTaxAggregate([
      otherAsset(300_000_000),
      otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6 }),
    ]);
    const c = r.otherAssetComparativeTax!;
    expect(c.aggregatedTaxBase).toBe(597_500_000);
    expect(c.clause1BucketTaxBase).toBe(297_500_000);
    expect(c.clause1BucketTax).toBe(93_110_000);
    expect(c.clause9TaxBase).toBe(300_000_000);
    expect(c.clause9Tax).toBe(124_060_000);
    expect(c.clause1BucketTax + c.clause9Tax).toBe(c.clause2Tax);
    expect(c.clause2Tax).toBe(217_170_000);
    // §104⑤1호(합계액 × §55①)와는 **다른 값**이다 — 이름이 겹치지 않아야 하는 이유.
    expect(c.clause1Tax).toBe(215_010_000);
    expect(c.clause1Tax).not.toBe(c.clause1BucketTax);
  });
});
