/**
 * G-5 항(項) 하이라이트 — LawContent가 조문 본문에서 인용 항을 시각 강조.
 * 본문은 props content 직접 주입(법제처 API 무관 결정적 검증).
 *
 * 정책: [[feedback_korean_law_citation_verify]]
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LawContent } from "@/components/ui/law-article-modal";

describe("LawContent — 항(項) 하이라이트 (G-5)", () => {
  const content =
    "제63조(유가증권 등의 평가)\n① 일반 평가방법\n② 코스닥 상장신청\n③ 최대주주 100분의 20 할증";

  it("HL-1: 인용 항(③)만 강조, 다른 항(①)은 비강조", () => {
    const { container } = render(
      <LawContent content={content} highlight={new Set(["③"])} />,
    );
    expect(
      container
        .querySelector('[data-clause="③"]')
        ?.getAttribute("data-highlighted"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-clause="①"]')
        ?.getAttribute("data-highlighted"),
    ).toBeNull();
  });

  it("HL-2: highlight 미전달 시 항 분할·강조 없음 (회귀 보존)", () => {
    const { container } = render(<LawContent content={content} />);
    expect(container.querySelector("[data-highlighted]")).toBeNull();
    expect(container.querySelector("[data-clause]")).toBeNull();
  });

  it("HL-4: ⑯~⑳ 항도 분할·강조된다 — legal-codes 가 §155⑳ 를 실제로 인용한다", () => {
    // CLAUSE_MARKERS 가 ⑮ 에서 끊겨 있던 동안 16항 이상은 앞 항 블록에 흡수돼
    // data-clause 자체가 생기지 않았다(하이라이트 불가).
    const long =
      "제155조(1세대1주택의 특례)\n⑮ 열다섯째 항\n⑯ 열여섯째 항\n⑳ 스무째 항";
    const { container } = render(
      <LawContent content={long} highlight={new Set(["⑳"])} />,
    );
    expect(
      container.querySelector('[data-clause="⑳"]')?.getAttribute("data-highlighted"),
    ).toBe("true");
    expect(container.querySelector('[data-clause="⑯"]')).not.toBeNull();
    expect(
      container.querySelector('[data-clause="⑯"]')?.getAttribute("data-highlighted"),
    ).toBeNull();
  });

  it("HL-3: 복수 항(①④) 강조 — ①은 강조, ②는 비강조", () => {
    const { container } = render(
      <LawContent content={content} highlight={new Set(["①", "④"])} />,
    );
    expect(
      container
        .querySelector('[data-clause="①"]')
        ?.getAttribute("data-highlighted"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-clause="②"]')
        ?.getAttribute("data-highlighted"),
    ).toBeNull();
  });
});
