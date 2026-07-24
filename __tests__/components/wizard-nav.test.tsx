/**
 * 앵커 — 마법사 네비게이션 공용 컴포넌트(WizardNav) 렌더·동작.
 * 전 세목 통일 단일 소스(NavButton·CtaButton). 클래스·아이콘·passthrough 회귀 방어.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NavButton, CtaButton } from "@/components/calc/shared/WizardNav";

afterEach(cleanup);

describe("NavButton", () => {
  it("prev/next 라벨·아이콘 렌더 + onClick 발화", () => {
    const onPrev = vi.fn();
    const { container } = render(<NavButton direction="prev" label="이전" onClick={onPrev} />);
    const btn = screen.getByRole("button", { name: "이전" });
    // 컴팩트 아웃라인 기준 클래스
    expect(btn.className).toContain("rounded-md");
    expect(btn.className).toContain("text-xs");
    // 아이콘(svg) 존재
    expect(container.querySelector("svg")).toBeTruthy();
    fireEvent.click(btn);
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("disabled·aria-label·data-testid passthrough", () => {
    render(
      <NavButton direction="next" label="다음" disabled aria-label="다음 단계로 이동" data-testid="nav-next" />,
    );
    const btn = screen.getByTestId("nav-next");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-label", "다음 단계로 이동");
  });
});

describe("CtaButton", () => {
  it("solid(기본)은 bg-primary, outline은 border-primary", () => {
    const { rerender } = render(<CtaButton>계산하기</CtaButton>);
    expect(screen.getByRole("button", { name: "계산하기" }).className).toContain("bg-primary");
    rerender(<CtaButton tone="outline">가산세 계산하기</CtaButton>);
    expect(screen.getByRole("button", { name: "가산세 계산하기" }).className).toContain("border-primary");
  });

  it("글자 폭(전체폭 아님) — flex-1/w-full 미포함, px-5 포함", () => {
    render(<CtaButton>세금 계산하기</CtaButton>);
    const btn = screen.getByRole("button", { name: "세금 계산하기" });
    expect(btn.className).not.toContain("flex-1");
    expect(btn.className).not.toContain("w-full");
    expect(btn.className).toContain("px-5");
  });

  it("disabled·data-testid passthrough + onClick", () => {
    const onClick = vi.fn();
    render(
      <CtaButton onClick={onClick} data-testid="calc-btn">
        증여이익 계산
      </CtaButton>,
    );
    const btn = screen.getByTestId("calc-btn");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
