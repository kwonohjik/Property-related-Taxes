/**
 * @vitest-environment jsdom
 *
 * ⑥ 주식 사이드바 — **다종목 합산 반영** anchor
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase D · A-1)
 *
 * ## 왜 이 파일이 필요한가
 *
 * Phase 0 뮤테이션 실측에서 `StockSidebar` 의 summary 를 **통째로 무력화해도 실패가 0건**이었다
 * (전건 vitest + grep 양쪽에서 참조 0). 「회귀 0건」이 「영향 없음」이 아니라 **아무도 안 보고
 * 있다**는 뜻이었다 — 그래서 다종목을 배선하기 전에 안전망부터 심는다.
 *
 * ## 무엇을 고정하는가
 *
 * 확정 종목(`savedItems`)이 있어도 사이드바가 **편집 중 1건만** 보여주면, 3종목을 확정한
 * 사용자가 「양도가액 1억」을 보고 그게 신고 전체인 줄 안다. 실제 신고는 3종목 합산이다.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import {
  useStockTransferStore,
  createInitialStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-aggregate";

afterEach(cleanup);

/** 양도가액 = 1주당 × 주식수 로 계산되는 최소 폼 */
function item(name: string, perShare: string, count: string): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: name,
    marketType: "kospi",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: perShare,
    shareCount: count,
  };
}

beforeEach(() => {
  useStockTransferStore.setState({
    formData: item("편집중", "100000", "100"), // 10,000,000
    savedItems: [],
    result: null,
    aggregateResult: null,
  });
});

function renderSidebar() {
  return render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
}

describe("SD-1 확정 종목이 없으면 종전대로 편집 중 1건", () => {
  it("SD-1-1: 양도가액 10,000,000 · 합산 배지 없음", () => {
    renderSidebar();
    expect(screen.getByText("양도가액")).toBeTruthy();
    expect(screen.getByText("10,000,000")).toBeTruthy();
    expect(screen.queryByText(/합산/)).toBeNull();
  });
});

describe("SD-2 확정 종목이 있으면 **합산**임을 사이드바가 말한다", () => {
  beforeEach(() => {
    useStockTransferStore.setState({
      savedItems: [item("첫째", "200000", "100"), item("둘째", "300000", "100")], // 20,000,000 + 30,000,000
    });
  });

  it("SD-2-1: 확정 2건 + 편집 중 1건 = 3건 합산 배지", () => {
    renderSidebar();
    expect(screen.getByText(/3건 합산/)).toBeTruthy();
  });

  it("SD-2-2: 계산 전에도 양도가액은 **전 종목 합계** 60,000,000", () => {
    renderSidebar();
    expect(screen.getByText("양도가액 합계")).toBeTruthy();
    expect(screen.getByText("60,000,000")).toBeTruthy();
  });

  it("SD-2-3: 세액 항목은 계산 전에 추정하지 않는다 — 세율·기본공제가 종목마다 갈린다", () => {
    renderSidebar();
    expect(screen.queryByText("과세표준")).toBeNull();
    expect(screen.queryByText("산출세액")).toBeNull();
  });
});

describe("SD-3 계산 후에는 **엔진 합계값**을 쓴다", () => {
  const agg = {
    items: [],
    totalTransferIncome: 55_000_000,
    basicDeductionByGroup: { stock: 2_500_000, real_estate_and_other_asset: 0 },
    totalTaxBase: 52_500_000,
    totalCalculatedTax: 10_500_000,
    totalUnderReportPenalty: 1_050_000,
    totalLatePaymentPenalty: 68_200,
    electronicFilingCredit: 0,
    totalFinalTax: 11_618_200,
    totalLocalIncomeTax: 1_050_000,
    totalSecuritiesTransactionTax: {
      securitiesTransactionTax: 105_000,
      agriculturalTax: 90_000,
      totalTax: 195_000,
    },
  } as unknown as StockTransferAggregateResult;

  beforeEach(() => {
    useStockTransferStore.setState({
      savedItems: [item("첫째", "200000", "100")],
      aggregateResult: agg,
    });
  });

  it("SD-3-1: 양도소득금액·과세표준·산출세액이 합계값이다", () => {
    renderSidebar();
    expect(screen.getByText("55,000,000")).toBeTruthy();
    expect(screen.getByText("52,500,000")).toBeTruthy();
    expect(screen.getByText("10,500,000")).toBeTruthy();
  });

  it("SD-3-2: 가산세도 신고 단위 합계로 보인다 (Phase A′ 산물)", () => {
    renderSidebar();
    expect(screen.getByText("가산세")).toBeTruthy();
    expect(screen.getByText("1,118,200")).toBeTruthy(); // 1,050,000 + 68,200
  });

  it("SD-3-3: 결정세액은 aggregate 값", () => {
    renderSidebar();
    expect(screen.getByText("11,618,200")).toBeTruthy();
  });
});
