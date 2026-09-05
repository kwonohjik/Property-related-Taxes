/**
 * 결과 화면 「처음부터 새로」 — 확인 없이는 절대 지우지 않는다 (2026-09-05 · 코드리뷰 Q25)
 *
 * 종전에는 같은 자리의 버튼이 **「다시 계산하기」라는 라벨로** 확인 없이 전체 입력을 지웠다
 * (sessionStorage까지 갱신되어 되돌릴 수 없다). 규약(`components/calc/CLAUDE.md:13`)은
 * 「다시 계산하기」를 마지막 입력 단계 복귀로 정한다 — 라벨과 동작을 1:1로 되돌리고,
 * 폐기는 확인을 거치는 전용 버튼으로 분리했다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RestartFromScratchButton } from "@/components/calc/shared/RestartFromScratchButton";

afterEach(cleanup);

describe("RestartFromScratchButton", () => {
  it("🔴 클릭만으로는 onReset이 불리지 않는다 (확인 다이얼로그 필수)", () => {
    const onReset = vi.fn();
    render(<RestartFromScratchButton onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "처음부터 새로" }));

    expect(onReset).not.toHaveBeenCalled();
  });

  it("다이얼로그에서 확인해야 onReset이 불린다", () => {
    const onReset = vi.fn();
    render(<RestartFromScratchButton onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "처음부터 새로" }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("취소하면 지우지 않는다", () => {
    const onReset = vi.fn();
    render(<RestartFromScratchButton onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "처음부터 새로" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onReset).not.toHaveBeenCalled();
  });
});
