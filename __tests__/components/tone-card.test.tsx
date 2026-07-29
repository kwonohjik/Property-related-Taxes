/**
 * anchor: <ToneCard> — 안내·섹션 카드 통합 primitive.
 *  - 헤더 없음(children만) / title만 / sectionNum(번호배지) / sectionNum 문자열 "1-A"
 *
 * 계획서: docs/02-design/features/ui-color-tone-tokenization.plan.md §8
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("ToneCard", () => {
  it("헤더 없이 순수 톤 박스(children만) — 번호배지 없음", () => {
    const { container, queryByText } = render(<ToneCard tone="sky">내용</ToneCard>);
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-sky-200");
    expect(box.className).toContain("bg-sky-50/40");
    expect(queryByText("내용")).toBeTruthy();
    expect(container.querySelector("span.rounded-full")).toBeNull();
  });

  it("title만 있으면 제목 렌더(번호배지 없음)", () => {
    const { getByText, container } = render(
      <ToneCard tone="amber" title="취득시 기준시가">
        본문
      </ToneCard>,
    );
    expect(getByText("취득시 기준시가").className).toContain("text-amber-700");
    expect(container.querySelector("span.rounded-full")).toBeNull();
  });

  it("sectionNum(number) 있으면 번호배지 + 제목", () => {
    const { getByText } = render(
      <ToneCard tone="violet" title="거주" sectionNum={2}>
        본문
      </ToneCard>,
    );
    const badge = getByText("2");
    expect(badge.className).toContain("bg-violet-200");
    expect(badge.className).toContain("select-none");
    expect(getByText("거주").className).toContain("text-violet-700");
  });

  it("sectionNum 문자열 '1-A' 렌더", () => {
    const { getByText } = render(
      <ToneCard tone="rose" sectionNum="1-A">
        본문
      </ToneCard>,
    );
    expect(getByText("1-A")).toBeTruthy();
  });

  it("titleExtra: 제목 옆 헤더에 추가 요소 렌더 (법조문 모달·§ 배지)", () => {
    const { getByText } = render(
      <ToneCard tone="amber" title="취득시 기준시가" titleExtra={<span>§163⑥ 개산공제</span>}>
        x
      </ToneCard>,
    );
    expect(getByText("§163⑥ 개산공제")).toBeTruthy();
    expect(getByText("취득시 기준시가")).toBeTruthy();
  });
});

// P4 파일럿 회귀 anchor: P2에서 ForeignStock/ExitTax의 SectionBox(동적톤)를 <ToneCard>로 전환.
// 전환 전 인라인: `rounded-lg border border-{t}-200 bg-{t}-50/40 p-4 space-y-3`
//   + 번호배지 `bg-{t}-200 text-micro font-bold text-{t}-800 select-none`
//   + 제목 `text-xs font-semibold text-{t}-700`.
// 아래는 <ToneCard tone sectionNum title className="p-4" bodyClassName="space-y-3">가
// 그 클래스 집합을 그대로 산출함을 단언(Tailwind class→색 1:1 결정적 → 시각 회귀 0).
describe("ToneCard — SectionBox 전환 회귀 0 (P2 ForeignStock/ExitTax)", () => {
  it("noDark + p-4·space-y-3 override = 전환 전 인라인과 1:1 (light 전용 회귀 0, 양 모드)", () => {
    const { container, getByText } = render(
      <ToneCard
        tone="rose"
        sectionNum={1}
        title="납세의무 요건 (§118의2)"
        className="p-4"
        bodyClassName="space-y-3"
        noDark
      >
        본문
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    const badge = getByText("1");
    const title = getByText("납세의무 요건 (§118의2)");
    // override 적용 + 기본 p-3 제거
    expect(box.className).toContain("p-4");
    expect(box.className).toContain("space-y-3");
    expect(box.className).not.toContain("p-3");
    expect(box.className).not.toContain("space-y-2");
    // 톤 카드 외곽·번호배지·제목 (전환 전 인라인과 동일 light 클래스)
    expect(box.className).toContain("rounded-lg");
    expect(box.className).toContain("border-rose-200");
    expect(box.className).toContain("bg-rose-50/40");
    expect(badge.className).toContain("bg-rose-200");
    expect(badge.className).toContain("text-rose-800");
    expect(badge.className).toContain("text-micro");
    expect(badge.className).toContain("select-none");
    expect(title.className).toContain("text-rose-700");
    // noDark → dark 변형 미도입 (원래 light 전용 폼 → 다크모드도 회귀 0. 코드리뷰 M1)
    expect(box.className).not.toContain("dark:");
    expect(badge.className).not.toContain("dark:");
    expect(title.className).not.toContain("dark:");
  });

  it("기본(noDark 미지정)은 dark 변형 포함 (canonical)", () => {
    const { container } = render(
      <ToneCard tone="sky" title="일반">
        x
      </ToneCard>,
    );
    expect((container.firstChild as HTMLElement).className).toContain("dark:bg-sky-900/15");
  });
});
