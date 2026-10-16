/**
 * anchor — 「양도 당시 지정지역에 있는 토지인가요?」 질문 위젯 (A3 ①).
 *
 * - 비사업용 토지 8호 중과 유예 기간(양도 2009.3.16.~2015.12.31.)에만 뜬다 — 그 밖에는 입력칸이 없다(엔진이 읽지 않는 값을 묻지 않는다).
 * - 기간 판정은 엔진과 **같은 함수**다(경계가 어긋나지 않는다).
 * - 미선택 = 모름(RadioCardGroup은 선택 해제가 없다) → 엔진은 중과 유지 + 확인 필요.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NblDesignatedAreaQuestion } from "@/components/calc/transfer/nbl/NblDesignatedAreaQuestion";

afterEach(cleanup);
const ID = "t";
const root = () => screen.queryByTestId(`nbl-designated-area-question-${ID}`);

describe("표시 게이트 — 유예 기간에만", () => {
  it("양도일 미입력이면 뜨지 않는다", () => {
    render(<NblDesignatedAreaQuestion transferDate={undefined} value={undefined} onChange={() => {}} idSuffix={ID} />);
    expect(root()).toBeNull();
  });
  it("2009-03-15는 기간 밖 · 2016-01-01도 기간 밖 → 뜨지 않는다", () => {
    for (const d of ["2009-03-15", "2016-01-01", "2024-06-01"]) {
      const { unmount } = render(<NblDesignatedAreaQuestion transferDate={d} value={undefined} onChange={() => {}} idSuffix={ID} />);
      expect(root(), d).toBeNull();
      unmount();
    }
  });
  it("2009-03-16 · 2012-06-01 · 2015-12-31은 기간 안 → 뜬다", () => {
    for (const d of ["2009-03-16", "2012-06-01", "2015-12-31"]) {
      const { unmount } = render(<NblDesignatedAreaQuestion transferDate={d} value={undefined} onChange={() => {}} idSuffix={ID} />);
      expect(root(), d).not.toBeNull();
      unmount();
    }
  });
});

describe("선택값", () => {
  it("미선언이면 아무 라디오도 선택되지 않는다 · 안내문에 «확인 필요»가 있다", () => {
    render(<NblDesignatedAreaQuestion transferDate="2012-06-01" value={undefined} onChange={() => {}} idSuffix={ID} />);
    expect((screen.getByTestId(`nbl-designated-area-out-${ID}`) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId(`nbl-designated-area-in-${ID}`) as HTMLInputElement).checked).toBe(false);
    expect(root()!.textContent).toContain("확인 필요");
    expect(root()!.textContent).toContain("2009.3.16.~2015.12.31.");
  });
  it("false → «지정지역 아님»이 선택된다 · true → «지정지역»", () => {
    const { unmount } = render(<NblDesignatedAreaQuestion transferDate="2012-06-01" value={false} onChange={() => {}} idSuffix={ID} />);
    expect((screen.getByTestId(`nbl-designated-area-out-${ID}`) as HTMLInputElement).checked).toBe(true);
    unmount();
    render(<NblDesignatedAreaQuestion transferDate="2012-06-01" value={true} onChange={() => {}} idSuffix={ID} />);
    expect((screen.getByTestId(`nbl-designated-area-in-${ID}`) as HTMLInputElement).checked).toBe(true);
  });
  it("클릭하면 «아님» → false · «지정지역» → true 로 올린다", () => {
    const onChange = vi.fn();
    render(<NblDesignatedAreaQuestion transferDate="2012-06-01" value={undefined} onChange={onChange} idSuffix={ID} />);
    fireEvent.click(screen.getByTestId(`nbl-designated-area-out-${ID}`));
    expect(onChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByTestId(`nbl-designated-area-in-${ID}`));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});
