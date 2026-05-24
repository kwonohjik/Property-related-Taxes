/**
 * @vitest-environment jsdom
 *
 * PR-K-5 RTL anchor — §49의2 신고서 안내 카드 (3건)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-5
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvaluationCommitteeFilingGuideCard } from "@/components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeFilingGuideCard";

afterEach(() => cleanup());

describe("[PR-K-5] EvaluationCommitteeFilingGuideCard", () => {
  it("K-5-1: 체크리스트 3행 렌더 ((가)·(나)·(다))", () => {
    render(<EvaluationCommitteeFilingGuideCard />);
    expect(screen.getByTestId("evaluation-committee-attachment-가")).toBeTruthy();
    expect(screen.getByTestId("evaluation-committee-attachment-나")).toBeTruthy();
    expect(screen.getByTestId("evaluation-committee-attachment-다")).toBeTruthy();
    // 체크리스트 컨테이너
    expect(screen.getByTestId("evaluation-committee-attachments-checklist")).toBeTruthy();
  });

  it("K-5-2: 기한 안내 상속·증여 분기", () => {
    const { rerender } = render(
      <EvaluationCommitteeFilingGuideCard taxKind="inheritance" />,
    );
    let deadlineGuide = screen.getByTestId("evaluation-committee-deadline-guide");
    expect(deadlineGuide.textContent).toContain("상속세");
    expect(deadlineGuide.textContent).toContain("4개월");
    expect(deadlineGuide.textContent).toContain("1개월");

    rerender(<EvaluationCommitteeFilingGuideCard taxKind="gift" />);
    deadlineGuide = screen.getByTestId("evaluation-committee-deadline-guide");
    expect(deadlineGuide.textContent).toContain("증여세");
    expect(deadlineGuide.textContent).toContain("70일");
    expect(deadlineGuide.textContent).toContain("20일");
  });

  it("K-5-3: 신용평가전문기관 안내 표시 (수수료 납세자 부담)", () => {
    render(<EvaluationCommitteeFilingGuideCard />);
    const notice = screen.getByTestId("evaluation-committee-credit-rating-notice");
    expect(notice.textContent).toContain("신용평가전문기관");
    expect(notice.textContent).toContain("수수료");
    expect(notice.textContent).toContain("납세자 부담");
    expect(notice.textContent).toContain("§49의2⑨");
  });

  it("K-5-회귀: §49의2⑦ 심의 고려사항 3종 렌더", () => {
    render(<EvaluationCommitteeFilingGuideCard />);
    const criteria = screen.getByTestId("evaluation-committee-review-criteria");
    expect(criteria.textContent).toMatch(/1\..*평가방법.*합리성/);
    expect(criteria.textContent).toMatch(/2\..*기초.*신뢰성/);
    expect(criteria.textContent).toMatch(/3\..*적정성/);
  });
});
