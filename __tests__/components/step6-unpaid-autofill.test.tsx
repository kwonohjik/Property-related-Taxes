/**
 * @vitest-environment jsdom
 *
 * anchor: 가산세 단계의 미납세액 자동기입은 **살아 있는 결정세액이 있을 때만** 일어난다.
 *
 * `Step6`은 `determinedTax` prop이 null이 아니면 기납부세액 입력 시
 * `unpaidTax = max(0, 결정세액 − 기납부세액)`을 자동 기입한다. 그 값은 표시용이 아니라
 * `delayedPaymentDetails.unpaidTax`로 엔진에 도달하므로, 결정세액이 낡았으면 자동기입 자체가
 * 일어나면 안 된다. 무효화는 `TransferTaxCalculator`가 `patchInvalidatesDeterminedTax`로
 * 판정해 `calcDeterminedTax`를 null로 되돌리는 것으로 이뤄진다(같은 PR).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Step6 } from "@/app/calc/transfer-tax/steps/Step6";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

// 「기납부세액」 칸은 신고 유형이 정상신고가 아닐 때만 렌더된다(Step6:88).
const form = (): TransferFormData => ({
  ...createDefaultTransferFormData(),
  enablePenalty: true,
  filingType: "none",
});

function typePriorPaid(determinedTax: number | null) {
  const onChange = vi.fn();
  render(<Step6 form={form()} onChange={onChange} determinedTax={determinedTax} />);
  // CurrencyInput의 라벨은 htmlFor로 묶여 있지 않다 — 라벨 노드에서 형제 input을 찾는다.
  const labelNode = screen.getByText("기납부세액");
  const input = labelNode
    .closest("div")
    ?.parentElement?.querySelector<HTMLInputElement>('input[inputmode], input[type="text"]');
  if (!input) throw new Error("기납부세액 입력을 찾지 못했다");
  fireEvent.change(input, { target: { value: "10,000,000" } });
  return onChange;
}

describe("Step6 미납세액 자동기입", () => {
  it("결정세액이 살아 있으면 자동 기입한다 (기존 동작 유지)", () => {
    const onChange = typePriorPaid(30_000_000);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ unpaidTax: "20000000" }),
    );
  });

  it("🔑 결정세액이 무효화(null)면 미납세액을 건드리지 않는다", () => {
    const onChange = typePriorPaid(null);
    for (const call of onChange.mock.calls) {
      expect(Object.keys(call[0])).not.toContain("unpaidTax");
    }
  });
});
