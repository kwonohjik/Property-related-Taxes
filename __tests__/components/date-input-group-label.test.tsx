/**
 * @vitest-environment jsdom
 *
 * DateInput `aria-labelledby` — 연·월·일 세 칸을 바깥 라벨 이름의 `role="group"`으로 묶는다(화면 낭독기가 «연도»만이 아니라 어느 날짜인지 함께 읽게).
 * 접근성 트리 점검(axe-core 4.11 · Playwright ariaSnapshot)에서 재산세 철거일 칸이 «연도·월·일»로만 노출되던 것을 고정한다.
 * prop이 없으면 종전 그대로(그룹 없음) — 다른 433개 사용처 회귀 0.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DateInput } from "@/components/ui/date-input";

afterEach(cleanup);

describe("DateInput 그룹 라벨", () => {
  it("aria-labelledby를 주면 role=group + 그 라벨 이름 · 안에 연도·월·일", () => {
    render(
      <>
        <label id="d-label">철거일</label>
        <DateInput aria-labelledby="d-label" value="" onChange={() => {}} />
      </>,
    );
    const group = screen.getByRole("group", { name: "철거일" });
    expect(group.querySelectorAll("input")).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "연도" })).toBeTruthy();
  });

  it("prop이 없으면 그룹 없음(종전)", () => {
    render(<DateInput value="" onChange={() => {}} />);
    expect(screen.queryByRole("group")).toBeNull();
  });
});
