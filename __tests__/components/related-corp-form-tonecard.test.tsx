/**
 * anchor: related-corp-form(§45의3 일감몰아주기) 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 9호.
 *   로컬 SectionHeader + TONE_CLASS 헬퍼 제거 → ToneCard 헤더(sectionNum 배지 + title)로 통합.
 *   - sec1 수혜법인(sky)·sec3 간접출자법인(amber): sectionNum+title (헤더 byte-1:1)
 *   - sec2 주주현황(emerald)·sec4 매출처(violet): sectionNum+title+titleExtra(우측 합계 span, ml-auto)
 *   deemed-gift dark:0 → noDark. 우측 합계 span(data-testid 보존) = titleExtra로 이동, ml-auto로 우측 정렬.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RelatedCorpFields } from "@/components/calc/deemed-gift/related-corp-form";
import {
  INITIAL_DEEMED,
  makeRcShareholderRow,
} from "@/components/calc/deemed-gift/deemed-form-state";

afterEach(cleanup);

// title <p> → 헤더 div → ToneCard 카드 div
const cardOf = (titleEl: HTMLElement) =>
  titleEl.parentElement?.parentElement as HTMLElement;

describe("related-corp-form 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("sec1 수혜법인(sky) + sec2 주주현황(emerald) + sec4 매출처(violet) — 항상 렌더", () => {
    const { getByText, getByTestId } = render(
      <RelatedCorpFields form={{ ...INITIAL_DEEMED }} set={() => {}} />,
    );

    // sec1 sky — sectionNum+title, 헤더 byte-1:1
    const c1 = cardOf(getByText("수혜법인 기본 정보"));
    expect(c1.className).toContain("border-sky-200");
    expect(c1.className).toContain("bg-sky-50/40");
    expect(c1.className).not.toContain("dark:");
    expect(getByText("1").className).toContain("bg-sky-200"); // 번호배지

    // sec2 emerald — titleExtra(우측 합계 span) 보존 + ml-auto
    const c2 = cardOf(getByText("주주현황"));
    expect(c2.className).toContain("border-emerald-200");
    expect(c2.className).not.toContain("dark:");
    const sum2 = getByTestId("rc-shareholder-sum");
    expect(sum2.className).toContain("ml-auto");
    expect(sum2.textContent).toContain("지분합계");

    // sec4 violet — titleExtra 보존 + ml-auto
    const c4 = cardOf(getByText("매출처"));
    expect(c4.className).toContain("border-violet-200");
    expect(c4.className).not.toContain("dark:");
    const sum4 = getByTestId("rc-sales-sum");
    expect(sum4.className).toContain("ml-auto");
    expect(sum4.textContent).toContain("매출합계");
  });

  it("sec3 간접출자법인(amber) — 법인주주 있을 때만 렌더", () => {
    const corp = { ...makeRcShareholderRow("c1"), isCorporate: true };
    const { getByText } = render(
      <RelatedCorpFields
        form={{ ...INITIAL_DEEMED, rcShareholders: [corp] }}
        set={() => {}}
      />,
    );
    const c3 = cardOf(getByText("간접출자법인 (법인주주의 개인소유주)"));
    expect(c3.className).toContain("border-amber-200");
    expect(c3.className).toContain("bg-amber-50/40");
    expect(c3.className).not.toContain("dark:");
    expect(getByText("3").className).toContain("bg-amber-200");
  });
});
