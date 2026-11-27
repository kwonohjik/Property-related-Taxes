/**
 * @vitest-environment jsdom
 *
 * 국외전출세 ⑤ 보유 종목 합계 미리보기 — 국외 외화 행을 0으로 세지 않는다 (14지점 점검 F7)
 *
 * 합계가 «시가 입력 3종»만 읽어 외화 모드(`departureDayPriceForeign × 환율`) 행을 0으로 셌다.
 * 사이드바(`StockSidebar`)와 같은 계산 소스(`foreignDepartureValueKrw` → 엔진 `toKrwExact`)를 쓰고,
 * 합산 단위가 다른 국내(원화 입력)와 국외(외화 환산 참고)는 사이드바처럼 별도 줄로 둔다.
 * 국외 행이 없으면 종전 라벨·값 그대로(2026 이전 출국 SSR 기준선이 같은 마크업을 고정한다).
 */
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ExitTaxHoldingsMatrix } from "@/components/calc/stock-transfer/ExitTaxHoldingsMatrix";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { useStockTransferStore, createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import { F1, H1 } from "../_helpers/exit-tax-2027-form";

afterEach(cleanup);
const noop = () => {};
const OLD = "보유 종목 합계 간주양도가액 (참고):";
const DOM = "국내주식 합계 간주양도가액 (참고):";
const FOR = "국외주식 합계 간주양도가액 (환산 참고):";
const text = () => document.body.textContent ?? "";

describe("F7 합계 미리보기", () => {
  it("H1 + F1(2027) → 국내 500,000,000 · 국외 1,400,000,000이 따로 보인다 (외화 행이 0이 아니다)", () => {
    render(<ExitTaxHoldingsMatrix holdings={[H1(), F1()]} onChange={noop} departureDate="2027-01-01" />);
    expect(text()).toContain(DOM);
    expect(text()).toContain("500,000,000");
    expect(text()).toContain(FOR);
    expect(text()).toContain("1,400,000,000");
    expect(text()).not.toContain(OLD);
  });

  it("국외 행만 둘(2027) → 국외 줄만, 국내 줄은 0이라 없다", () => {
    render(<ExitTaxHoldingsMatrix holdings={[F1(), F1({ id: "f2" })]} onChange={noop} departureDate="2027-01-01" />);
    expect(text()).toContain(FOR);
    expect(text()).toContain("2,800,000,000");
    expect(text()).not.toContain(DOM);
    expect(text()).not.toContain(OLD);
  });

  it("국내 행만(2027) → 종전 라벨·값 그대로", () => {
    render(<ExitTaxHoldingsMatrix holdings={[H1(), H1({ id: "h2" })]} onChange={noop} departureDate="2027-01-01" />);
    expect(text()).toContain(OLD);
    expect(text()).toContain("1,000,000,000");
    expect(text()).not.toContain(FOR);
  });

  it("2026 출국 → 국외 줄 없음", () => {
    render(<ExitTaxHoldingsMatrix holdings={[H1(), H1({ id: "h2" })]} onChange={noop} departureDate="2026-09-01" />);
    expect(text()).toContain(OLD);
    expect(text()).not.toContain(FOR);
  });
});

describe("F7 사이드바와 같은 값", () => {
  beforeEach(() => useStockTransferStore.setState({ result: null, savedItems: [], aggregateResult: null }));
  it("국외 합계 = 사이드바 «국외주식등 간주양도가액 (환산 참고)»", () => {
    const holdings = [H1(), F1()];
    useStockTransferStore.setState({
      formData: { ...createInitialStockFormData(), marketType: "exit_tax", etDepartureDate: "2027-01-01", etHoldings: holdings },
    });
    render(<StockSidebar currentStep={1} onStepClick={noop} />);
    const side = screen.getByText("국외주식등 간주양도가액 (환산 참고)").closest("div")?.textContent ?? "";
    cleanup();
    render(<ExitTaxHoldingsMatrix holdings={holdings} onChange={noop} departureDate="2027-01-01" />);
    const num = side.match(/[\d,]{5,}/)?.[0];
    expect(num).toBe("1,400,000,000");
    expect(text()).toContain(`${FOR} ${num}`);
  });
});
