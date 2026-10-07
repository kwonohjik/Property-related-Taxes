/**
 * anchor: 주식 「단일 → 분할」 전환은 폼-전역 양도일·취득일을 **비운다** (2026-10-07).
 *
 * 종전에는 첫 lot 으로 복사만 하고 원래 칸을 남겼다. 분할 모드에는 그 칸이 없으므로(lot 일자가 정본)
 * 화면 밖 stale 값이 대주주 판정 블록·검증·④(→ 엔진)로 흘러갔다. 처음부터 분할로 입력한 폼과 같은
 * 상태(빈 값)로 맞춘다. 분할 → 단일은 `applySingleMode` 가 첫 lot 에서 다시 채운다.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

describe("[SCD] 단일 → 분할 전환", () => {
  it("SCD-1: 양도일·취득일은 첫 lot 으로 옮기고 폼-전역 칸은 비운다", () => {
    const onChange = vi.fn();
    const form: StockTransferFormData = {
      ...createInitialStockFormData(),
      lotsMode: "single",
      acquisitionDate: "2023-05-01",
      transferDate: "2026-03-02",
      shareCount: "100",
      perShareAcquisitionPrice: "10000",
      perShareTransferPrice: "20000",
    };
    render(<Step1 form={form} onChange={onChange} />);

    fireEvent.click(screen.getByText("분할 양도"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.lotsMode).toBe("split");
    expect(patch.acquisitionLots[0].acquisitionDate).toBe("2023-05-01");
    expect(patch.transferLots[0].transferDate).toBe("2026-03-02");
    expect(patch.acquisitionDate).toBe("");
    expect(patch.transferDate).toBe("");
  });
});
