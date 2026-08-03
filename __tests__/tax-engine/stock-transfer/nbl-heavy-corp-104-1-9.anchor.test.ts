/**
 * anchor: §104①**9호** 비사업용 토지 과다소유법인 주식 — 세율(기본세율 + 10%p) + §104⑤ 버킷
 *
 * 계획서: `docs/00-pm/stock-104-1-9-nbl-heavy-corp.plan.md` (Phase 1·2)
 * 세율표 자체는 `nbl-heavy-corp-brackets.anchor.test.ts`가 법문 8구간으로 고정한다.
 *
 * [법령]
 * - 「소득세법」 §104①9호 — 「§94①4호 **다목 및 라목**에 따른 자산 중 §104의3에 따른 비사업용
 *   토지의 보유 현황을 고려하여 **대통령령으로 정하는 자산**」 + 별도 세율표(16~55%)
 * - 「소득세법 시행령」 **§167조의7** — 「…§94①4호 **다목 또는 라목**에 해당하는 주식등으로서
 *   해당 법인의 **자산총액 중 「법인세법」 §55조의2②에 따른 비사업용토지의 가액이 차지하는
 *   비율이 100분의 50 이상**인 법인의 주식등」
 *
 * ⚠️ **입력 단위는 0~1 소수**다(형제 필드 `cumulativeTransferRatio`와 동일 — UI %, API가 ×0.01).
 * ⚠️ **미입력(undefined) = 9호 미해당** — 법 근거 없이 불리하게 적용하지 않는다.
 */
import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 기타자산 1건. `gain` = 양도차익(원) · `nbl` = 비사업용토지 가액 비율(0~1) */
function otherAsset(
  gain: number,
  o: Partial<StockTransferInput> = {},
): StockTransferInput {
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

describe("§104①9호 — 비사업용 토지 과다소유법인 주식", () => {
  it("B-1: 비율 50% 이상 → **기본세율 + 10%p** (93,110,000 → 122,860,000)", () => {
    const r = calculateStockTransferTax(otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.5 }));
    expect(r.taxBase).toBe(297_500_000); // 3억 − 기본공제 250만
    expect(r.taxCategory).toBe("other_asset_block_shareholder_nbl");
    expect(r.appliedRate).toBe(0.48); // 기본 38% + 10%p
    expect(r.calculatedTax).toBe(122_860_000);

    // 종전(9호 미적용) 대비 정확히 과세표준의 10%
    const before = calculateStockTransferTax(otherAsset(300_000_000));
    expect(before.calculatedTax).toBe(93_110_000);
    expect(r.calculatedTax - before.calculatedTax).toBe(29_750_000);
  });

  it("B-2: 임계 경계 — 50% **미만**은 미해당 (§104①1호 유지)", () => {
    const under = calculateStockTransferTax(otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.4999 }));
    expect(under.taxCategory).toBe("other_asset_block_shareholder");
    expect(under.calculatedTax).toBe(93_110_000);

    const exact = calculateStockTransferTax(otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.5 }));
    expect(exact.taxCategory).toBe("other_asset_block_shareholder_nbl");
  });

  it("B-3: **미입력은 미해당** — 법 근거 없이 불리하게 적용하지 않는다", () => {
    const r = calculateStockTransferTax(otherAsset(300_000_000));
    expect(r.taxCategory).toBe("other_asset_block_shareholder");
    expect(r.calculatedTax).toBe(93_110_000);
  });

  it("B-4: **다목·라목 둘 다**에 얹힌다 (시행령 §167의7 「다목 또는 라목」)", () => {
    const da = calculateStockTransferTax(
      otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6 }),
    );
    const ra = calculateStockTransferTax(
      otherAsset(300_000_000, {
        isQualifyingBlockShareholder: false,
        isHeavyRealEstateForRate: true,
        nblRatioOfCorpAssets: 0.6,
      }),
    );
    expect(da.taxCategory).toBe("other_asset_block_shareholder_nbl");
    expect(ra.taxCategory).toBe("other_asset_heavy_re_nbl");
    // 세율표는 같다 — 분류만 다르다
    expect(ra.calculatedTax).toBe(da.calculatedTax);
    expect(da.calculatedTax).toBe(122_860_000);
  });

  it("B-5: 세율 분기가 `default`로 새지 않는다 (산출세액 0 방지)", () => {
    // `applyStockTaxRate`의 switch에는 `default`가 있어 **컴파일 에러 없이** 새 카테고리가
    // 산출세액 0으로 떨어질 수 있다. 계획서 D-2가 「switch도 컴파일 강제」라 본 것은 부정확했다.
    // ⇒ 이 단언이 그 갭을 메운다.
    for (const cat of ["other_asset_block_shareholder_nbl", "other_asset_heavy_re_nbl"] as const) {
      const r = calculateStockTransferTax(
        otherAsset(300_000_000, {
          nblRatioOfCorpAssets: 0.6,
          isQualifyingBlockShareholder: cat === "other_asset_block_shareholder_nbl",
          isHeavyRealEstateForRate: cat === "other_asset_heavy_re_nbl",
        }),
      );
      expect(r.taxCategory).toBe(cat);
      expect(r.calculatedTax).toBeGreaterThan(0);
      expect(r.appliedRate).toBeGreaterThan(0);
    }
  });
});

