/**
 * PeriodRangeEditor — periods undefined 방어 회귀
 *
 * 마이그레이션 이전 데이터·hot-reload stale 상태에서 periods가 undefined일 때
 * 토글(interval 진입) 클릭 시 `periods.length` 크래시(Runtime TypeError)가 없어야 한다.
 */

import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { PeriodRangeEditor } from "@/components/calc/transfer/PeriodRangeEditor";

afterEach(cleanup);

describe("PeriodRangeEditor undefined 방어", () => {
  it("periods undefined + 토글 클릭 → 크래시 없이 interval 진입(1구간 즉시 추가)", () => {
    const onChange = vi.fn();
    render(
      <PeriodRangeEditor
        tone="emerald"
        toggleTitle="임대 기간을 시작·종료일로 입력"
        startLabel="시작일"
        endLabel="종료일"
        rowLabel="구간"
        totalLabel="합계"
        directLabel="개월"
        testidPrefix="rp"
        inputMode={undefined as never}
        periods={undefined as never}
        directValue={undefined as never}
        onChange={onChange}
      />,
    );

    // 초기(direct) 렌더 크래시 없음
    expect(screen.getByRole("switch")).toBeTruthy();
    // 토글 클릭 → interval 진입, 빈 구간 1개 추가(크래시 없음)
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({
      inputMode: "interval",
      periods: [{ start: "", end: "" }],
    });
  });
});
