/**
 * @vitest-environment jsdom
 *
 * anchor: acquisition Step0~4 + InstallmentPaymentsSection 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 23호.
 *   Step0(취득자유형 violet①·물건유형 sky②·취득원인 violet③)·Step1(물건상세 sky①)·
 *   Step2(보유주택 sky·취득후주택수 sky①·한시특례 violet③)·Step3(무상취득단서 rose★)·
 *   Step4(법인공장중과 rose①·세율특례 violet②)·Installment(연부회차 amber②).
 *   Step 컴포넌트는 props(form/set/다수 플래그·zustand)가 무거워 class-equivalence로 검증(deemed 22호 방식).
 *   전환 형태 = sectionNum(번호배지)+title(제목)+titleExtra(TaxHelp/pill/삭제·추가 버튼 우측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("acquisition Step0~4 + Installment <ToneCard> 전환 회귀 0 (23호)", () => {
  it("번호배지 카드: badge(bg-{t}-200 text-{t}-800)+title(text-{t}-700)+card(border/bg-{t}, dark:0) 1:1", () => {
    const cases = [
      { tone: "violet", num: 1, title: "취득자 유형" },
      { tone: "sky", num: 2, title: "물건 유형" },
      { tone: "violet", num: 3, title: "취득 원인" },
      { tone: "sky", num: 1, title: "물건 상세" },
      { tone: "sky", num: 1, title: "취득 후 보유 주택 수" },
      { tone: "violet", num: 3, title: "취득 주택 한시 특례 (주택 수 제외)" },
      { tone: "rose", num: 1, title: "법인·공장 중과 (§13①②)" },
      { tone: "violet", num: 2, title: "세율특례 §15① (7호)" },
      { tone: "amber", num: 2, title: "연부 회차 정보" },
    ] as const;
    for (const c of cases) {
      const { container } = render(
        <ToneCard tone={c.tone} sectionNum={c.num} title={c.title} bodyClassName="space-y-2" noDark />,
      );
      const box = container.firstChild as HTMLElement;
      expect(box.className).toContain(`border-${c.tone}-200`);
      expect(box.className).toContain(`bg-${c.tone}-50/40`);
      expect(box.className).toContain("p-3");
      expect(box.className).not.toContain("dark:");
      const badge = box.querySelector("span.rounded-full") as HTMLElement;
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe(String(c.num));
      expect(badge.className).toContain(`bg-${c.tone}-200`);
      expect(badge.className).toContain(`text-${c.tone}-800`);
      expect(badge.className).not.toContain("dark:");
      const titleP = box.querySelector("p.font-semibold") as HTMLElement;
      expect(titleP.className).toContain(`text-${c.tone}-700`);
      expect(titleP.textContent).toBe(c.title);
      cleanup();
    }
  });

  it("문자열 sectionNum '★' (Step3 무상취득단서 rose) 배지 렌더", () => {
    const { container } = render(
      <ToneCard tone="rose" sectionNum="★" title="무상취득 중과 배제 단서" noDark />,
    );
    const box = container.firstChild as HTMLElement;
    const badge = box.querySelector("span.rounded-full") as HTMLElement;
    expect(badge.textContent).toBe("★");
    expect(badge.className).toContain("bg-rose-200");
    expect(box.className).not.toContain("dark:");
  });

  it("titleExtra(헤더 우측 요소) — ml-auto 삭제/추가 버튼 보존 (Step2 보유주택·Installment)", () => {
    const { container } = render(
      <ToneCard
        tone="sky"
        sectionNum={1}
        title="보유 주택 #1"
        noDark
        titleExtra={<button className="ml-auto">삭제</button>}
      />,
    );
    const box = container.firstChild as HTMLElement;
    const btn = box.querySelector("button.ml-auto");
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe("삭제");
  });
});
