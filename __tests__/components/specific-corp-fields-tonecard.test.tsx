/**
 * anchor: SpecificCorpFields(특정법인 §45의5) — 인라인 섹션카드 4개(①sky ②amber ③violet ④emerald)
 *   → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 3호. dark:0 → noDark로 양 모드 class-equivalent.
 *   amber-100/60 echo 박스는 섹션카드 아님 → 인라인 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SpecificCorpFields } from "@/components/calc/deemed-gift/other-forms";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";

afterEach(cleanup);

function renderBlock(overrides: Record<string, unknown> = {}) {
  const form = {
    ...INITIAL_DEEMED,
    scMode: "single" as const,
    scCorporateTaxMode: "direct" as const,
    ...overrides,
  };
  return render(<SpecificCorpFields form={form} set={() => {}} />);
}

describe("SpecificCorpFields — 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("①②③④ 섹션 제목이 톤별로 렌더 + 번호배지", () => {
    const { getByText } = renderBlock();
    expect(getByText("입력 방식 선택").className).toContain("text-sky-700");
    expect(getByText("법인세 상당액 (시행령 §34의5④2호)").className).toContain("text-amber-700");
    expect(getByText("§45의5② 한도 — 증여재산공제 (선택)").className).toContain("text-emerald-700");
    ["1", "2", "3", "4"].forEach((n) => expect(getByText(n)).toBeTruthy());
  });

  it("① 섹션카드 sky light 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    const badge = renderBlock().getByText("1");
    expect(badge.className).not.toContain("dark:");
    const card = badge.parentElement?.parentElement as HTMLElement; // ToneCard 외곽
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("③ 동적 title: single=해당 지배주주등 비율 / roster=발행주식 총수+주주 명단", () => {
    // 카드 title은 FieldCard 라벨과 텍스트 중복 → getAllByText
    // ⚠️ 「해당 …(수증자)의」가 붙은 것은 ⓑ 승수(상증령 §34의5⑨ 인별)임을 ⓐ 해당성(§45의5① 그룹
    //    합계)과 갈라 두기 위해서다 — 라벨이 같으면 사용자가 그룹비율을 승수 칸에 넣는다.
    expect(renderBlock({ scMode: "single" }).getAllByText(/해당 지배주주등/).length).toBeGreaterThan(0);
    cleanup();
    expect(renderBlock({ scMode: "roster" }).getAllByText(/발행주식 총수/).length).toBeGreaterThan(0);
  });

  it("④ ⓐ 특정법인 해당성 입력은 두 모드 공통 — §45의5① 30% 요건 판정축", () => {
    expect(renderBlock({ scMode: "single" }).getAllByText(/지배주주등 합계 주식보유비율/).length).toBeGreaterThan(0);
    cleanup();
    expect(renderBlock({ scMode: "roster" }).getAllByText(/지배주주등 합계 주식보유비율/).length).toBeGreaterThan(0);
  });
});
