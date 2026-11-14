/**
 * ⑤ UI anchor — G-1 「2020.7.11. 이후 등록 신청한 아파트 매입임대」 질문의 노출 경계 · 값 전달.
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md Q-1 a · Q-2.
 * 노출 = 장기 등록일 2020-07-11 ~ 2020-12-31 · 변경신고 없음(④·⑧·⑫·엔진과 같은 leaf `aptPurchase973QuestionApplies`).
 */
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const QUESTION = /2020\.7\.11\. 이후 장기일반민간임대주택으로 등록 신청한 아파트 민간매입임대주택인가요/;

function renderForm(over: Record<string, unknown>, onChange = vi.fn()) {
  const value = { ...getReductionDefault("rental_97_3"), ...over } as never;
  render(<Rental973InputForm value={value} onChange={onChange} transferDate="2031-03-01" />);
  return onChange;
}

describe("G-1 질문 노출 경계", () => {
  it.each([
    ["2020-07-11", true],
    ["2020-12-31", true],
    ["2020-07-10", false],
    ["2021-01-01", false],
    ["", false],
  ])("등록 %s → 질문 %s", (registrationDate, shown) => {
    renderForm({ registrationDate });
    expect(screen.queryAllByText(QUESTION).length > 0).toBe(shown);
  });

  it("변경신고(2020.7.10 이전 신고 · 수리 2020-07-15) → 질문 없음(Q-2)", () => {
    renderForm({
      registrationDate: "2017-07-01",
      shortTermConversionMode: "before",
      conversionReportedDate: "2020-07-08",
      conversionAcceptedDate: "2020-07-15",
    });
    expect(screen.queryAllByText(QUESTION).length).toBe(0);
  });

  it("미답이면 필수 안내가 하나 더 붙고, 답하면 사라진다 (같은 문구가 다른 3상태 칸에도 있어 개수 차이로 본다)", () => {
    renderForm({ registrationDate: "2020-07-10" });
    const base = screen.queryAllByText(/반드시 선택하세요/).length;
    cleanup();
    renderForm({ registrationDate: "2020-07-20" });
    expect(screen.queryAllByText(/반드시 선택하세요/).length).toBe(base + 1);
    cleanup();
    renderForm({ registrationDate: "2020-07-20", aptPurchaseAfter0711_973: "no" });
    expect(screen.queryAllByText(/반드시 선택하세요/).length).toBe(base);
  });

  it("「예」 선택 → onChange { aptPurchaseAfter0711_973: 'yes' }", () => {
    const onChange = renderForm({ registrationDate: "2020-07-20" });
    fireEvent.click(screen.getByTestId("r973-apt-purchase-yes"));
    expect(onChange).toHaveBeenCalledWith({ aptPurchaseAfter0711_973: "yes" });
  });
});
