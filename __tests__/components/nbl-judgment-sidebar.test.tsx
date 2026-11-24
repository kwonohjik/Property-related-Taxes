/** 사이드바 — 단계 표식(오류 = attention · 현재 = active · 이전 = done)과 요약 렌더 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NblJudgmentSidebar } from "@/components/calc/nbl-judgment/NblJudgmentSidebar";
import { createInitialNblJudgmentForm } from "@/lib/stores/nbl-judgment-form.types";

afterEach(cleanup);

describe("NblJudgmentSidebar", () => {
  it("빈 폼: ① 현재(active) · ②③ 오류 없음 = todo · 요약 없음 · 라벨은 정본 배열", () => {
    const onStepClick = vi.fn();
    const { container } = render(<NblJudgmentSidebar form={createInitialNblJudgmentForm()} currentStep={0} onStepClick={onStepClick} />);
    const items = [...container.querySelectorAll("nav li button")].map((b) => b.textContent);
    expect(items).toEqual(["토지 기본", "사업용 의제·지목", "부득이한 사유·편입일·의제일", "판정 결과"]);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toBe("토지 기본");
    expect(container.querySelector('[aria-label="입력 필요"]')).toBeNull();
  });

  it("① 오류가 있는데 ②에 있으면 ①에 「입력 필요」 표식 · 클릭하면 그 단계로", () => {
    const onStepClick = vi.fn();
    const { container } = render(<NblJudgmentSidebar form={createInitialNblJudgmentForm()} currentStep={1} onStepClick={onStepClick} />);
    expect(container.querySelectorAll('[aria-label="입력 필요"]').length).toBe(1);
    fireEvent.click(screen.getByText("토지 기본"));
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it("값이 있으면 요약이 보인다", () => {
    const f = createInitialNblJudgmentForm();
    const form = { ...f, transferDate: "2024-06-01", assets: [{ ...f.assets[0], addressJibun: "서울 강남구 테스트동 1" }] };
    render(<NblJudgmentSidebar form={form} currentStep={0} onStepClick={() => {}} />);
    expect(screen.getByText("양도일")).toBeTruthy();
    expect(screen.getByText("2024.06.01")).toBeTruthy();
  });
});
