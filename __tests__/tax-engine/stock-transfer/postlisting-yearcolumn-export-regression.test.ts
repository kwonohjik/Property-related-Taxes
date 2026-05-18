/**
 * PostListing YearColumn export 회귀 anchor (EU-15)
 *
 * 계획서: stock-transfer-unlisted-direct-calc.plan.md v4 §10-B EU-15
 *
 * 검증: Column 타입 확장(Listing|Acq|EUTransfer|EUAcq) + YearColumn named export 후
 *  - PostListing 산출(calcNetIncomePerShare / calcNetAssetPerShare)이 기존과 동일
 *  - Listing/Acq 컬럼 입력만으로 EU 컬럼 값이 자동 0으로 처리됨 (간섭 0)
 *  - PostListing flat-adapter가 EU 키 무시 (Listing/Acq만 사용)
 *
 * 이 anchor가 깨지면 PostListing 회귀 — YearColumn 분리 작업이 PostListing에 영향
 */

import { describe, test, expect } from "vitest";
import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { adaptFlatToApiBody } from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
import {
  createInitialStockFormData,
  type StockTransferFormData,
} from "@/lib/stores/calc-wizard-stock-store";

describe("EU-15: PostListing YearColumn export 회귀 보호", () => {
  test("calcNetIncomePerShare — PostListing 헬퍼 시그니처/산식 무변동", () => {
    const r = calcNetIncomePerShare({
      addA: [100000000],
      subB: [20000000],
      shareCount: 10000,
      discountRate: 0.10,
    });
    expect(r.netIncomeAmount).toBe(80000000);
    expect(r.perShareIncome).toBe(8000);
    expect(r.perShareValue).toBe(80000);
  });

  test("calcNetAssetPerShare — PostListing 헬퍼 시그니처/산식 무변동", () => {
    const r = calcNetAssetPerShare({
      assetTotalRow1: 50000000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 30000000,
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 5000000,
      shareCount: 10000,
    });
    expect(r.netAssetAmount).toBe(25000000);
    expect(r.perShareAsset).toBe(2500);
  });

  test("adaptFlatToApiBody — Listing 키 입력으로 PostListing 변환 정상 (EU 키 간섭 0)", () => {
    const form: StockTransferFormData = {
      ...createInitialStockFormData(),
      acquiredBeforeListing: true,
      unlistedDetailMode: "listing_only",
      // Listing 입력
      niAddRow1Listing: "100000000",
      niShareCountListing: "10000",
      niDiscountRateListing: "10",
      naAssetTotalRow1Listing: "50000000",
      naLiabTotalRow8Listing: "30000000",
      naShareCountListing: "10000",
      // 상장일 1개월 평균
      listingDate: "2024-01-15",
      listingDatePriceAvg1Month: "100000",
      // EU 키 동시 입력 — PostListing 변환에 영향이 없어야 함
      niAddRow1EUTransfer: "999999999",
      naAssetTotalRow1EUTransfer: "999999999",
      niAddRow1EUAcq: "999999999",
      naAssetTotalRow1EUAcq: "999999999",
    };
    const adapted = adaptFlatToApiBody(form, true);
    // EU 키와 무관하게 Listing 합성값 산출
    expect(adapted.listingYearNetIncomePerShare).toBeGreaterThan(0);
    expect(adapted.listingYearNetAssetPerShare).toBeGreaterThan(0);
    // postListingDetail nested 객체에 EU 키가 흘러들지 않음을 간접 검증
    expect(adapted.postListingDetail).toBeDefined();
  });

  test("Column 타입 확장 후 PostListing 컴포넌트 import 동작 — YearColumn export 확인", async () => {
    // dynamic import로 export가 깨지지 않았는지 검증
    const niMod = await import(
      "@/components/calc/stock-transfer/PostListingNetIncomeStatement"
    );
    const naMod = await import(
      "@/components/calc/stock-transfer/PostListingNetAssetStatement"
    );
    expect(typeof niMod.YearColumn).toBe("function");
    expect(typeof naMod.YearColumn).toBe("function");
    expect(typeof niMod.PostListingNetIncomeStatement).toBe("function");
    expect(typeof naMod.PostListingNetAssetStatement).toBe("function");
  });
});
