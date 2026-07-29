/**
 * 앵커 — 마법사 네비게이션 공용 컴포넌트(WizardNav) 렌더·동작.
 * 전 세목 통일 단일 소스(NavButton·CtaButton). 클래스·아이콘·passthrough 회귀 방어.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";

// HomeButton(WizardBackNav step 0)이 사용하는 next 라우터·링크 mock
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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

describe("WizardBackNav", () => {
  it("step 0(isFirstStep)에서 HomeButton pill(홈으로 이동) 렌더 — onBack 미발화", () => {
    const onBack = vi.fn();
    render(<WizardBackNav isFirstStep onBack={onBack} />);
    // HomeButton: aria-label="홈으로 이동" + 라벨 "홈으로" + rounded-full pill
    const home = screen.getByLabelText("홈으로 이동");
    expect(home.className).toContain("rounded-full");
    expect(screen.getByText("홈으로")).toBeTruthy();
    // step 0에서는 뒤로가기 콜백을 호출하지 않는다(홈으로 이동만)
    expect(onBack).not.toHaveBeenCalled();
  });

  it("step 1+에서 '이전' NavButton 렌더 + onBack 발화", () => {
    const onBack = vi.fn();
    render(<WizardBackNav isFirstStep={false} onBack={onBack} />);
    const btn = screen.getByRole("button", { name: "이전" });
    expect(btn.className).toContain("rounded-md");
    fireEvent.click(btn);
    expect(onBack).toHaveBeenCalledOnce();
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
