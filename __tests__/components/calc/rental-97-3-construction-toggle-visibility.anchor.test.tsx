/**
 * ⑤ UI anchor — §97의3 「민간건설임대주택」 토글의 **노출 경계**는 2020.12.31이다.
 *
 * 종전 노출 조건은 `registrationDate >= "2023-01-01"`이었다. 그런데 종전 규정에도 등록
 * **시한**이 있어 매입임대는 2020.12.31에서 끝나므로(건설임대만 2022.12.31), 2021~2022년
 * 등록 사안에서도 건설임대 여부가 세액을 가른다.
 *
 * 🔴 **토글이 숨으면 2021~2022년 등록 «건설»임대는 확인할 방법이 없다** — ⑧이 시한 사유로
 *    차단하는데 그 차단을 풀 입력 경로가 화면에 없다(법 근거 없는 불리 적용 · 입력 경로 부재).
 *    memory `feedback_ui_gate_removes_sole_input_path`의 형태다.
 *
 * 근거: 조특법 §97의3① 종전 문언(2022-12-08 시행본 mst 237393) 「2020년 12월 31일
 *      (민간건설임대주택의 경우에는 2022년 12월 31일)까지 … 등록」.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderForm(registrationDate: string) {
  const value = { ...getReductionDefault("rental_97_3"), registrationDate } as never;
  render(<Rental973InputForm value={value} onChange={vi.fn()} transferDate="2035-03-01" />);
}

const TOGGLE = /민간건설임대주택/;

describe("§97의3 건설임대 토글 노출 경계", () => {
  it("U-1: 등록 2021-06 → 토글이 보인다 (시한 축에서 세액이 갈린다)", () => {
    renderForm("2021-06-01");
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("U-2: 등록 2022-06 → 토글이 보인다", () => {
    renderForm("2022-06-01");
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("U-3: 등록 2023-06 → 토글이 보인다 (종전 축 유지)", () => {
    renderForm("2023-06-01");
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("U-4: 등록 2020-12-31 → 토글이 **없다** (시한 내 — 유형이 세액을 가르지 않는다)", () => {
    renderForm("2020-12-31");
    expect(screen.queryAllByText(TOGGLE).length).toBe(0);
  });

  it("U-5: 등록일 미입력 → 토글이 없다 (빈 문자열 비교가 경계를 넘지 않는다)", () => {
    renderForm("");
    expect(screen.queryAllByText(TOGGLE).length).toBe(0);
  });

  it("U-6: 안내 문구가 시대별로 갈린다 — 2021~2022는 시한, 2023~는 한정", () => {
    renderForm("2021-06-01");
    expect(screen.getByText(/매입임대 등록 시한은 2020\.12\.31/)).toBeTruthy();
    cleanup();
    renderForm("2023-06-01");
    expect(screen.getByText(/2023\.1\.1 이후 등록분은 건설임대에 한정/)).toBeTruthy();
  });
});
