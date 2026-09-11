/**
 * anchor: 주식 「분할 → 단일」 전환이 **입력 건을 버리기 전에 확인을 거친다** (2026-09-11).
 *
 * 종전에는 native `confirm()` 이었다(`Step1.tsx:121`). 규약이 금지하는 **데이터 손실 액션**인데
 * (첫 건만 남고 나머지 삭제) 결과 화면 축만 2026-09-05 에 고쳐지고 여기는 남아 있었다.
 *
 * 🔑 재는 것은 「다이얼로그가 뜬다」가 아니라 **「확정 전까지 `onChange` 가 불리지 않는다」** 다.
 *    RadioCardGroup 의 `value` 가 `form.lotsMode` 라서, `onChange` 를 참으면 토글도 「분할」에
 *    그대로 머문다 — 그것이 상태 보장 정책의 실제 내용이다.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

afterEach(cleanup);

const LOT = {
  id: "lot1",
  acquisitionDate: "2023-05-01",
  shareCount: "100",
  perShareAcquisitionPrice: "10000",
  acquisitionCause: "purchase" as const,
};
const TRN = {
  id: "trn1",
  transferDate: "2026-03-02",
  shareCount: "100",
  perShareTransferPrice: "20000",
};

function renderSplit(overrides: Partial<StockTransferFormData> = {}) {
  const onChange = vi.fn();
  const form: StockTransferFormData = {
    ...createInitialStockFormData(),
    lotsMode: "split",
    acquisitionLots: [LOT],
    transferLots: [TRN],
    ...overrides,
  };
  render(<Step1 form={form} onChange={onChange} />);
  return onChange;
}

/** 「단일 양도」 라디오를 고른다 */
function chooseSingle() {
  fireEvent.click(screen.getByText("단일 양도"));
}

describe("[SLM] 분할 → 단일 전환 — 폐기 확인", () => {
  it("S-1: 버릴 건이 있으면 onChange 를 부르지 않고 확인부터 묻는다", () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
    const onChange = renderSplit();

    chooseSingle();

    expect(onChange, "확인 전에 이미 전환했다").not.toHaveBeenCalled();
    expect(nativeConfirm, "native confirm 이 아직 쓰이고 있다").not.toHaveBeenCalled();
    expect(screen.getByText("분할 입력 건을 버리고 단일 모드로 바꿀까요?")).toBeTruthy();
  });

  it("S-2: 확인해야 전환된다 — 첫 건만 남는다 (양성 쌍둥이)", () => {
    const onChange = renderSplit();
    chooseSingle();
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.lotsMode).toBe("single");
    expect(patch.acquisitionDate).toBe(LOT.acquisitionDate);
    expect(patch.acquisitionLots).toEqual([]);
    expect(patch.transferLots).toEqual([]);
  });

  it("S-3: 취소하면 아무것도 바뀌지 않는다", () => {
    const onChange = renderSplit();
    chooseSingle();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("S-4: 대조군 — 버릴 건이 없으면 확인 없이 바로 전환한다", () => {
    const onChange = renderSplit({ acquisitionLots: [], transferLots: [] });
    chooseSingle();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].lotsMode).toBe("single");
  });
});
