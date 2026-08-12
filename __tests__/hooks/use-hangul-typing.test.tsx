import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useHangulTyping } from "@/hooks/use-hangul-typing";

afterEach(cleanup);

function Harness({ enabled = true, initial = "" }: { enabled?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial);
  const hangul = useHangulTyping({ value, onChange: setValue, enabled });
  return (
    <input
      aria-label="소재지"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={hangul.onKeyDown}
    />
  );
}

/** 커서를 항상 끝에 두고 키를 하나씩 눌러 조합을 진행한다 */
function press(input: HTMLInputElement, key: string, init: Record<string, unknown> = {}) {
  input.setSelectionRange(input.value.length, input.value.length);
  return fireEvent.keyDown(input, { key, ...init });
}

describe("useHangulTyping — 영문 IME 상태", () => {
  it("영문 키를 한글로 조합한다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    for (const k of "xpgpfksfh") press(input, k);
    expect(input.value).toBe("테헤란로");
  });

  it("자모 키는 기본 동작을 막는다 (영문이 그대로 들어가지 않도록)", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    // fireEvent는 preventDefault 시 false를 반환한다
    expect(press(input, "r")).toBe(false);
  });

  it("자모가 아닌 키는 기본 동작에 맡긴다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    expect(press(input, "1")).toBe(true);
    expect(press(input, " ")).toBe(true);
    expect(press(input, "Enter")).toBe(true);
  });
});

describe("useHangulTyping — IME 한글 모드 (이중 변환 방지)", () => {
  it("IME 조합 중(isComposing)에는 인터셉트하지 않는다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    expect(press(input, "r", { isComposing: true })).toBe(true);
    expect(input.value).toBe("");
  });

  it("IME가 키를 소비할 때의 key='Process'를 무시한다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    expect(press(input, "Process")).toBe(true);
    expect(input.value).toBe("");
  });

  it("IME가 키를 소비할 때의 keyCode=229를 무시한다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    expect(press(input, "r", { keyCode: 229 })).toBe(true);
    expect(input.value).toBe("");
  });
});

describe("useHangulTyping — 단축키·비활성", () => {
  it("Ctrl/Meta/Alt 조합은 그대로 통과시킨다", () => {
    render(<Harness />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    expect(press(input, "a", { metaKey: true })).toBe(true);
    expect(press(input, "v", { ctrlKey: true })).toBe(true);
    expect(input.value).toBe("");
  });

  it("enabled=false이면 아무 것도 하지 않는다", () => {
    render(<Harness enabled={false} />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    expect(press(input, "r")).toBe(true);
    expect(input.value).toBe("");
  });
});

describe("useHangulTyping — 커서·외부 변경", () => {
  it("커서 뒤에 텍스트가 남는 중간 편집은 인터셉트하지 않는다", () => {
    render(<Harness initial="테헤란로" />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    input.setSelectionRange(2, 2); // "테헤|란로"
    expect(fireEvent.keyDown(input, { key: "r" })).toBe(true);
  });

  it("전체 선택 상태에서 입력하면 기존 값을 대체한다", () => {
    render(<Harness initial="테헤란로" />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    input.setSelectionRange(0, input.value.length);
    fireEvent.keyDown(input, { key: "r" });
    fireEvent.keyDown(input, { key: "k" });
    expect(input.value).toBe("가");
  });

  it("외부에서 값이 바뀌면 그 값 뒤에서 새로 조합한다", () => {
    render(<Harness initial="서울 강남구 " />);
    const input = screen.getByLabelText("소재지") as HTMLInputElement;
    for (const k of "durtkaehd") press(input, k); // 역삼동
    expect(input.value).toBe("서울 강남구 역삼동");
  });
});
