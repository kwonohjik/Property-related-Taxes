/**
 * @vitest-environment jsdom
 *
 * anchor: PostListingDetailCard 「상장연도·취득연도 1주당 가중평균」 산출근거 표시
 *   (라벨 + 변수값 + 분수 가중치).
 *
 * 진입점은 **엔진**이다 — 카드에 손으로 만든 결과를 넣으면 echo(`weightedBasis`)가
 * 실제로 채워지는지는 검증되지 않는다. `calcPostListingConversion()`이 낸 결과를
 * 그대로 카드에 넘겨 엔진→표시 두 층을 한 번에 고정한다.
 *   [[feedback_leaf_anchor_skips_zod_layer]]
 *
 * 가중치는 **연혁·§94①4다목 반전이 반영된 실제 적용값**이라 화면이 3/5·2/5를
 * 하드코딩하면 안 된다 — WB-3(반전)·WB-4(1998 이전 순자산 단독)가 그 구별력을 준다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { calcPostListingConversion } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { PostListingDetailCard } from "@/components/calc/results/PostListingDetailCard";
import type {
  StockTransferInput,
  StockTransferResult,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

function conv(over: Partial<StockTransferInput>) {
  return calcPostListingConversion({
    transferDate: new Date("2023-02-26"),
    acquisitionDate: new Date("2004-07-01"),
    listingDate: new Date("2018-07-01"),
    acquiredBeforeListing: true,
    shareCount: 5_000,
    listingDatePriceAvg1Month: 8_001,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
    isHeavyRealEstateForValuation: false,
    ...over,
  } as StockTransferInput);
}

/** 엔진 결과를 그대로 카드에 실어 렌더 — 카드가 보는 것은 오직 result다. */
function renderCard(post: ReturnType<typeof conv>) {
  const result = {
    acquiredBeforeListing: true,
    postListingDetail: post,
    transferPrice: 44_750_000,
    acquisitionPrice: 30_098_625,
    valuationDetail: {
      conversionAcqStdPerShare: post.finalPerShareValue,
      conversionTransferStd: 8_659,
    },
  } as unknown as StockTransferResult;
  return render(<PostListingDetailCard result={result} />);
}

/** 분수(Frac) 분모 칸 = `border-t` span. 텍스트는 "분자분모"로 이어 붙는다. */
function fracCount(el: HTMLElement) {
  return el.querySelectorAll("span.border-t").length;
}

describe("WB — 취득 후 상장 환산 가중평균 산출근거 (§165④1)", () => {
  it("WB-1 — 엔진이 순손익·순자산 변수값과 실제 가중치를 echo한다", () => {
    const r = conv({});
    expect(r.weightedBasis).toEqual({
      niWeight: 3,
      naWeight: 2,
      listing: { netIncomeValue: 61_570, netAssetValue: 5_352, weightedRaw: 39_082 },
      acquisition: { netIncomeValue: 44_520, netAssetValue: 4_348, weightedRaw: 28_451 },
    });
    // 하한 미발동 픽스처 — 가중평균 = 평가액
    expect(r.listingYearPerShareValue).toBe(39_082);
    expect(r.acquisitionYearPerShareValue).toBe(28_451);
  });

  it("WB-2 — 카드가 라벨·변수값·분수 가중치로 산식을 펼친다", () => {
    const { container } = renderCard(conv({}));
    const text = container.textContent ?? "";
    expect(text).toContain(
      "상장연도 1주당 가중평균 = 순손익가치 61,570 × 35 + 순자산가치 5,352 × 25 = 39,082",
    );
    expect(text).toContain(
      "취득연도 1주당 가중평균 = 순손익가치 44,520 × 35 + 순자산가치 4,348 × 25 = 28,451",
    );
    // 두 줄 × 분수 2개 = 4 (환산비율·§163⑨ 분수는 별도)
    expect(fracCount(container as unknown as HTMLElement)).toBeGreaterThanOrEqual(4);
  });

  it("WB-3 — §94①4다목 반전 시 화면 가중치도 2:3으로 뒤집힌다 (하드코딩 금지)", () => {
    const r = conv({
      isHeavyRealEstateForValuation: true,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 50,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 50,
    });
    expect(r.weightedBasis?.niWeight).toBe(2);
    expect(r.weightedBasis?.naWeight).toBe(3);
    const { container } = renderCard(r);
    // 반전: 100×2/5 + 50×3/5 = 70 (일반 3:2였다면 80)
    expect(container.textContent).toContain("순손익가치 100 × 25 + 순자산가치 50 × 35 = 70");
  });

  it("WB-4 — 1998년 이전 양도는 순자산 단독(0:5) 가중치를 그대로 보여준다", () => {
    const r = conv({
      transferDate: new Date("1998-06-30"),
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 50,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 40,
    });
    expect(r.weightedBasis?.niWeight).toBe(0);
    expect(r.weightedBasis?.naWeight).toBe(5);
    const { container } = renderCard(r);
    expect(container.textContent).toContain("순손익가치 100 × 05 + 순자산가치 50 × 55 = 50");
  });

  it("WB-5 — 80% 하한(§165④1 단서) 발동 시 보정 줄을 한 줄 더 쓴다", () => {
    // 상장연도: 10×3/5 + 1,000×2/5 = 406 < 1,000×80% = 800 → 하한 발동
    const r = conv({
      listingYearNetIncomePerShare: 10,
      listingYearNetAssetPerShare: 1_000,
    });
    expect(r.detail?.floor80Applied.listing).toBe(true);
    expect(r.weightedBasis?.listing.weightedRaw).toBe(406);
    expect(r.listingYearPerShareValue).toBe(800);

    const { container } = renderCard(r);
    const text = container.textContent ?? "";
    expect(text).toContain("순손익가치 10 × 35 + 순자산가치 1,000 × 25 = 406");
    expect(text).toContain("→ 순자산가치 1,000 × 80100 = 800");
    expect(text).toContain("소득세법 시행령 §165④1 단서");
  });

  it("WB-6 — echo 없는 과거 저장 결과는 값만 표시한다 (하위 호환)", () => {
    const legacy = { ...conv({}) };
    delete (legacy as { weightedBasis?: unknown }).weightedBasis;
    const { container } = renderCard(legacy);
    const text = container.textContent ?? "";
    expect(text).toContain("상장연도 1주당 가중평균 = 39,082");
    expect(text).not.toContain("순손익가치");
  });
});
