/**
 * @vitest-environment jsdom
 *
 * anchor: 국외주식 ⑤ — 시가 모드(영 §178의3) 1주당 취득가액 입력 칸 (Zod↔엔진 필수 점검 2차 B21)
 *
 * 엔진은 시가 모드도 `perShareAcquisitionPriceForeign`을 1주당 시가로 읽는다. 종전 화면은 그 칸을
 * 실가 모드에서만 렌더해, 안내가 「취득가액 란에 입력하세요」라고 하는데 **칸이 없었다**(④도 싣지 않아
 * 취득가액 0 · 2,700,000 → 5,100,000). ⑧·⑫를 먼저 조이면 화면이 400 막다른 길이 되므로 입력 경로가 먼저다
 * (memory `feedback_required_field_needs_an_input_path`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ForeignStockPriceBlock } from "@/components/calc/stock-transfer/ForeignStockPriceBlock";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function block(patch: Partial<StockTransferFormData>, onChange = () => {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "foreign_stock",
    ...patch,
  } as StockTransferFormData;
  return render(<ForeignStockPriceBlock form={form} onChange={onChange} />);
}

describe("FG-MP-UI — 시가 모드 1주당 취득가액", () => {
  it("FG-MP-UI-1: 시가 모드에 칸이 있고, 입력하면 같은 필드로 간다", () => {
    const onChange = vi.fn();
    block({ acquisitionModeFS: "market_price" }, onChange);
    expect(screen.getByText("1주당 취득가액 — 시가 (외화)")).toBeTruthy();
    const input = screen.getByPlaceholderText("외화 취득 단가");
    fireEvent.change(input, { target: { value: "100" } });
    expect(onChange).toHaveBeenCalledWith({ perShareAcquisitionPriceForeign: "100" });
  });

  it("FG-MP-UI-2: 실가 모드 라벨은 그대로다 (긍정 짝)", () => {
    block({ acquisitionModeFS: "actual" });
    expect(screen.getByText("1주당 취득가액 (외화)")).toBeTruthy();
    expect(screen.queryByText("1주당 취득가액 — 시가 (외화)")).toBeNull();
  });

  it("FG-MP-UI-3: 시가 모드도 원화 환산 미리보기가 선다", () => {
    block({
      acquisitionModeFS: "market_price",
      perShareAcquisitionPriceForeign: "100",
      acquisitionExchangeRate: "1200",
      shareCount: "100",
    });
    expect(screen.getByText(/취득가액\(원화 환산 참고\): 12,000,000/)).toBeTruthy();
  });
});
