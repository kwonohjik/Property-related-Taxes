/**
 * @vitest-environment jsdom
 *
 * DateInput — 자동 포커스 이동 anchor
 *
 * 배경: 연도 4자리·월 2자리 입력 시 다음 칸으로 자동 이동은 기존 구현.
 * 여기에 "한 자리 월(2~9)"도 두 자리 월(10·11·12)의 첫 자리가 될 수 없으므로
 * 즉시 완성으로 간주해 일 칸으로 이동하는 동작을 추가(값은 패딩하지 않고 "5" 그대로 유지).
 *
 *  A-01: 연도 4자리 → 월로 이동
 *  A-02: 월 2자리 → 일로 이동
 *  A-03: 월 한 자리 5 → 일로 이동 + 표시값 "5" 유지 (패딩 안 함)
 *  A-04: 월 한 자리 9 → 일로 이동
 *  A-05: 월 한 자리 1 → 이동 안 함 (10·11·12 대기)
 *  A-06: 월 한 자리 0 → 이동 안 함 (01~09 대기)
 *  A-07: 월 "1" 후 "12" → 완성 + 일로 이동
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DateInput } from "@/components/ui/date-input";

afterEach(cleanup);

function setup(initial = "") {
  const onChange = vi.fn();
  render(<DateInput value={initial} onChange={onChange} />);
  return {
    onChange,
    year: screen.getByLabelText("연도") as HTMLInputElement,
    month: screen.getByLabelText("월") as HTMLInputElement,
    day: screen.getByLabelText("일") as HTMLInputElement,
  };
}

describe("DateInput 자동 포커스 이동", () => {
  it("A-01: 연도 4자리 입력 → 월로 이동", () => {
    const { year, month } = setup();
    year.focus();
    fireEvent.change(year, { target: { value: "2009" } });
    expect(document.activeElement).toBe(month);
  });

  it("A-02: 월 2자리 입력 → 일로 이동", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2009" } });
    fireEvent.change(month, { target: { value: "09" } });
    expect(document.activeElement).toBe(day);
  });

  it("A-03: 월 한 자리 5 → 일로 이동 + 값 '5' 유지", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2009" } });
    fireEvent.change(month, { target: { value: "5" } });
    expect(document.activeElement).toBe(day);
    expect(month.value).toBe("5"); // 패딩 안 함 — E2E 표시값 호환
  });

  it("A-04: 월 한 자리 9 → 일로 이동", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2009" } });
    fireEvent.change(month, { target: { value: "9" } });
    expect(document.activeElement).toBe(day);
  });

  it("A-05: 월 한 자리 1 → 이동 안 함 (두 자리 월 대기)", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2009" } });
    fireEvent.change(month, { target: { value: "1" } });
    expect(document.activeElement).not.toBe(day);
  });

  it("A-06: 월 한 자리 0 → 이동 안 함 (01~09 대기)", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2009" } });
    fireEvent.change(month, { target: { value: "0" } });
    expect(document.activeElement).not.toBe(day);
  });

  it("A-07: 월 '1' 후 '12' → 완성 + 일로 이동", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2009" } });
    fireEvent.change(month, { target: { value: "1" } });
    expect(document.activeElement).not.toBe(day);
    fireEvent.change(month, { target: { value: "12" } });
    expect(document.activeElement).toBe(day);
    expect(month.value).toBe("12");
  });
});
