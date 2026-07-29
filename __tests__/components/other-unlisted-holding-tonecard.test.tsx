/**
 * anchor: OtherUnlistedHoldingSection(다른 비상장법인 주식 보유 §54③) 섹션카드 → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 12호. inheritance/unlisted-stock-v2 계열(전부 dark:0).
 *
 * related-corp-form sec2/4와 동일 패턴: flex justify-between 헤더(badge+title + 우측 "+ 보유 추가" 버튼)
 *   → sectionNum+title+titleExtra(우측 버튼, ml-auto). 내부 roster 박스(bg-white/70 등)는 인라인 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { OtherUnlistedHoldingSection } from "@/components/calc/inheritance/unlisted-stock-v2/OtherUnlistedHoldingSection";

afterEach(cleanup);

const TITLE = "다른 비상장법인 주식 보유 (§54③ · 상호출자 평가준칙 §60②)";
const cardOf = (t: HTMLElement) => t.parentElement?.parentElement as HTMLElement;

describe("OtherUnlistedHoldingSection <ToneCard> 전환 (회귀 0)", () => {
  it("emerald 카드 + sectionNum 배지 + noDark (미입력 상태 = 버튼 미노출)", () => {
    const { getByText } = render(
      <OtherUnlistedHoldingSection holdings={undefined} onChange={() => {}} sectionNum={3} />,
    );
    const card = cardOf(getByText(TITLE));
    expect(card.className).toContain("border-emerald-200");
    expect(card.className).toContain("bg-emerald-50/40");
    expect(card.className).not.toContain("dark:");
    expect(getByText("3").className).toContain("bg-emerald-200"); // 번호배지
  });

  it("titleExtra: 보유 존재 시 '+ 보유 추가' 버튼 헤더 우측(ml-auto) 보존", () => {
    const { getByText } = render(
      <OtherUnlistedHoldingSection
        holdings={[{ rowId: "r1", issuerCorpName: "", holdingShares: 0, totalShares: 0 }]}
        onChange={() => {}}
      />,
    );
    const addBtn = getByText("+ 보유 추가");
    expect(addBtn.className).toContain("ml-auto");
    // 제목과 같은 헤더 안(titleExtra) — 제목 <p>의 부모(헤더 div)에 버튼 포함
    const header = getByText(TITLE).parentElement as HTMLElement;
    expect(header.contains(addBtn)).toBe(true);
  });
});
