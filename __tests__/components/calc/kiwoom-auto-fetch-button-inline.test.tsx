/**
 * KiwoomValuationAutoFetchButton variant="inline" + KiwoomValuationResultCard 분리 anchor.
 *
 * Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md §3 Step A-1.5·A-1.6
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KiwoomValuationAutoFetchButton } from "@/components/calc/KiwoomValuationAutoFetchButton";
import { KiwoomValuationResultCard } from "@/components/calc/inheritance/listed-stock/KiwoomValuationResultCard";

const MOCK_INFO = {
  average: 61_465,
  tradingDays: 84,
  sum: 5_163_060,
  stockName: "삼성전자",
  slotDates: ["2022-07-06"],
  closingPrices: [61_465],
  weekendLabels: [""],
  valuationPeriodStart: "2022-05-07",
  valuationPeriodEnd: "2022-09-05",
};

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => MOCK_INFO,
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("KiwoomValuationAutoFetchButton variant='inline' — A-1.5", () => {
  it("inline variant: 헤더('키움증권 자동조회 (전후 2개월 평균)') 렌더되지 않음", () => {
    render(
      <KiwoomValuationAutoFetchButton
        variant="inline"
        stockCode="005930"
        valuationDate="2022-07-06"
      />,
    );
    expect(screen.queryByText(/키움증권 자동조회 \(전후 2개월 평균\)/)).toBeNull();
    expect(screen.queryByText(/종목코드 \+ 평가기준일 입력 후 클릭/)).toBeNull();
  });

  it("inline variant: 버튼 단독 렌더 — sky 박스 테두리 미렌더", () => {
    const { container } = render(
      <KiwoomValuationAutoFetchButton
        variant="inline"
        stockCode="005930"
        valuationDate="2022-07-06"
      />,
    );
    // 최상위 노드가 button (sky 박스 div 아님)
    expect(container.firstChild?.nodeName).toBe("BUTTON");
    const btn = screen.getByRole("button", { name: /키움 자동조회/ });
    expect(btn.textContent).toContain("🔍 키움 자동조회");
  });

  it("inline variant: disabled 사유는 본 컴포넌트에서 표시하지 않음 (부모 위임)", () => {
    render(
      <KiwoomValuationAutoFetchButton
        variant="inline"
        stockCode="" // codeValid=false
        valuationDate="2022-07-06"
      />,
    );
    // amber 박스 "⚠️ 종목코드 6자리 입력 필요" 미렌더 (card variant 의 동작과 대비)
    expect(screen.queryByText(/종목코드 6자리 입력 필요/)).toBeNull();
    // 버튼은 disabled (title 속성에 사유)
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("종목코드 6자리");
  });

  it("card variant (기본): 헤더·설명 텍스트 렌더 — 기존 동작 회귀 가드", () => {
    render(
      <KiwoomValuationAutoFetchButton
        stockCode="005930"
        valuationDate="2022-07-06"
      />,
    );
    expect(screen.getByText(/키움증권 자동조회 \(전후 2개월 평균\)/)).toBeTruthy();
    expect(screen.getByText(/종목코드 \+ 평가기준일 입력 후 클릭/)).toBeTruthy();
  });
});

describe("KiwoomValuationResultCard — A-1.6 결과 카드 분리", () => {
  it("info=null + error=null → 미렌더 (null)", () => {
    const { container } = render(
      <KiwoomValuationResultCard
        info={null}
        error={null}
        valuationDate="2022-07-06"
        showDetail={false}
        onToggleDetail={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("info 있음 → 평가구간·종목명·평균 산식·일자별 토글 표시", () => {
    render(
      <KiwoomValuationResultCard
        info={MOCK_INFO}
        error={null}
        valuationDate="2022-07-06"
        showDetail={false}
        onToggleDetail={vi.fn()}
      />,
    );
    expect(screen.getByTestId("ls-valuation-result-card")).toBeTruthy();
    expect(screen.getByText(/삼성전자/)).toBeTruthy();
    expect(screen.getByText(/평가구간/)).toBeTruthy();
    expect(screen.getByText(/61,465/)).toBeTruthy();
    expect(screen.getByText(/일자별 종가/)).toBeTruthy();
  });

  it("showError=false 시 error 텍스트는 본 카드에서 미노출 (부모 위임)", () => {
    render(
      <KiwoomValuationResultCard
        info={null}
        error="키움 API 미설정 — 수동 입력 가능"
        valuationDate="2022-07-06"
        showDetail={false}
        onToggleDetail={vi.fn()}
        showError={false}
      />,
    );
    expect(screen.queryByText(/키움 API 미설정/)).toBeNull();
  });

  it("showError=true (기본) 시 error 텍스트 본 카드에서 노출", () => {
    render(
      <KiwoomValuationResultCard
        info={null}
        error="키움 API 미설정 — 수동 입력 가능"
        valuationDate="2022-07-06"
        showDetail={false}
        onToggleDetail={vi.fn()}
      />,
    );
    expect(screen.getByText(/키움 API 미설정/)).toBeTruthy();
  });
});
