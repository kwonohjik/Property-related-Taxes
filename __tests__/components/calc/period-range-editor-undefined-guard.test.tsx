/**
 * PeriodRangeEditor — 토글 없는 상시 에디터 + periods undefined 방어
 *
 * 토글 제거(항상 표시·최소 1행). undefined periods에서도 크래시 없이 가상 1행 렌더.
 */

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { PeriodRangeEditor } from "@/components/calc/transfer/PeriodRangeEditor";

afterEach(cleanup);

function renderEditor(periods: unknown, onChange = vi.fn()) {
  render(
    <PeriodRangeEditor
      tone="emerald"
      startLabel="시작일"
      endLabel="종료일"
      rowLabel="임대 구간"
      totalLabel="합계"
      testidPrefix="rp"
      periods={periods as never}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("PeriodRangeEditor 상시 에디터", () => {
  it("periods undefined → 크래시 없이 가상 1행·총 0개월 표시(토글 없음)", () => {
    renderEditor(undefined);
    expect(screen.getByTestId("rp-editor")).toBeTruthy();
    expect(screen.getByTestId("rp-start-0")).toBeTruthy();
    expect(screen.getByTestId("rp-total")).toHaveTextContent("0개월");
  });

  it("빈 배열 → 가상 1행에 입력 시 onChange로 구간 생성", () => {
    const onChange = renderEditor([]);
    // 가상 첫 행 시작일 입력 → periods 생성
    fireEvent.change(screen.getByTestId("rp-start-0").querySelector("input")!, {
      target: { value: "2019" },
    });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(Array.isArray(arg.periods)).toBe(true);
    expect(arg.periods.length).toBe(1);
  });
});