describe("§104⑤ — 9호가 생기면 버킷이 둘로 갈린다", () => {
  it("B-6: 9호 2건 — 9호 버킷 안에서 합산 1회 (1호 = 기본세율이라 2호가 이긴다)", () => {
    const r = calculateStockTransferTaxAggregate(
      [
        otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6 }),
        otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6 }),
      ],
      "aggregate",
    );
    const c = r.otherAssetComparativeTax!;
    expect(c.aggregatedTaxBase).toBe(597_500_000);
    // 2호 = 9호 버킷 합산: 597,500,000 × 52% − 35,940,000 = 274,760,000
    expect(c.clause2Tax).toBe(274_760_000);
    // 1호 = 합계액에 **기본세율**: 597,500,000 × 42% − 35,940,000 = 215,010,000
    expect(c.clause1Tax).toBe(215_010_000);
    expect(c.applied).toBe("clause2");
    expect(r.totalCalculatedTax).toBe(274_760_000);
  });

  it("B-7: ⭐ **1호가 이기는 케이스** — 버킷이 갈리면 합산 누진이 +10%p를 넘어설 수 있다", () => {
    // 1호 자산은 크고(누진 구간 상승 효과 大), 9호 자산은 작다(+10%p 효과 小).
    const r = calculateStockTransferTaxAggregate(
      [
        otherAsset(900_000_000), // §104①1호
        otherAsset(10_000_000, { nblRatioOfCorpAssets: 0.9 }), // §104①9호
      ],
      "aggregate",
    );
    const c = r.otherAssetComparativeTax!;
    expect(c.aggregatedTaxBase).toBe(907_500_000);

    // 2호 = 1호 버킷(897,500,000 × 42% − 35,940,000 = 341,010,000)
    //      + 9호 버킷(10,000,000 × 16% = 1,600,000)
    expect(c.clause2Tax).toBe(342_610_000);
    // 1호 = 907,500,000 × 42% − 35,940,000 = 345,210,000  ← **더 크다**
    expect(c.clause1Tax).toBe(345_210_000);
    expect(c.applied).toBe("clause1");
    expect(r.totalCalculatedTax).toBe(345_210_000);

    // MAX가 실제로 작동했다 — 9호 도입 전에는 있을 수 없던 국면이다.
    expect(c.clause1Tax).toBeGreaterThan(c.clause2Tax);
  });

  it("B-8: 9호가 없으면 **1호 = 2호** (PR#1026 전제 유지 — 회귀)", () => {
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000)],
      "aggregate",
    );
    const c = r.otherAssetComparativeTax!;
    expect(c.clause1Tax).toBe(c.clause2Tax);
    expect(c.clause1Tax).toBe(215_010_000);
    expect(c.applied).toBe("clause2");
    expect(r.totalCalculatedTax).toBe(215_010_000);
  });

  it("B-10: **9호 버킷 echo** — 크로스 조정 레이어에 넘길 과세표준·세액을 분리 노출한다", () => {
    // §104⑤ 본문 후단이 「8호 및 9호의 자산은 **동일한 자산으로 보고**」라 정하므로,
    // 크로스 레이어(`comparative-104-5-cross.ts`)가 부동산 8호와 한 버킷으로 재합산하려면
    // 9호 몫이 분리돼야 한다. `otherClausesTax`는 `clause2Tax − clause9Tax`로 얻는다.
    const r = calculateStockTransferTaxAggregate(
      [
        otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6 }), // 9호
        otherAsset(300_000_000), // 1호
      ],
      "aggregate",
    );
    const c = r.otherAssetComparativeTax!;
    // ⚠️ §103② 기본공제 250만원은 **입력 순서 앞 종목**부터 소진한다 — 여기서는 9호가 먼저다.
    //   9호 버킷: 300,000,000 − 2,500,000 = 297,500,000 → × 48% − 19,940,000
    expect(c.clause9TaxBase).toBe(297_500_000);
    expect(c.clause9Tax).toBe(122_860_000);
    // 나머지(1호 버킷) 300,000,000 → × 38% − 19,940,000 = 94,060,000
    expect(c.clause2Tax - c.clause9Tax).toBe(94_060_000);
    // 버킷 과세표준의 합은 전체와 같다
    expect(c.aggregatedTaxBase).toBe(597_500_000);
  });

  it("B-11: 9호가 없으면 echo는 0이다 (크로스 레이어가 재합산할 것이 없음)", () => {
    const r = calculateStockTransferTaxAggregate(
      [otherAsset(300_000_000), otherAsset(300_000_000)],
      "aggregate",
    );
    const c = r.otherAssetComparativeTax!;
    expect(c.clause9TaxBase).toBe(0);
    expect(c.clause9Tax).toBe(0);
    expect(c.clause2Tax).toBe(215_010_000); // 전부 1호 버킷
  });

  it("C-1: **8호·9호 의제 조정액** — 부동산 8호 과세표준을 입력하면 안내값이 나온다", () => {
    // §104⑤ 본문 후단: 「제1항제8호 및 제9호의 자산은 **동일한 자산으로 보고**」
    const r = calculateStockTransferTax(
      otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6, crossClause8TaxBase: 243_500_000 }),
    );
    const c = r.cross1045Adjustment!;
    expect(c.clause8TaxBase).toBe(243_500_000);
    expect(c.clause9TaxBase).toBe(297_500_000); // 3억 − 기본공제 250만
    // 합산 541,000,000 × 52% − 35,940,000 = 245,380,000
    expect(c.merged89Tax).toBe(245_380_000);
    // 따로: 8호 f₈₉(243,500,000) + 9호 f₈₉(297,500,000)
    expect(c.separate89Tax).toBe(96_940_000 + 122_860_000);
    expect(c.adjustment).toBe(25_580_000);

    // ⚠️ **세액에는 반영하지 않는다** — §104⑤은 전체 산출세액을 정하므로 귀속이 없다(G-4).
    expect(r.calculatedTax).toBe(122_860_000);
  });

  it("C-2: 미입력이면 조정 없음 — 9호가 아니어도 없음", () => {
    const noInput = calculateStockTransferTax(
      otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6 }),
    );
    expect(noInput.cross1045Adjustment).toBeUndefined();

    // 9호가 아니면 합칠 대상이 아니다(§104⑤ 후단은 8호·9호만 지목한다)
    const not9 = calculateStockTransferTax(
      otherAsset(300_000_000, { crossClause8TaxBase: 243_500_000 }),
    );
    expect(not9.taxCategory).toBe("other_asset_block_shareholder");
    expect(not9.cross1045Adjustment).toBeUndefined();
  });

  it("C-3: 조정액은 **합산 − 분리**이고 음수가 될 수 없다(누진의 볼록성)", () => {
    for (const c8 of [10_000_000, 243_500_000, 1_000_000_000]) {
      const r = calculateStockTransferTax(
        otherAsset(300_000_000, { nblRatioOfCorpAssets: 0.6, crossClause8TaxBase: c8 }),
      );
      const c = r.cross1045Adjustment!;
      expect(c.adjustment).toBe(c.merged89Tax - c.separate89Tax);
      expect(c.adjustment).toBeGreaterThanOrEqual(0);
    }
  });

  it("B-9: 불변식 — 결정 산출세액은 언제나 `MAX(1호, 2호)`이고 자산별 합 이상이다", () => {
    for (const [g1, n1, g2, n2] of [
      [300_000_000, 0.6, 300_000_000, 0.6],
      [900_000_000, undefined, 10_000_000, 0.9],
      [50_000_000, 0.5, 700_000_000, undefined],
      [200_000_000, undefined, 200_000_000, undefined],
    ] as const) {
      const r = calculateStockTransferTaxAggregate(
        [
          otherAsset(g1, { nblRatioOfCorpAssets: n1 }),
          otherAsset(g2, { nblRatioOfCorpAssets: n2 }),
        ],
        "aggregate",
      );
      const c = r.otherAssetComparativeTax!;
      expect(c.aggregatedTax).toBe(Math.max(c.clause1Tax, c.clause2Tax));
      expect(r.totalCalculatedTax).toBe(c.aggregatedTax);
      // 호별 합산은 자산별 개별 계산보다 작을 수 없다(누진의 볼록성)
      expect(c.clause2Tax).toBeGreaterThanOrEqual(c.itemSumTax);
    }
  });
});
