/**
 * @vitest-environment jsdom
 *
 * anchor: unlisted-stock-v2 섹션카드 2종 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 15호.
 *   - MajorShareholderStockToggle(§22② 최대주주, violet): sectionNum+title(순수 헤더)
 *   - ValuationDeltaTable(평가차액 별지3쪽, emerald): sectionNum+title(순수 헤더)
 *   둘 다 dark:0 · 제목 shade text-{t}-700(정본 일치). 내부 chip/표는 인라인 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MajorShareholderStockToggle } from "@/components/calc/inheritance/unlisted-stock-v2/MajorShareholderStockToggle";
import { ValuationDeltaTable } from "@/components/calc/inheritance/unlisted-stock-v2/ValuationDeltaTable";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

const cardOf = (t: HTMLElement) => t.parentElement?.parentElement as HTMLElement;

describe("unlisted-stock-v2 토글/표 <ToneCard> 전환 (회귀 0)", () => {
  it("MajorShareholderStockToggle: violet 카드 + sectionNum 배지 + noDark", () => {
    const { getByText } = render(
      <MajorShareholderStockToggle checked={false} onCheckedChange={() => {}} sectionNum={7} />,
    );
    const card = cardOf(getByText("§22② 최대주주 보유주식 금융재산공제 배제"));
    expect(card.className).toContain("border-violet-200");
    expect(card.className).toContain("bg-violet-50/40");
    expect(card.className).not.toContain("dark:");
    expect(getByText("7").className).toContain("bg-violet-200");
  });

  it("ValuationDeltaTable: emerald 카드 + sectionNum 배지 + noDark", () => {
    const { getByText } = render(
      <ValuationDeltaTable
        evaluationDeltaRows={[]}
        fallbackAssetValuationDelta={0}
        onRowsChange={() => {}}
        sectionNum={4}
      />,
    );
    const card = cardOf(getByText("평가차액 (별지 3쪽 — 자산·부채 계정과목별)"));
    expect(card.className).toContain("border-emerald-200");
    expect(card.className).toContain("bg-emerald-50/40");
    expect(card.className).not.toContain("dark:");
    expect(getByText("4").className).toContain("bg-emerald-200");
  });

  // fragment 토글(EvaluationCommitteeToggle·PreIpoListingToggle)·조건부 렌더(ListedStockBesshiAttributesSection)는
  // 복잡 props/Dialog 형제라 직접 렌더 대신 실제 invocation을 class-equivalence로 검증(11호 방식).
  it("class-equivalence: emerald sectionNum+title(토글 헤더) = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="emerald" sectionNum={8} bodyClassName="space-y-3" title="평가심의위원회 신청 (선택)" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-emerald-200");
    expect(box.className).toContain("bg-emerald-50/40");
    expect(box.className).toContain("space-y-3");
    expect(box.className).not.toContain("dark:");
    expect(getByText("8").className).toContain("bg-emerald-200");
    expect(getByText("평가심의위원회 신청 (선택)").className).toContain("text-emerald-700");
  });

  it("class-equivalence: violet 순수 박스(ListedStock 조건부 카드) = 전환 전 인라인과 1:1", () => {
    const { container } = render(
      <ToneCard tone="violet" bodyClassName="space-y-3" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-violet-200");
    expect(box.className).toContain("bg-violet-50/40");
    expect(box.className).toContain("space-y-3");
    expect(box.className).not.toContain("dark:");
    expect(container.querySelector("span.rounded-full")).toBeNull(); // 헤더 없음
  });
});
