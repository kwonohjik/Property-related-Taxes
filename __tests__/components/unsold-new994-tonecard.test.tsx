/**
 * @vitest-environment jsdom
 *
 * anchor: transfer 미분양·신축 감면 입력폼 5종(§98·§98의2·§98의4·§98의9·§99의4) 섹션카드 → <ToneCard noDark>(회귀 0).
 *   색상 ToneCard 점진 채택 17호.
 *
 * 두 헤더 형태:
 *   - title-only(§98·§98의2·§98의4): 번호가 제목 문자열에 내장(`① 취득·계약 시기`), 배지 없음 → title만
 *   - badge+title(§98의9·§99의4): 배지 문자열(①②③) + 제목 → sectionNum+title
 * variant value(AssetReductionForm) 구성이 무거워 실제 invocation을 class-equivalence로 검증(tone-card.test.tsx 선례).
 * emerald 안내박스(bg-{t}-50/50·bg-{t}-100/60)는 대상 아님(인라인 유지).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("미분양/신축 감면폼 <ToneCard> 전환 회귀 0", () => {
  it("title-only(배지 없음, 번호 제목 내장) = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="sky" title="① 취득·계약 시기" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-sky-200");
    expect(box.className).toContain("bg-sky-50/40");
    expect(box.className).not.toContain("dark:");
    // 배지 없음 (번호가 제목 문자열에 내장)
    expect(container.querySelector("span.rounded-full")).toBeNull();
    expect(getByText("① 취득·계약 시기").className).toContain("text-sky-700");
  });

  it("badge+title(sectionNum 배지) = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="rose" sectionNum="③" title="소재지·자격 요건" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-rose-200");
    expect(box.className).not.toContain("dark:");
    expect(getByText("③").className).toContain("bg-rose-200");
    expect(getByText("소재지·자격 요건").className).toContain("text-rose-700");
  });
});
