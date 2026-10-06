/**
 * @vitest-environment jsdom
 *
 * 분할 양도 모드 — Step2 자동 산출 카드 · 사이드바 취득가액 (D-3)
 *
 * 계획서 `docs/00-pm/stock-split-lots-ui-bugfix.plan.md` §1 D-3 · §2 F-3
 *
 *   SB-1  사이드바 취득가액 = 선입선출 매칭분 104,000,000 (종전 Σ전 매수 lot 196,000,000)
 *   S2-1  Step2 는 분할 모드에서 빈 입력칸 대신 산출 값을 보여준다 (양도 200,000,000 · 취득 104,000,000)
 *   S2-2  입력이 덜 채워지면 0원이 아니라 「입력하면 산출」 안내
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { reportedSplitForm } from "../../calc/stock-split-lots-fixture";

afterEach(cleanup);

describe("SB 사이드바 (결과 도착 전)", () => {
  beforeEach(() => {
    useStockTransferStore.setState({
      formData: reportedSplitForm(),
      savedItems: [],
      result: null,
      aggregateResult: null,
    });
  });

  it("SB-1 취득가액은 양도분 매칭 원가 104,000,000 — 전 매수 합계 196,000,000 이 아니다", () => {
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.getByText("104,000,000")).toBeTruthy();
    expect(screen.queryByText("196,000,000")).toBeNull();
    expect(screen.getByText("200,000,000")).toBeTruthy();
  });
});

describe("S2 Step2 분할 모드", () => {
  it("S2-1 산출 값을 보여주고 단건 입력칸(양도가액 합계 · 1주당 취득가액)은 없다", () => {
    render(<Step2 form={reportedSplitForm()} onChange={() => {}} />);
    expect(screen.getByTestId("split-preview-transfer-total").textContent).toBe("200,000,000");
    expect(screen.getByTestId("split-preview-acquisition-total").textContent).toBe("104,000,000");
    // 종전 빈 칸들 — 「양도가액 합계」 total 입력(hint)과 disabled 「1주당 취득가액」(hint)
    expect(screen.queryByText("계약서·등기부 등에 기재된 총 양도대금 (원)")).toBeNull();
    expect(screen.queryByText("분할 모드에서는 매수 건에서 자동 산출됩니다 (1단계 참조)")).toBeNull();
    expect(screen.queryByText("합계 직접 입력")).toBeNull();
  });

  it("S2-2 매도 단가가 비면 0원 대신 안내를 보여준다", () => {
    const f = reportedSplitForm();
    render(
      <Step2
        form={{ ...f, transferLots: [{ ...f.transferLots[0], perShareTransferPrice: "" }] }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("split-preview-transfer-pending")).toBeTruthy();
    expect(screen.getByTestId("split-preview-acquisition-pending")).toBeTruthy();
  });
});
