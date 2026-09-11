/**
 * anchor: 파괴적 액션 3종이 **native confirm 이 아니라 ConfirmDialog** 를 거친다 (2026-09-11).
 *
 * 핵심은 「다이얼로그가 뜬다」가 아니라 **「확정 전까지 아무것도 바뀌지 않는다」** 다
 * ([[feedback_dialog_data_discard_confirm]] 의 상태 보장 정책). native `confirm()` 은
 * 동기 blocking 이라 RTL 에서 `window.confirm` 을 mock 하지 않으면 잡히지도 않았다 —
 * 그것 자체가 이 규칙의 이유다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

/** native confirm 이 남아 있으면 이 spy 가 불린다 — 「Dialog 로 옮겼다」의 반증 장치다. */
function spyNativeConfirm() {
  const spy = vi.fn(() => true);
  vi.stubGlobal("confirm", spy);
  return spy;
}

describe("[CD-A] ResetButton — 전체 입력 폐기", () => {
  it("A-1: 클릭해도 즉시 지우지 않는다 (확인 먼저)", () => {
    const onReset = vi.fn();
    const nativeConfirm = spyNativeConfirm();
    render(<ResetButton onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "입력값 초기화" }));

    expect(onReset, "확인 전에 이미 지웠다").not.toHaveBeenCalled();
    expect(nativeConfirm, "native confirm 이 아직 쓰이고 있다").not.toHaveBeenCalled();
    expect(screen.getByText("입력값을 모두 삭제할까요?")).toBeTruthy();
  });

  it("A-2: 확인 버튼을 눌러야 지운다 (양성 쌍둥이)", () => {
    const onReset = vi.fn();
    render(<ResetButton onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "입력값 초기화" }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("A-3: 취소하면 지우지 않는다", () => {
    const onReset = vi.fn();
    render(<ResetButton onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "입력값 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onReset).not.toHaveBeenCalled();
  });
});

describe("[CD-B] HomeButton — confirmMessage 가 있으면 확인을 거친다", () => {
  const MSG = "홈으로 이동하면 현재 입력 중인 값이 사라집니다.";

  it("B-1: 클릭해도 즉시 이동하지 않는다", () => {
    const nativeConfirm = spyNativeConfirm();
    render(<HomeButton confirmMessage={MSG} />);

    fireEvent.click(screen.getByRole("button", { name: "홈으로 이동" }));

    expect(pushMock, "확인 전에 이미 이동했다").not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("홈으로 이동할까요?")).toBeTruthy();
  });

  it("B-2: 확인하면 onBeforeNavigate → push 순서로 진행한다", () => {
    const order: string[] = [];
    pushMock.mockImplementation(() => order.push("push"));
    render(
      <HomeButton confirmMessage={MSG} onBeforeNavigate={() => order.push("before")} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "홈으로 이동" }));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(order).toEqual(["before", "push"]);
  });

  it("B-3: 대조군 — confirmMessage 가 없으면 확인 없이 링크다", () => {
    render(<HomeButton />);
    const link = screen.getByRole("link", { name: "홈으로 이동" });
    expect(link.getAttribute("href")).toBe("/");
  });
});
