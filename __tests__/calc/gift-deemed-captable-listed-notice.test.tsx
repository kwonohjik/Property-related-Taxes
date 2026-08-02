/**
 * anchor: §39 증자 **다주주(cap-table) 모드 — 주권상장법인 단서 미반영 안내** (안 C)
 *
 * 계획서: docs/00-pm/capital-increase-captable-listed-proviso.plan.md v1.2 §6
 *
 * 안 C의 요지: 다주주 모드는 「상증령」§29②1가·3나 단서를 반영하지 못한다(equity-delta 모델의
 * zero-sum 항등식이 외생 시장가를 넣으면 깨진다). 그래서 **조용히 틀린 값을 내는 대신
 * 명시적으로 안내**하고 단일 모드로 유도한다.
 *
 * ⚠️ **차단(validate)은 하지 않는다** — 다주주 모드는 상장 여부를 입력받지 않으므로 상장임을
 *    판정할 방법이 없고, 비상장 다주주 사용을 막아서도 안 된다(자동 판정 금지 정책).
 *    ⇒ 이 anchor는 「안내가 **항상** 보이고, **차단은 없다**」를 함께 고정한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CapitalIncreaseAllocationFields } from "../../components/calc/deemed-gift/capital-forms";
import { INITIAL_DEEMED, type DeemedFormState } from "../../components/calc/deemed-gift/shared";
import { validateDeemedInput } from "../../lib/calc/gift-deemed-validate";

afterEach(cleanup);

function allocForm(over: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "capital_increase_allocation",
    giftDate: "2026-03-02",
    ciAllocPrePrice: "20,000",
    ciAllocNewPrice: "10,000",
    ciAllocRows: [
      { id: "sh-1", name: "A", preShares: "60,000", entitledShares: "60,000", subscribedShares: "0", reallocatedShares: "", relatedTo: ["sh-2"], allocationMethod: "normal" },
      { id: "sh-2", name: "B", preShares: "40,000", entitledShares: "40,000", subscribedShares: "100,000", reallocatedShares: "60,000", relatedTo: ["sh-1"], allocationMethod: "normal" },
    ],
    ...over,
  };
}

describe("cap-table 다주주 모드 — 상장 단서 미반영 안내", () => {
  it("NC-1: 안내 카드가 노출된다 (§29②1가·3나 단서 · 단일 모드 유도)", () => {
    render(<CapitalIncreaseAllocationFields form={allocForm()} set={() => {}} />);
    expect(screen.getByText(/주권상장법인이라면 이 모드를 쓰지 마세요/)).toBeInTheDocument();
    expect(screen.getByText(/§29②1가·3나 단서/)).toBeInTheDocument();
    expect(screen.getByText(/단일 모드/)).toBeInTheDocument();
  });

  it("NC-2 ⭐: 안내일 뿐 **차단하지 않는다** — 비상장 다주주 사용을 막으면 안 된다", () => {
    // 상장 여부를 묻지 않으므로 validate는 이 사유로 막을 근거가 없다.
    expect(validateDeemedInput(allocForm())).toBeNull();
  });

  it("NC-3: 상장 토글을 **두지 않는다** (있으면 반영되는 줄 오해한다)", () => {
    render(<CapitalIncreaseAllocationFields form={allocForm()} set={() => {}} />);
    expect(screen.queryByRole("switch", { name: /주권상장법인등/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("ci-alloc-stock-code")).not.toBeInTheDocument();
  });
});
