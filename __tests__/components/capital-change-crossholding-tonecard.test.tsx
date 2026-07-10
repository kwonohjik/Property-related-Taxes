/**
 * @vitest-environment jsdom
 *
 * anchor: unlisted-stock-v2 섹션카드 2종 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 14호.
 *   - CapitalChangeTable(자본금 변동 §56③·⑤, amber): sectionNum+title+titleExtra("+ 변동 추가" 버튼, ml-auto) — 렌더 anchor
 *   - CrossHoldingResultCard(상호출자 결과, emerald): sectionNum+title(순수 헤더) — 유효 reflection 없으면 null 반환하므로
 *     11호 CandidateCard처럼 class-equivalence anchor(실제 invocation <ToneCard tone="emerald" sectionNum title noDark>)
 *   둘 다 dark:0 → noDark. 제목 shade는 text-{t}-700(ToneCard 정본과 일치).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CapitalChangeTable } from "@/components/calc/inheritance/unlisted-stock-v2/CapitalChangeTable";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("CapitalChangeTable / CrossHoldingResultCard <ToneCard> 전환 (회귀 0)", () => {
  it("CapitalChangeTable: amber 카드 + sectionNum 배지 + titleExtra('+ 변동 추가' ml-auto) + noDark", () => {
    const { getByText } = render(
      <CapitalChangeTable capitalChanges={[]} onChange={() => {}} sectionNum={7} />,
    );
    const title = getByText("자본금 변동사항 (§56③·⑤ + §17의3⑤)");
    const card = title.parentElement?.parentElement as HTMLElement; // p → header → 카드
    expect(card.className).toContain("border-amber-200");
    expect(card.className).toContain("bg-amber-50/40");
    expect(card.className).not.toContain("dark:");
    expect(getByText("7").className).toContain("bg-amber-200"); // 번호배지
    const addBtn = getByText("+ 변동 추가");
    expect(addBtn.className).toContain("ml-auto"); // titleExtra(우측)
  });

  it("CrossHoldingResultCard invocation: emerald sectionNum+title 순수 헤더 = 전환 전 인라인과 1:1 (class-equivalence)", () => {
    // CrossHoldingResultCard는 유효 crossHoldingReflection 없으면 null 반환(복잡 input) → 실제 invocation 검증
    const { container, getByText } = render(
      <ToneCard
        tone="emerald"
        sectionNum={4}
        title="다른 비상장법인 주식 평가 (상호출자 연립방정식 — 평가준칙 §60②)"
        noDark
      >
        <table />
      </ToneCard>,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-emerald-200");
    expect(card.className).toContain("bg-emerald-50/40");
    expect(card.className).toContain("space-y-2"); // 기본 bodyClassName (원본과 동일)
    expect(card.className).not.toContain("dark:");
    const badge = getByText("4");
    expect(badge.className).toContain("bg-emerald-200");
    expect(getByText("다른 비상장법인 주식 평가 (상호출자 연립방정식 — 평가준칙 §60②)").className).toContain(
      "text-emerald-700",
    );
  });
});
