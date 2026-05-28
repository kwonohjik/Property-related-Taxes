/**
 * EstateItemCardShell + useCollapseState — Anchor (PR-C FU-3)
 *
 * Plan estate-card-followup §FU-3 · Design §5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, renderHook, act } from "@testing-library/react";
import { EstateItemCardShell } from "@/components/calc/inheritance/estate-card/EstateItemCardShell";
import { useCollapseState } from "@/components/calc/inheritance/estate-card/useCollapseState";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* silent */
  }
});

afterEach(() => cleanup());

// ============================================================
// useCollapseState — localStorage 동기 + hydration
// ============================================================

describe("useCollapseState", () => {
  it("초기값 false (저장된 값 없음)", () => {
    const { result } = renderHook(() => useCollapseState("test-1"));
    expect(result.current[0]).toBe(false);
  });

  it("setCollapsed(true) 호출 → localStorage 즉시 갱신", () => {
    const { result } = renderHook(() => useCollapseState("test-2"));
    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem("estate-card-collapsed-test-2")).toBe("true");
  });

  it("localStorage 사전 저장된 값 → hydration 후 복원", async () => {
    localStorage.setItem("estate-card-collapsed-test-3", "true");
    const { result } = renderHook(() => useCollapseState("test-3"));
    // 초기 렌더는 false (SSR mismatch 회피) → useEffect 후 true
    await act(async () => {});
    expect(result.current[0]).toBe(true);
  });

  it("functional updater 지원 — toggle 패턴", () => {
    const { result } = renderHook(() => useCollapseState("test-4"));
    act(() => {
      result.current[1]((prev) => !prev);
    });
    expect(result.current[0]).toBe(true);
    act(() => {
      result.current[1]((prev) => !prev);
    });
    expect(result.current[0]).toBe(false);
  });
});

// ============================================================
// EstateItemCardShell — 노출 매트릭스
// ============================================================

describe("EstateItemCardShell — collapse 토글 노출 매트릭스", () => {
  it("collapseEnabled=false → collapse 토글 미노출", () => {
    render(
      <EstateItemCardShell
        itemId="card-1"
        collapseEnabled={false}
        header={<div>HEADER</div>}
        body={<div>BODY</div>}
      />,
    );
    expect(screen.queryByTestId("estate-card-collapse-toggle-card-1")).toBeNull();
    expect(screen.getByText("HEADER")).toBeInTheDocument();
    expect(screen.getByText("BODY")).toBeInTheDocument();
  });

  it("collapseEnabled=true → collapse 토글 노출", () => {
    render(
      <EstateItemCardShell
        itemId="card-2"
        collapseEnabled={true}
        header={<div>HEADER</div>}
        body={<div>BODY</div>}
      />,
    );
    expect(screen.getByTestId("estate-card-collapse-toggle-card-2")).toBeInTheDocument();
  });

  it("collapse 클릭 → data-collapsed=true + 본체 hidden 클래스", () => {
    render(
      <EstateItemCardShell
        itemId="card-3"
        collapseEnabled={true}
        header={<div>HEADER</div>}
        body={<div data-testid="body-3">BODY</div>}
      />,
    );
    const toggle = screen.getByTestId("estate-card-collapse-toggle-card-3");
    const shell = screen.getByTestId("estate-card-shell-card-3");
    expect(shell.getAttribute("data-collapsed")).toBe("false");

    fireEvent.click(toggle);
    expect(shell.getAttribute("data-collapsed")).toBe("true");
    // 본체는 unmount 되지 않음 (mount 유지 → local state 보존)
    expect(screen.getByTestId("body-3")).toBeInTheDocument();
  });

  it("data-card-body 속성으로 selector 견고화 (UV-4)", () => {
    const { container } = render(
      <EstateItemCardShell
        itemId="card-4"
        collapseEnabled={true}
        header={<div>H</div>}
        body={<div>B</div>}
      />,
    );
    const bodyDiv = container.querySelector("[data-card-body]");
    expect(bodyDiv).not.toBeNull();
  });

  it("onCollapseChange 콜백 — 토글 시 호출", () => {
    let captured: boolean | null = null;
    render(
      <EstateItemCardShell
        itemId="card-5"
        collapseEnabled={true}
        header={<div>H</div>}
        body={<div>B</div>}
        onCollapseChange={(c) => (captured = c)}
      />,
    );
    fireEvent.click(screen.getByTestId("estate-card-collapse-toggle-card-5"));
    expect(captured).toBe(true);
    fireEvent.click(screen.getByTestId("estate-card-collapse-toggle-card-5"));
    expect(captured).toBe(false);
  });
});
