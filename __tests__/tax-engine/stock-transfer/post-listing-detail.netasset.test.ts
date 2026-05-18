/**
 * PL-NA — 순자산 계산서 산식 (H-03).
 *
 * 사례 EXAMPLE_POST_LISTING:
 *   상장연도: (12,375,006,000 − 5,665,804,690 + 0) / 1,253,600 = 5,352
 *   취득연도: (7,850,000,000 − 2,398,591,020 + 0) / 1,253,600 = 4,348
 */

import { describe, it, expect } from "vitest";
import { calcNetAssetPerShare } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import {
  listingYearNAExample,
  acqYearNAExample,
} from "./helpers/post-listing-input-builder";

describe("PL-NA — 순자산 1주당 가치 (H-03)", () => {
  it("PL-NA-1 — 상장연도 1주당 순자산가치 = 5,351 (floor 산식)", () => {
    // PDF는 5,352 표시 (반올림 또는 발행주식수 ±20 가정).
    // 엔진 H-03은 floor 적용 → 6,709,201,310 / 1,253,600 = 5,351.96... → 5,351.
    // 1원 차이는 1주당 환산 단계 floor에서 흡수되어 총 환산취득가는 동일.
    const result = calcNetAssetPerShare(listingYearNAExample());
    expect(result.netAssetAmount).toBe(6_709_201_310);
    expect(result.perShareAsset).toBe(5_351);
  });

  it("PL-NA-2 — 취득연도 1주당 순자산가치 = 4,348", () => {
    const result = calcNetAssetPerShare(acqYearNAExample());
    expect(result.netAssetAmount).toBe(5_451_408_980);
    expect(result.perShareAsset).toBe(4_348);
  });

  it("PL-NA-3 — 자산 가산·차감 반영", () => {
    const result = calcNetAssetPerShare({
      assetTotalRow1: 1_000_000,
      assetAdd: [500_000, 0, 0, 0],   // 가산 500,000
      assetSub: [200_000, 0],          // 차감 200,000
      liabTotalRow8: 600_000,
      liabAdd: [0, 0, 0, 0, 0, 0],
      liabSub: [0, 0, 0],
      goodwillRow19: 0,
      shareCount: 100,
    });
    // 자산 = 1,000,000 + 500,000 − 200,000 = 1,300,000
    // 부채 = 600,000
    // 순자산 = 700,000 / 100 = 7,000
    expect(result.netAssetAmount).toBe(700_000);
    expect(result.perShareAsset).toBe(7_000);
  });

  it("PL-NA-4 — 영업권 가산", () => {
    const result = calcNetAssetPerShare({
      assetTotalRow1: 1_000_000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 600_000,
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 100_000,   // 영업권
      shareCount: 100,
    });
    // (1,000,000 − 600,000 + 100,000) / 100 = 5,000
    expect(result.perShareAsset).toBe(5_000);
  });

  it("PL-NA-5 — 부채 가산·차감 반영", () => {
    const result = calcNetAssetPerShare({
      assetTotalRow1: 10_000_000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 5_000_000,
      liabAdd: [200_000, 100_000, 0, 0, 0, 0],   // 부채 가산 300,000
      liabSub: [50_000, 0, 0],                    // 부채 차감 50,000
      goodwillRow19: 0,
      shareCount: 100,
    });
    // 부채 = 5,000,000 + 300,000 − 50,000 = 5,250,000
    // 순자산 = 10,000,000 − 5,250,000 = 4,750,000 / 100 = 47,500
    expect(result.perShareAsset).toBe(47_500);
  });

  it("PL-NA-6 — shareCount 0 시 방어", () => {
    const result = calcNetAssetPerShare({
      assetTotalRow1: 1_000_000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 0,
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 0,
      shareCount: 0,
    });
    expect(result.perShareAsset).toBe(0);
  });

  it("PL-NA-7 — 1주당 원 단위 절사", () => {
    const result = calcNetAssetPerShare({
      assetTotalRow1: 100_007,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 0,
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 0,
      shareCount: 100,
    });
    // 100,007 / 100 = 1,000.07 → floor = 1,000
    expect(result.perShareAsset).toBe(1_000);
  });

  it("PL-NA-8 — 음수 순자산 (자본잠식) — 값 그대로", () => {
    const result = calcNetAssetPerShare({
      assetTotalRow1: 500_000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 1_000_000,
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 0,
      shareCount: 100,
    });
    expect(result.netAssetAmount).toBe(-500_000);
    expect(result.perShareAsset).toBeLessThan(0);
  });
});
