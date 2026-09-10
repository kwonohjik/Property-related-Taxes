/**
 * @vitest-environment jsdom
 *
 * anchor: 취득 후 상장(§165⑤) 경로의 **취득가액 산식은 화면에 한 판만 있다**
 *
 * 계획서 `docs/00-pm/stock-listed-conversion-unification.plan.md` §6-4 ② 후속.
 *
 * ## 무엇을 없앴고, 왜 anchor가 필요한가
 *
 * `StockTransferTaxResultViewHelpers.tsx`에 이런 줄이 있었다:
 *
 *   취득가액 = {finalPerShareValue} × {shareCount}주 = {result.acquisitionPrice}
 *
 * **좌변과 우변이 맞지 않는다.** S1이 §176의2②1호 환산을 정본으로 세운 뒤
 * 취득가액은 `양도가 × (취득기준시가 ÷ 양도기준시가)`이지 `1주당 × 주식수`가 아니다.
 * 실측(S2 MTX-R3): 5,824 × 1,000주 = 5,824,000인데 취득가액은 26,064,147이다 — **4.5배**.
 * 그 곱셈의 결과는 취득가액이 아니라 **취득기준시가 총액**(개산공제 base)이고,
 * 같은 카드가 바로 아래 줄에서 이미 그 이름으로 표시하고 있었다.
 *
 * 그 블록이 화면에 뜨지 않았던 이유는 계획서가 적은 「`method` 게이팅」이 **아니다**.
 * 게이트는 `method === "post_listing_conversion" && weightedAvgPerShare !== undefined`였고,
 * 그 method를 세팅하는 **2곳**(`stock-acquisition-basis.ts:150` ·
 * `exempt-informational-acquisition.ts:118`) 중 어느 쪽도 `weightedAvgPerShare`를
 * 채우지 않는다. 즉 **우연한 두 번째 conjunct**가 잠가둔 문이었다.
 * 누군가 그 필드를 채우는 순간 틀린 산식이 살아난다 —
 * [[feedback_ui_gate_expansion_activates_latent_defect]].
 *
 * ## 이 파일이 잡는 «재도입 두 변형»
 *
 *   PLF-2 … method만 보고 다시 넣는 변형 (conjunct 없이 복원)
 *   PLF-3 … 원래 게이트 그대로 복원 + 누군가 weightedAvgPerShare를 채운 미래
 *
 * PLF-1은 그 둘의 **positive twin**이다 — 「어디에도 없다」만 두면 카드가 통째로
 * 안 그려져도 통과한다([[feedback_negative_anchor_needs_positive_twin]]).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PostListingDetailCard } from "@/components/calc/results/PostListingDetailCard";
import { EstimatedValuationBreakdown } from "@/components/calc/results/StockTransferTaxResultViewHelpers";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

// ── S2 회귀표 MTX-R3 실측값 (stock-conversion-branch-matrix.anchor.test.ts) ──
const SHARE_COUNT = 1_000;
const TRANSFER_PRICE = 44_753_000;
const FINAL_PER_SHARE = 5_824;
const TRANSFER_STD = 10_000;
/** §163⑥4 개산공제 base = 1주당 취득기준시가 × 주식수 */
const ESTIMATED_BASE = FINAL_PER_SHARE * SHARE_COUNT; // 5,824,000
/** §176의2②1호 환산 = 양도가 × (취득기준 ÷ 양도기준) */
const ACQUISITION_PRICE = 26_064_147;

