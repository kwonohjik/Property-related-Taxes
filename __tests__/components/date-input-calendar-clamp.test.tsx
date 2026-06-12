/**
 * @vitest-environment jsdom
 *
 * DateInput — 실제 달력 일수 클램핑 anchor (ui-upgrade, 2026-06-12)
 *
 * 배경: 기존 클램핑은 월 >12 → 12, 일 >31 → 31 만 보정해
 * 2월 30일·4월 31일 같은 존재하지 않는 날짜와 "00" 월·일이 store에 들어갔다.
 * (엔진 도달 시 new Date("2026-02-30") → 3월 2일 silent 변환 함정)
 *
 * 검증 항목:
 *  T-01: 2월(평년) 일 "30" 입력 → "28" 클램핑
 *  T-02: 2월(윤년 2024) 일 "30" 입력 → "29" 클램핑
 *  T-03: 4월 일 "31" 입력 → "30" 클램핑
 *  T-04: 1월 일 "31" 입력 → 그대로 통과 (과잉 클램핑 금지)
 *  T-05: 일 "00" 입력 → "01" 보정
 *  T-06: 월 "00" 입력 → "01" 보정
 *  T-07: 1월 31일 입력 후 월을 02로 변경 → 일 자동 재클램핑 (28)
 *  T-08: 연도 미완성 + 2월 일 "29" → 통과 후, 평년 연도 완성 시 "28" 재클램핑
 *  T-09: 기존 동작 보존 — 월 "13" → "12", 일 1자리 입력 진행 중 클램핑 보류
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

describe("DateInput 실제 달력 일수 클램핑", () => {
  it("T-01: 평년 2월 30 입력 → 28 클램핑", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2023" } });
    fireEvent.change(month, { target: { value: "02" } });
    fireEvent.change(day, { target: { value: "30" } });
    expect(day.value).toBe("28");
    expect(onChange).toHaveBeenLastCalledWith("2023-02-28");
  });

  it("T-02: 윤년(2024) 2월 30 입력 → 29 클램핑", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2024" } });
    fireEvent.change(month, { target: { value: "02" } });
    fireEvent.change(day, { target: { value: "30" } });
    expect(day.value).toBe("29");
    expect(onChange).toHaveBeenLastCalledWith("2024-02-29");
  });

  it("T-03: 4월 31 입력 → 30 클램핑", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2026" } });
    fireEvent.change(month, { target: { value: "04" } });
    fireEvent.change(day, { target: { value: "31" } });
    expect(day.value).toBe("30");
    expect(onChange).toHaveBeenLastCalledWith("2026-04-30");
  });

  it("T-04: 1월 31 입력 → 그대로 통과", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2026" } });
    fireEvent.change(month, { target: { value: "01" } });
    fireEvent.change(day, { target: { value: "31" } });
    expect(day.value).toBe("31");
    expect(onChange).toHaveBeenLastCalledWith("2026-01-31");
  });

  it("T-05: 일 00 입력 → 01 보정", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2026" } });
    fireEvent.change(month, { target: { value: "05" } });
    fireEvent.change(day, { target: { value: "00" } });
    expect(day.value).toBe("01");
    expect(onChange).toHaveBeenLastCalledWith("2026-05-01");
  });

  it("T-06: 월 00 입력 → 01 보정", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2026" } });
    fireEvent.change(month, { target: { value: "00" } });
    fireEvent.change(day, { target: { value: "15" } });
    expect(month.value).toBe("01");
    expect(onChange).toHaveBeenLastCalledWith("2026-01-15");
  });

  it("T-07: 1월 31일 입력 후 월을 02로 변경 → 일 자동 재클램핑", () => {
    const { onChange, year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2023" } });
    fireEvent.change(month, { target: { value: "01" } });
    fireEvent.change(day, { target: { value: "31" } });
    expect(onChange).toHaveBeenLastCalledWith("2023-01-31");
    fireEvent.change(month, { target: { value: "02" } });
    expect(day.value).toBe("28");
    expect(onChange).toHaveBeenLastCalledWith("2023-02-28");
  });

  it("T-08: 연도 미완성 시 2월 29 허용 → 평년 연도 완성 시 재클램핑", () => {
    const { onChange, month, day, year } = setup();
    // 연도 없이 월·일 먼저 입력 (윤년 가능성 허용)
    fireEvent.change(month, { target: { value: "02" } });
    fireEvent.change(day, { target: { value: "29" } });
    expect(day.value).toBe("29");
    // 평년 연도 완성 → 재클램핑
    fireEvent.change(year, { target: { value: "2023" } });
    expect(day.value).toBe("28");
    expect(onChange).toHaveBeenLastCalledWith("2023-02-28");
  });

  it("T-09: 기존 동작 보존 — 월 13 → 12, 일 1자리 입력 진행 중 보류", () => {
    const { year, month, day } = setup();
    fireEvent.change(year, { target: { value: "2026" } });
    fireEvent.change(month, { target: { value: "13" } });
    expect(month.value).toBe("12");
    // 1자리 "3"은 30일 입력 진행 중일 수 있으므로 클램핑 보류
    fireEvent.change(day, { target: { value: "3" } });
    expect(day.value).toBe("3");
  });
});
