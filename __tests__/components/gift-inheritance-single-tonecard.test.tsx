/**
 * anchor: gift/·inheritance/ dark:0 단일 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 10호.
 *   - DoneeMinorField(수증자 미성년 §57, violet): sectionNum="§57"(문자열 배지) + title
 *   - Section53_8_2Fields(§53⑧2호 전부매각, emerald): title + titleExtra(LawArticleModal §49①1호)
 *   둘 다 dark:0 → noDark. 배지·제목 클래스 집합 ToneCard 헤더와 동일 → 시각 회귀 0.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DoneeMinorField } from "@/components/calc/gift/DoneeMinorField";
import { Section53_8_2Fields } from "@/components/calc/inheritance/shared/Section53_8_2Fields";

afterEach(cleanup);

describe("gift/inheritance 단일 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("DoneeMinorField: violet 카드 + §57 문자열 배지 sectionNum + noDark", () => {
    const { getByText } = render(
      <DoneeMinorField
        doneeResidentNumber=""
        giftDate=""
        isMinorDonee={false}
        onResidentNumberChange={() => {}}
        onMinorToggle={() => {}}
      />,
    );
    const badge = getByText("§57"); // 번호배지(문자열 sectionNum)
    expect(badge.className).toContain("bg-violet-200");
    expect(badge.className).toContain("select-none");
    const card = badge.parentElement?.parentElement as HTMLElement; // badge → header → 카드
    expect(card.className).toContain("border-violet-200");
    expect(card.className).toContain("bg-violet-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("Section53_8_2Fields: emerald 카드 + titleExtra(LawArticleModal) + noDark", () => {
    const { getByText } = render(
      <Section53_8_2Fields value={undefined} onChange={() => {}} idPrefix="t" />,
    );
    const title = getByText("§53⑧2호 전부매각 요건");
    expect(title.className).toContain("text-emerald-700");
    const header = title.parentElement as HTMLElement; // flex items-center gap-2
    const card = header.parentElement as HTMLElement; // ToneCard 카드
    expect(card.className).toContain("border-emerald-200");
    expect(card.className).toContain("bg-emerald-50/40");
    expect(card.className).not.toContain("dark:");
    // titleExtra(법조문 모달 §49①1호 버튼)가 제목과 같은 헤더에 보존됨 (버튼 텍스트 "§49①1호 ↗")
    expect(header.textContent).toContain("§49①1호");
  });
});
