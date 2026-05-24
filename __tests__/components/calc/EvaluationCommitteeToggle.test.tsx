/**
 * @vitest-environment jsdom
 *
 * PR-K-3 RTL anchor — EvaluationCommitteeToggle 입력 폼 (6건)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-3
 *
 * K-3-1: RadioCardGroup 4옵션 렌더 (ON 시)
 * K-3-2: method="other" 시 methodNotes textarea 활성화
 * K-3-3: 토글 OFF → ON default values 주입
 * K-3-4: 토글 ON → OFF Dialog 확인 → 데이터 폐기 (취소 시 보존)
 * K-3-5: taxpayerPerShareValuation 입력 → onChange 머지
 * K-3-6: 토글 OFF 상태에서 form 미렌더
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EvaluationCommitteeToggle } from "@/components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeToggle";
import { METHOD_LABEL } from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";
import type { EvaluationCommitteeInput } from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";

afterEach(() => cleanup());

const DEFAULT_ON: EvaluationCommitteeInput = {
  method: "clm",
  taxpayerPerShareValuation: 0,
  methodNotes: "",
  evaluatorOrganization: "",
};

describe("[PR-K-3] EvaluationCommitteeToggle", () => {
  it("K-3-6: 토글 OFF 상태에서 form 미렌더", () => {
    render(<EvaluationCommitteeToggle value={undefined} onChange={vi.fn()} />);
    expect(screen.queryByTestId("evaluation-committee-form")).toBeNull();
  });

  it("K-3-1: ON 시 RadioCardGroup 4옵션 렌더", () => {
    render(<EvaluationCommitteeToggle value={DEFAULT_ON} onChange={vi.fn()} />);
    expect(screen.getByTestId("evaluation-committee-form")).toBeTruthy();
    // 4방법 label 모두 표시
    expect(screen.getByText(METHOD_LABEL.clm)).toBeTruthy();
    expect(screen.getByText(METHOD_LABEL.dcf)).toBeTruthy();
    expect(screen.getByText(METHOD_LABEL.ddm)).toBeTruthy();
    expect(screen.getByText(METHOD_LABEL.other)).toBeTruthy();
  });

  it("K-3-2: method=\"other\" 시 methodNotes textarea 활성화 (그 외 미노출)", () => {
    const { rerender } = render(
      <EvaluationCommitteeToggle value={DEFAULT_ON} onChange={vi.fn()} />,
    );
    // 기본 method="clm" → notes 미노출
    expect(screen.queryByTestId("evaluation-committee-notes-input")).toBeNull();

    // method="other" → notes 노출
    rerender(
      <EvaluationCommitteeToggle
        value={{ ...DEFAULT_ON, method: "other" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("evaluation-committee-notes-input")).toBeTruthy();
  });

  it("K-3-3: 토글 OFF → ON default values 주입", () => {
    const onChange = vi.fn();
    render(<EvaluationCommitteeToggle value={undefined} onChange={onChange} />);
    // ToggleCard 의 Switch — checkbox role 또는 switch role
    const toggle =
      screen.queryByRole("switch") ??
      screen.queryAllByRole("checkbox")[0] ??
      screen.queryAllByRole("button")[0];
    expect(toggle).toBeTruthy();
    if (toggle) {
      fireEvent.click(toggle);
    }
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0];
    expect(arg).toMatchObject({
      method: "clm",
      taxpayerPerShareValuation: 0,
    });
  });

  it("K-3-4: ON → OFF + 입력값 있음 → Dialog 표시 → 취소 시 보존, 확인 시 undefined", () => {
    const onChange = vi.fn();
    const withData: EvaluationCommitteeInput = {
      ...DEFAULT_ON,
      taxpayerPerShareValuation: 10_000,
    };
    render(<EvaluationCommitteeToggle value={withData} onChange={onChange} />);

    const toggle =
      screen.queryByRole("switch") ??
      screen.queryAllByRole("checkbox")[0] ??
      screen.queryAllByRole("button")[0];
    if (toggle) fireEvent.click(toggle);

    // Dialog 표시 — 아직 onChange 미호출 (데이터 보존)
    expect(onChange).not.toHaveBeenCalled();
    const cancelBtn = screen.getByTestId("evaluation-committee-discard-cancel");
    fireEvent.click(cancelBtn);
    expect(onChange).not.toHaveBeenCalled(); // 취소 시 폐기 안 함

    // 다시 토글 클릭 → Dialog 표시 → 확인 → undefined 폐기
    if (toggle) fireEvent.click(toggle);
    const confirmBtn = screen.getByTestId("evaluation-committee-discard-confirm");
    fireEvent.click(confirmBtn);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("K-3-5: taxpayer 입력 → onChange 머지 (taxpayerPerShareValuation 갱신)", () => {
    const onChange = vi.fn();
    render(<EvaluationCommitteeToggle value={DEFAULT_ON} onChange={onChange} />);
    // CurrencyInput 내부 input
    const inputs = screen
      .getAllByRole("textbox")
      .filter((el) => el instanceof HTMLInputElement);
    // 첫 input은 CurrencyInput (신청 평가액). evaluatorOrganization 도 input.
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    const taxpayerInput = inputs[0];
    fireEvent.change(taxpayerInput, { target: { value: "9500" } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.taxpayerPerShareValuation).toBe(9_500);
  });

  it("K-3-회귀: 입력값 없는 ON → OFF 즉시 폐기 (Dialog 없음)", () => {
    const onChange = vi.fn();
    render(<EvaluationCommitteeToggle value={DEFAULT_ON} onChange={onChange} />);
    const toggle =
      screen.queryByRole("switch") ??
      screen.queryAllByRole("checkbox")[0] ??
      screen.queryAllByRole("button")[0];
    if (toggle) fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(screen.queryByTestId("evaluation-committee-discard-dialog")).toBeNull();
  });
});
