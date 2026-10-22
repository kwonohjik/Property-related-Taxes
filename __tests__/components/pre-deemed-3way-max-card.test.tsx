/**
 * 결과 카드 — 의제취득일 전 3자 max 후보 표시 (2026-10-22 「가목 우선」에서 변경).
 *
 * ①②도 채택되지 않을 수 있으므로 세 후보 모두 「선택」/「(미적용)」을 같은 규칙으로 표시한다.
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §6.3
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { InheritedAcquisitionDetailCard } from "@/components/calc/results/transfer/InheritedAcquisitionDetailCard";

afterEach(cleanup);

function detail(selectedMethod: "reported" | "sec164" | "converted") {
  return {
    acquisitionPrice: selectedMethod === "converted" ? 149_925_925 : 100_000_000,
    method: "pre_deemed_max",
    legalBasis: "테스트",
    formula: "",
    preDeemedBreakdown: {
      reportedAmount: 100_000_000,
      sec164Amount: 84_443_174,
      convertedAmount: 149_925_925,
      selectedMethod,
    },
  } as never;
}

function rowOf(label: RegExp) {
  return screen.getByText(label).closest("span") as HTMLElement;
}

describe("의제취득일 전 후보 표시", () => {
  it("③ 채택이면 ①·②에 「(미적용)」, ③에 「선택」", () => {
    render(<InheritedAcquisitionDetailCard detail={detail("converted")} />);
    expect(within(rowOf(/① 상증법 평가액/)).getByText("(미적용)")).toBeTruthy();
    expect(within(rowOf(/② 취득당시 기준시가/)).getByText("(미적용)")).toBeTruthy();
    expect(within(rowOf(/③ 환산취득가액/)).getByText("선택")).toBeTruthy();
    expect(screen.getByText(/①②③ 중 큰 금액 — 환산취득가액 적용/)).toBeTruthy();
  });

  it("① 채택이면 ①에 「선택」, ②·③에 「(미적용)」", () => {
    render(<InheritedAcquisitionDetailCard detail={detail("reported")} />);
    expect(within(rowOf(/① 상증법 평가액/)).getByText("선택")).toBeTruthy();
    expect(within(rowOf(/② 취득당시 기준시가/)).getByText("(미적용)")).toBeTruthy();
    expect(within(rowOf(/③ 환산취득가액/)).getByText("(미적용)")).toBeTruthy();
    expect(screen.getByText(/①②③ 중 큰 금액 — 실지거래가액 의제 적용/)).toBeTruthy();
  });
});
