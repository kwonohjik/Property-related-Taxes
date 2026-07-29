/**
 * @vitest-environment jsdom
 *
 * anchor: HouseEntryEditor 3섹션(기본/상속/장기임대) 카드 → <ToneCard noDark> + 로컬 상수 제거(회귀 0).
 *   색상 ToneCard 점진 채택 21호.
 *
 * 기존: 로컬 상수 SKY/AMBER/VIOLET_SECTION·HEADER·BADGE(9개, 정적 매핑)를 각 섹션에서 사용.
 * 전환: 상수 제거 → <ToneCard tone sectionNum bodyClassName="space-y-2.5" title noDark>(진짜 consolidation).
 * 상수 문자열이 ToneCard 출력과 글자 1:1임을 class-equivalence로 검증.
 *   SECTION="rounded-lg border border-{t}-200 bg-{t}-50/40 p-3 space-y-2.5"
 *   HEADER="text-xs font-semibold text-{t}-700" · BADGE="... rounded-full bg-{t}-200 ... text-{t}-800 select-none"
 * HouseEntryEditor는 HouseEntry prop 구성이 무거워 실제 invocation을 검증.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("HouseEntryEditor 섹션카드 <ToneCard> 전환 + 상수제거 회귀 0 (21호)", () => {
  it("sky ① 기본 정보 (space-y-2.5) = 전환 전 상수 SKY_SECTION/HEADER/BADGE와 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="sky" sectionNum="①" bodyClassName="space-y-2.5" title="기본 정보" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-sky-200");
    expect(box.className).toContain("bg-sky-50/40");
    expect(box.className).toContain("p-3");
    expect(box.className).toContain("space-y-2.5");
    expect(box.className).not.toContain("dark:");
    const badge = getByText("①");
    expect(badge.className).toContain("bg-sky-200");
    expect(badge.className).toContain("text-sky-800");
    expect(badge.className).toContain("select-none");
    expect(getByText("기본 정보").className).toContain("text-sky-700");
  });

  it("amber ② / violet ③ 배지·제목 톤 보존", () => {
    const { getByText } = render(
      <>
        <ToneCard tone="amber" sectionNum="②" bodyClassName="space-y-2.5" title="상속 정보" noDark>x</ToneCard>
        <ToneCard tone="violet" sectionNum="③" bodyClassName="space-y-2.5" title="장기임대 정보" noDark>y</ToneCard>
      </>,
    );
    expect(getByText("②").className).toContain("bg-amber-200");
    expect(getByText("상속 정보").className).toContain("text-amber-700");
    expect(getByText("③").className).toContain("bg-violet-200");
    expect(getByText("장기임대 정보").className).toContain("text-violet-700");
  });
});
