/**
 * ValidationIssuePanel — 접기·항목 클릭·재시도·빈 상태.
 *
 * 위치(sticky·뷰포트 안)는 jsdom이 판정하지 못한다 ⇒ `e2e/transfer-validation-issue-panel.spec.ts`.
 * 계획서: `docs/00-pm/transfer-validation-issue-panel.plan.md`
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ValidationIssuePanel } from "@/components/calc/transfer/ValidationIssuePanel";
import type { ValidationIssue } from "@/lib/calc/transfer-tax-validate";

afterEach(cleanup);

const ISSUES: ValidationIssue[] = [
  { step: 0, assetIndex: 1, message: "자산 2의 취득일을 입력하세요." },
  { step: 0, message: "총 양도가액을 입력하세요." },
];

describe("ValidationIssuePanel", () => {
  it("오류도 목록도 없으면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<ValidationIssuePanel issues={[]} error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("건수 헤더와 항목을 표시하고, 접으면 헤더만 남는다", () => {
    render(<ValidationIssuePanel issues={ISSUES} error={null} />);
    expect(screen.getByText("입력 확인이 필요합니다 (2건)")).toBeTruthy();
    expect(screen.getByText("총 양도가액을 입력하세요.")).toBeTruthy();

    const toggle = screen.getByRole("button", { name: "접기" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);

    expect(screen.queryByText("총 양도가액을 입력하세요.")).toBeNull();
    expect(screen.getByText("입력 확인이 필요합니다 (2건)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "펼치기" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("key가 바뀌면(새 실패) 접힘이 풀린다", () => {
    const { rerender } = render(<ValidationIssuePanel key={1} issues={ISSUES} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "접기" }));
    expect(screen.queryByText("총 양도가액을 입력하세요.")).toBeNull();

    rerender(<ValidationIssuePanel key={2} issues={ISSUES} error={null} />);
    expect(screen.getByText("총 양도가액을 입력하세요.")).toBeTruthy();
  });

  it("onAssetClick이 있으면 자산 항목만 버튼이 되고 그 자산 인덱스를 넘긴다", () => {
    const onAssetClick = vi.fn();
    render(<ValidationIssuePanel issues={ISSUES} error={null} onAssetClick={onAssetClick} />);

    fireEvent.click(screen.getByRole("button", { name: "자산 2의 취득일을 입력하세요." }));
    expect(onAssetClick).toHaveBeenCalledWith(1);
    // 자산에 속하지 않는 항목은 버튼이 아니다
    expect(screen.queryByRole("button", { name: "총 양도가액을 입력하세요." })).toBeNull();
  });

  it("onAssetClick이 없으면 자산 항목도 버튼이 아니다", () => {
    render(<ValidationIssuePanel issues={ISSUES} error={null} />);
    expect(screen.queryByRole("button", { name: "자산 2의 취득일을 입력하세요." })).toBeNull();
  });

  it("API 오류만 있어도 표시하고, onRetry가 있으면 「다시 계산하기」를 누를 수 있다", () => {
    const onRetry = vi.fn();
    render(<ValidationIssuePanel issues={[]} error={"계산 중 오류가 발생했습니다."} onRetry={onRetry} />);
    expect(screen.getByText("계산 중 오류가 발생했습니다.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "접기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 계산하기" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