function result(over: Partial<StockTransferResult> = {}): StockTransferResult {
  return {
    acquiredBeforeListing: true,
    transferPrice: TRANSFER_PRICE,
    acquisitionPrice: ACQUISITION_PRICE,
    estimatedBase: ESTIMATED_BASE,
    estimatedDeduction: Math.floor(ESTIMATED_BASE * 0.01),
    usedEstimatedAcquisition: true,
    appliedRules: [],
    valuationDetail: {
      method: "post_listing_conversion",
      netAssetFloorApplied: false,
      finalPerShareValue: FINAL_PER_SHARE,
      conversionAcqStdPerShare: FINAL_PER_SHARE,
      conversionTransferStd: TRANSFER_STD,
    },
    postListingDetail: {
      listingYearPerShareValue: 39_082,
      acquisitionYearPerShareValue: 28_451,
      conversionRatio: 0.72801,
      finalPerShareValue: FINAL_PER_SHARE,
      monthlyAccrualApplied: false,
      listingClosingAvg1Month: 8_001,
      appliedRules: [],
      warnings: [],
    },
    ...over,
  } as unknown as StockTransferResult;
}

describe("PLF — 취득 후 상장 취득가액 산식 단일 소스", () => {
  /**
   * 🔑 **픽스처 가드.** 두 수가 우연히 같으면 아래 단언이 전부 무의미해진다
   * ([[feedback_fixture_default_masks_gate_defect]]).
   */
  it("PLF-0: 취득가액과 취득기준시가 총액은 서로 다른 수다", () => {
    expect(ACQUISITION_PRICE).not.toBe(ESTIMATED_BASE);
    expect(ACQUISITION_PRICE).toBe(
      Math.floor((TRANSFER_PRICE * FINAL_PER_SHARE) / TRANSFER_STD),
    );
  });

  it("PLF-1: 취득가액 산식은 PostListingDetailCard가 «양도가 × 분자/분모»로 보여준다", () => {
    const { container } = render(<PostListingDetailCard result={result()} />);
    const text = container.textContent ?? "";

    expect(text).toContain("환산취득가");
    expect(text).toContain(TRANSFER_PRICE.toLocaleString());
    expect(text).toContain(TRANSFER_STD.toLocaleString()); // 분모가 산식에 드러난다
    expect(text).toContain(ACQUISITION_PRICE.toLocaleString());
  });

  it("PLF-2: EstimatedValuationBreakdown은 취득가액을 재구성하지 않는다", () => {
    const { container } = render(<EstimatedValuationBreakdown result={result()} />);
    const text = container.textContent ?? "";

    // positive — 이 카드의 몫은 «취득기준시가 총액»과 개산공제다
    expect(text).toContain("취득기준시가 합계");
    expect(text).toContain(ESTIMATED_BASE.toLocaleString());
    // negative — 취득가액은 여기서 말하지 않는다
    expect(text).not.toContain(ACQUISITION_PRICE.toLocaleString());
    expect(text).not.toContain(`× ${SHARE_COUNT.toLocaleString()}주`);
  });

  /**
   * 🔴 **잠겨 있던 문.** 종전 게이트의 두 번째 조건이 `weightedAvgPerShare !== undefined`라
   * 이 필드가 채워지는 순간 틀린 산식이 살아났다. 지금은 블록 자체가 없으므로
   * 채워도 아무 일이 없어야 한다.
   */
  it("PLF-3: weightedAvgPerShare가 채워져도 틀린 산식이 살아나지 않는다", () => {
    const r = result({
      valuationDetail: {
        method: "post_listing_conversion",
        netAssetFloorApplied: false,
        finalPerShareValue: FINAL_PER_SHARE,
        conversionAcqStdPerShare: FINAL_PER_SHARE,
        conversionTransferStd: TRANSFER_STD,
        weightedAvgPerShare: 33_000,
      },
    } as Partial<StockTransferResult>);

    const { container } = render(<EstimatedValuationBreakdown result={r} />);
    const text = container.textContent ?? "";

    expect(text).toContain(ESTIMATED_BASE.toLocaleString()); // 카드는 여전히 그려진다
    expect(text).not.toContain(ACQUISITION_PRICE.toLocaleString());
    expect(text).not.toContain(`× ${SHARE_COUNT.toLocaleString()}주`);
  });
});
