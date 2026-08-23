import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SelectOnFocusProvider } from "@/components/providers/SelectOnFocusProvider";

/**
 * SelectOnFocusProvider — 「포커스 시 전체선택」 계약 anchor
 *
 * 이 Provider는 `app/layout.tsx`에 걸린 **전역** 컴포넌트이고, 글로벌 규칙
 * 「Input Select-on-Focus — 모든 프로젝트 필수」의 유일한 구현체다.
 * 그런데 2026-08-23까지 **전용 테스트가 하나도 없었다** — 그래서 이 파일을 만든다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 rAF를 쓰는가 · 왜 가드가 필요한가
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `select()`를 `requestAnimationFrame`으로 미루는 이유는 두 가지다:
 *  1. Chrome의 mousedown→focus 순서로 인한 selection 덮어쓰기 방지 (Provider 주석)
 *  2. `CurrencyInput`은 포커스 시 표시값을 `"1,000,000"` → `"1000000"`로 **바꾼다**.
 *     그 리렌더 **후에** 선택해야 raw 전체가 잡힌다 (`CurrencyInput.tsx:90·106`).
 *
 * 그런데 그 한 프레임 사이에 사용자가 타이핑을 시작할 수 있다. 그러면 rAF가 뒤늦게
 * 전체선택을 걸어 **이미 입력된 글자를 다시 선택 범위에 넣는다**. 소재지 한글 입력
 * (`useHangulTyping`)에서 이것이 초성 유실로 드러났다 — `가라` → `ㅏ라`.
 *
 * ⇒ 가드의 술어는 「**입력이 시작됐는가**」(keydown)이지 「값이 바뀌었는가」가 **아니다**.
 *   값 비교로 구현하면 위 2번(`CurrencyInput`)이 통째로 죽는다 — SOF-4가 그것을 막는다.
 *
 * 상세 실측·기각안: `docs/02-design/features/select-on-focus-raf-race.plan.md`
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** rAF 콜백을 붙잡아 수동 실행한다 — 「rAF 이전/이후」 상태를 정확히 만들기 위해 */
function captureRaf() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  return {
    frames,
    flush: () => {
      for (const cb of frames.splice(0)) cb(0);
    },
  };
}

function selectionOf(el: HTMLInputElement | HTMLTextAreaElement): [number | null, number | null] {
  return [el.selectionStart, el.selectionEnd];
}

describe("SelectOnFocusProvider — input", () => {
  it("[SOF-1] 포커스하면 전체선택된다 (기본 기능)", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <input type="text" defaultValue="hello" data-testid="i" />
      </SelectOnFocusProvider>,
    );
    const el = screen.getByTestId("i") as HTMLInputElement;

    el.focus();
    expect(raf.frames.length, "focus가 rAF를 등록해야 한다").toBe(1);
    raf.flush();

    expect(selectionOf(el)).toEqual([0, 5]);
  });

  it("[SOF-2] rAF 이전에 keydown이 오면 전체선택하지 않는다", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <input type="text" defaultValue="hello" data-testid="i" />
      </SelectOnFocusProvider>,
    );
    const el = screen.getByTestId("i") as HTMLInputElement;

    el.focus();
    el.setSelectionRange(5, 5); // 사용자가 입력을 시작해 캐럿이 끝으로 간 상태
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    raf.flush();

    expect(selectionOf(el), "입력 중인 칸을 다시 전체선택하면 안 된다").toEqual([5, 5]);
  });

  it("[SOF-3] rAF 이전에 포커스가 떠나면 전체선택하지 않는다", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <input type="text" defaultValue="hello" data-testid="i" />
        <input type="text" defaultValue="other" data-testid="j" />
      </SelectOnFocusProvider>,
    );
    const el = screen.getByTestId("i") as HTMLInputElement;
    const other = screen.getByTestId("j") as HTMLInputElement;

    el.focus();
    el.setSelectionRange(5, 5);
    other.focus();
    raf.flush();

    expect(selectionOf(el), "떠난 칸은 건드리지 않는다").toEqual([5, 5]);
  });

  it("[SOF-4] rAF 이전에 값이 바뀌어도 전체선택은 유지된다 — CurrencyInput 계약", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <input type="text" defaultValue="1,000,000" data-testid="i" />
      </SelectOnFocusProvider>,
    );
    const el = screen.getByTestId("i") as HTMLInputElement;

    el.focus();
    // 포커스 리렌더로 콤마가 빠진다 (CurrencyInput.tsx:90) — keydown은 없다
    el.value = "1000000";
    raf.flush();

    expect(
      selectionOf(el),
      "값 변경만으로 전체선택을 건너뛰면 모든 금액칸의 select-on-focus가 죽는다",
    ).toEqual([0, 7]);
  });

  it("[SOF-5] 전체선택 대상이 아닌 type은 건드리지 않는다", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <input type="checkbox" data-testid="c" />
      </SelectOnFocusProvider>,
    );
    screen.getByTestId("c").focus();

    expect(raf.frames.length, "checkbox에는 rAF를 걸지 않는다").toBe(0);
  });
});

describe("SelectOnFocusProvider — textarea", () => {
  it("[SOF-6] 포커스하면 전체선택된다", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <textarea defaultValue="hello" data-testid="t" />
      </SelectOnFocusProvider>,
    );
    const el = screen.getByTestId("t") as HTMLTextAreaElement;

    el.focus();
    raf.flush();

    expect(selectionOf(el)).toEqual([0, 5]);
  });

  it("[SOF-7] rAF 이전에 keydown이 오면 전체선택하지 않는다", () => {
    const raf = captureRaf();
    render(
      <SelectOnFocusProvider>
        <textarea defaultValue="hello" data-testid="t" />
      </SelectOnFocusProvider>,
    );
    const el = screen.getByTestId("t") as HTMLTextAreaElement;

    el.focus();
    el.setSelectionRange(5, 5);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    raf.flush();

    expect(selectionOf(el)).toEqual([5, 5]);
  });
});
