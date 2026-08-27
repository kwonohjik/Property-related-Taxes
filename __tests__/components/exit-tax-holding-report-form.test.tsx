/**
 * @vitest-environment jsdom
 *
 * 별지 제104호서식 — 국외전출자 주식등 보유현황 신고서 〈개정 2026. 3. 20.〉
 *
 * 근거: 소득세법 §118조의15 · 시행령 §178조의11①
 *
 * ⚠️ **사용자 제공 PDF 는 구판이었다** — 〈개정 2024.12.31.〉 과 최신본은 세 군데가 다르다:
 *    제목에서 「국내」 삭제 · ⑩ 이 「종목코드 또는 사업자등록번호(해외주식은 ISIN코드와 국가명)」
 *    로 확장 · 시행령 §178의8② 제외 안내 신설. anchor 가 **최신본 문구**를 고정한다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExitTaxHoldingReportForm } from "@/components/calc/results/ExitTaxHoldingReportForm";
import { createEmptyExitTaxHolding } from "@/lib/stores/calc-wizard-stock-types";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-types";

afterEach(cleanup);

function holding(o: Partial<ExitTaxHoldingForm> = {}): ExitTaxHoldingForm {
  return {
    ...createEmptyExitTaxHolding(),
    stockName: "테스트전자",
    shareCount: "100000",
    faceValuePerShare: "500",
    stockCodeOrBizNumber: "005930",
    ownershipRatio: "1.5",
    ...o,
  };
}

describe("HR-1 양식 골격", () => {
  it("HR-1-1: 최신본 제목 — 「국내」가 없다", () => {
    render(<ExitTaxHoldingReportForm holdings={[]} departureDate="" />);
    expect(screen.getByText("국외전출자 주식등 보유현황 신고서")).toBeTruthy();
    expect(screen.queryByText(/국외전출자국내주식등/)).toBeNull();
  });

  it("HR-1-2: ⑩ 열 제목이 확장본이다 (ISIN 코드 포함)", () => {
    render(<ExitTaxHoldingReportForm holdings={[]} departureDate="" />);
    expect(screen.getByText(/ISIN코드와 국가명/)).toBeTruthy();
  });

  it("HR-1-3: 시행령 §178의8② 제외 안내가 있다 (최신본 신설)", () => {
    render(<ExitTaxHoldingReportForm holdings={[]} departureDate="" />);
    expect(screen.getByText(/제178조의8제2항/)).toBeTruthy();
  });

  it("HR-1-4: 근거 조문 §118의15 · 시행령 §178의11①", () => {
    render(<ExitTaxHoldingReportForm holdings={[]} departureDate="" />);
    expect(screen.getByText(/제118조의15 및 같은 법 시행령 제178조의11제1항/)).toBeTruthy();
  });
});

describe("HR-2 행 수 — 20행 고정", () => {
  it("HR-2-1: 보유 0건이면 빈 행 20개", () => {
    render(<ExitTaxHoldingReportForm holdings={[]} departureDate="" />);
    expect(screen.getByTestId("table-data-tbody").querySelectorAll("tr")).toHaveLength(20);
  });

  it("HR-2-2: 보유 3건이면 데이터 3 + 빈 행 17 = 20", () => {
    render(
      <ExitTaxHoldingReportForm
        holdings={[holding(), holding({ stockName: "B" }), holding({ stockName: "C" })]}
        departureDate=""
      />,
    );
    const tbody = screen.getByTestId("table-data-tbody");
    expect(tbody.querySelectorAll("tr")).toHaveLength(20);
    expect(screen.getByTestId("row-data-3")).toBeTruthy();
    expect(screen.getByTestId("row-empty-17")).toBeTruthy();
  });

  it("HR-2-3: 21건이면 양식이 늘어난다 (잘라내지 않는다)", () => {
    const many = Array.from({ length: 21 }, (_, i) => holding({ stockName: `종목${i}` }));
    render(<ExitTaxHoldingReportForm holdings={many} departureDate="" />);
    expect(screen.getByTestId("table-data-tbody").querySelectorAll("tr")).toHaveLength(21);
  });
});

describe("HR-3 채우는 칸", () => {
  it("HR-3-1: ⑧ 출국(예정)일", () => {
    render(<ExitTaxHoldingReportForm holdings={[]} departureDate="2026-06-01" />);
    expect(screen.getByTestId("row-8-departure-date").textContent).toBe("2026-06-01");
  });

  it("HR-3-2: ⑨⑩⑪⑬ 이 폼 값 그대로", () => {
    render(<ExitTaxHoldingReportForm holdings={[holding()]} departureDate="" />);
    const row = screen.getByTestId("row-data-1");
    expect(row.querySelector('[data-testid="col-corp-name"]')!.textContent).toBe("테스트전자");
    expect(row.querySelector('[data-testid="col-stock-code"]')!.textContent).toBe("005930");
    expect(row.querySelector('[data-testid="col-share-count"]')!.textContent).toBe("100,000");
    expect(row.querySelector('[data-testid="col-ownership-ratio"]')!.textContent).toBe("1.5");
  });

  it("HR-3-3: ⑫ 액면총액 = 액면가 × 주식수 (500 × 100,000 = 50,000,000)", () => {
    render(<ExitTaxHoldingReportForm holdings={[holding()]} departureDate="" />);
    expect(
      screen.getByTestId("row-data-1").querySelector('[data-testid="col-face-total"]')!.textContent,
    ).toBe("50,000,000");
  });

  it("HR-3-4: 액면가 미입력이면 ⑫ 를 **추정하지 않고** 비운다", () => {
    render(
      <ExitTaxHoldingReportForm holdings={[holding({ faceValuePerShare: "" })]} departureDate="" />,
    );
    const cell = screen
      .getByTestId("row-data-1")
      .querySelector('[data-testid="col-face-total"]')!;
    expect(cell.textContent!.trim()).toBe("");
  });
});
