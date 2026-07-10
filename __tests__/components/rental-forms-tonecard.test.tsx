/**
 * @vitest-environment jsdom
 *
 * anchor: transfer/rental 감면 입력폼 5종(§97·§97의2~5) 섹션카드 → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 16호.
 *
 * 5개 폼(Rental97Main·972·973·974·975)은 동일 패턴: 카드 헤더 = 배지(문자열 ①②) + 제목 text-{t}-700.
 * 각 폼은 variant value 구성이 무거워(RentalReductionFormVariant) 직접 렌더 대신, 실제 invocation
 * `<ToneCard tone={violet|amber} sectionNum="①" title=… noDark>`가 전환 전 인라인 class 집합을 그대로
 * 산출함을 class-equivalence로 검증(tone-card.test.tsx 선례). 내부 dashed/자동산출 박스는 인라인 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("rental 감면폼 <ToneCard> 전환 회귀 0 (문자열 배지 sectionNum)", () => {
  it("violet ① 등록·신분 = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="violet" sectionNum="①" title="등록·신분" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-violet-200");
    expect(box.className).toContain("bg-violet-50/40");
    expect(box.className).toContain("space-y-2"); // 기본 bodyClassName (원본과 동일)
    expect(box.className).not.toContain("dark:");
    const badge = getByText("①");
    expect(badge.className).toContain("bg-violet-200");
    expect(badge.className).toContain("select-none");
    expect(getByText("등록·신분").className).toContain("text-violet-700");
  });

  it("amber ② 임대 유형 = 전환 전 인라인과 1:1", () => {
    const { container, getByText } = render(
      <ToneCard tone="amber" sectionNum="②" title="임대 유형 (§97의2①)" noDark>
        x
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-amber-200");
    expect(box.className).toContain("bg-amber-50/40");
    expect(box.className).not.toContain("dark:");
    expect(getByText("②").className).toContain("bg-amber-200");
    expect(getByText("임대 유형 (§97의2①)").className).toContain("text-amber-700");
  });
});
