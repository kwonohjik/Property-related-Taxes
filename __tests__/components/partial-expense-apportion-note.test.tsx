/**
 * B4-2c — 일부양도 필요경비 안분 안내
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-5 · §3.3 U-11
 *
 * ## 법령
 *
 * 국심2005구1458(2005.08.31, 기각) — "취득토지 중 일부 단기 양도" 사안에서
 * **"취득가액 및 필요경비"를 안분**하는 것을 인정 → 필요경비도 취득가액과 같은 기준이다.
 *
 * 「소득세법」 제100조 제2항 후문(KoreanLaw 실측, MST 280405 시행 2026-07-01):
 *   "이 경우 **공통되는** 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산한다."
 *   → "공통되는"이 요건 — 양도분에 **직접 귀속**되면 안분하지 않는다(취득가액 C-2와 동형).
 *
 * ## 항목별
 *
 * | 항목 | 안분 | 이유 |
 * |---|---|---|
 * | 자본적지출(§97①가목) | ✅ | **보유 중** 발생 — 여러 부분에 공통될 수 있다 |
 * | 양도비(§97①나목) | ❌ | **양도 시** 발생 — 이미 양도분에 대한 지출 |
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function renderExpense(over: Partial<AssetForm> = {}, totalTransferExpense?: string) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind: "land",
    ...over,
  } as AssetForm;
  render(
    <AssetSectionExpense
      asset={asset}
      onChange={vi.fn()}
      totalTransferExpense={totalTransferExpense}
    />,
  );
}

describe("B4-2c — partial 시 필요경비 안분 안내", () => {
  it("자본적지출: 직접 귀속/공통 구분 + 취득가액과 같은 기준을 안내한다", () => {
    renderExpense({ areaScenario: "partial" });
    expect(screen.getByText(/직접 귀속되면 그 금액/)).toBeInTheDocument();
    expect(screen.getByText(/취득가액과 같은 기준/)).toBeInTheDocument();
  });

  it("양도비: 안분하지 않음을 명시한다 (양도 시 발생 지출)", () => {
    renderExpense({ areaScenario: "partial" });
    expect(screen.getByText(/양도비는 이번 양도에서 발생한 금액이므로 안분하지 않습니다/)).toBeInTheDocument();
  });

  it("근거 문구 — 「소득세법」 제100조 제2항 후문 「공통되는」 + 심판례", () => {
    renderExpense({ areaScenario: "partial" });
    const basis = screen.getByTestId("partial-expense-basis");
    expect(basis.textContent).toContain("공통되는");
    expect(basis.textContent).toContain("제100조 제2항");
    expect(basis.textContent).toContain("국심2005구1458");
  });

  it("same 시나리오에서는 안내가 노출되지 않는다 (과잉 안내 금지)", () => {
    renderExpense({ areaScenario: "same" });
    expect(screen.queryByTestId("partial-expense-basis")).not.toBeInTheDocument();
    expect(screen.queryByText(/직접 귀속되면 그 금액/)).not.toBeInTheDocument();
  });

  it("areaScenario 미지정도 same 취급 (③ normalize 기본값)", () => {
    renderExpense({ areaScenario: undefined as unknown as AssetForm["areaScenario"] });
    expect(screen.queryByTestId("partial-expense-basis")).not.toBeInTheDocument();
  });
});

describe("B4-2c — 기존 안내와의 우선순위", () => {
  it("폼-수준 총 양도비 자동 안분이 있으면 그 안내가 우선한다 (계산된 값 설명이 더 구체적)", () => {
    renderExpense({ areaScenario: "partial" }, "10,000,000");
    // 문구 마커 갱신 (2026-09-05 · Q08): 종전 「자동 적용 {총액}」은 컴패니언에서 **틀린 숫자**였다
    // (지분율 축이 없어 ratio=1.0 → 모든 카드가 총액을 보여 줬는데 ④는 0을 보냈다).
    // 지금은 §100② 후단대로 「양도가액에 비례하여 안분」이라 적는다. 이 테스트가 고정하는 것은
    // **우선순위**(폼-수준 안내가 partial 안내를 덮는가)이지 문구 자체가 아니다.
    expect(screen.getByText(/양도가액에 비례하여 안분/)).toBeInTheDocument();
    expect(
      screen.queryByText(/양도비는 이번 양도에서 발생한 금액이므로/),
    ).not.toBeInTheDocument();
    // 자본적지출·근거 문구는 그대로 유지된다
    expect(screen.getByTestId("partial-expense-basis")).toBeInTheDocument();
    expect(screen.getByText(/직접 귀속되면 그 금액/)).toBeInTheDocument();
  });

  it("partial이 지분 모드 안내보다 우선한다 (자본적지출)", () => {
    renderExpense({
      areaScenario: "partial",
      ownershipNumerator: "50",
      ownershipDenominator: "100",
    });
    expect(screen.getByText(/직접 귀속되면 그 금액/)).toBeInTheDocument();
    expect(screen.queryByText(/100% 기준 입력/)).not.toBeInTheDocument();
  });

  it("legacy 직접귀속 필요경비 칸에도 같은 안내가 붙는다", () => {
    renderExpense({
      areaScenario: "partial",
      directExpenses: "5000000",
      capitalExpenditure: "0",
      transferExpense: "0",
    });
    // 자본적지출 + legacy 두 곳에 같은 문구 → 2건
    expect(screen.getAllByText(/직접 귀속되면 그 금액/)).toHaveLength(2);
  });
});
