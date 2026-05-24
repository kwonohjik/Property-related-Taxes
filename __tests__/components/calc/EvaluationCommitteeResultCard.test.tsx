/**
 * @vitest-environment jsdom
 *
 * PR-K-4 RTL anchor — Range Indicator + 결과 카드 + 신청 기한 (9건)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-4
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EvaluationCommitteeResultCard } from "@/components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeResultCard";
import { EvaluationCommitteeRangeIndicator } from "@/components/calc/inheritance/unlisted-stock-v2/EvaluationCommitteeRangeIndicator";
import {
  inheritanceApplicationDeadline,
  giftApplicationDeadline,
  daysUntilDeadline,
} from "@/lib/calc/evaluation-committee-deadline";
import { applyEvaluationCommittee } from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";

afterEach(() => cleanup());

const buildResult = (taxpayer: number, supplementary = 10_000) =>
  applyEvaluationCommittee({ method: "dcf", taxpayerPerShareValuation: taxpayer }, supplementary);

describe("[PR-K-4] EvaluationCommitteeRangeIndicator", () => {
  it("K-4-1: Range Indicator 70%·130% 표시 (활성)", () => {
    render(
      <EvaluationCommitteeRangeIndicator
        supplementary={10_000}
        taxpayer={9_500}
        lower={7_000}
        upper={13_000}
        isWithinRange
      />,
    );
    expect(screen.getByTestId("evaluation-committee-range-active")).toBeTruthy();
    expect(screen.getByText(/70% 하한/)).toBeTruthy();
    expect(screen.getByText(/130% 상한/)).toBeTruthy();
    expect(screen.getByText("7,000")).toBeTruthy();
    expect(screen.getByText("13,000")).toBeTruthy();
  });

  it("K-4-3: 범위 안 → emerald (✓) / 범위 밖 → rose (✗) 분기", () => {
    const { rerender } = render(
      <EvaluationCommitteeRangeIndicator
        supplementary={10_000}
        taxpayer={9_500}
        lower={7_000}
        upper={13_000}
        isWithinRange
      />,
    );
    expect(screen.getByTestId("evaluation-committee-range-status").textContent).toContain("✓");
    rerender(
      <EvaluationCommitteeRangeIndicator
        supplementary={10_000}
        taxpayer={6_500}
        lower={7_000}
        upper={13_000}
        isWithinRange={false}
      />,
    );
    expect(screen.getByTestId("evaluation-committee-range-status").textContent).toContain("✗");
  });

  it("K-4-9: supplementary=0 → gray-out + 비활성 카드", () => {
    render(
      <EvaluationCommitteeRangeIndicator
        supplementary={0}
        taxpayer={5_000}
        lower={0}
        upper={0}
        isWithinRange={false}
      />,
    );
    expect(screen.getByTestId("evaluation-committee-range-inactive")).toBeTruthy();
    expect(screen.queryByTestId("evaluation-committee-range-active")).toBeNull();
  });

  it("K-4-2: 납세자 위치 clamp (200% 초과 시)", () => {
    render(
      <EvaluationCommitteeRangeIndicator
        supplementary={10_000}
        taxpayer={50_000} // 500% — clamp 200%
        lower={7_000}
        upper={13_000}
        isWithinRange={false}
      />,
    );
    const marker = screen.getByTestId("evaluation-committee-range-marker");
    // left = calc(100% - 2px)
    expect((marker as HTMLElement).style.left).toContain("100%");
  });
});

describe("[PR-K-4] EvaluationCommitteeResultCard", () => {
  it("K-4-4: result undefined → 카드 미렌더", () => {
    render(
      <EvaluationCommitteeResultCard
        result={undefined}
        taxpayerPerShareValuation={0}
      />,
    );
    expect(screen.queryByTestId("evaluation-committee-result-card")).toBeNull();
  });

  it("K-4-5: deviationPct 한글 표시 (보충적 대비 -3.75%·+13.00%)", () => {
    const r1 = buildResult(9_625); // -3.75%
    const { rerender } = render(
      <EvaluationCommitteeResultCard
        result={r1}
        taxpayerPerShareValuation={9_625}
      />,
    );
    const deviationEl = screen.getByTestId("evaluation-committee-result-deviation");
    expect(deviationEl.textContent).toContain("-3.75%");

    const r2 = buildResult(11_300); // +13.00%
    rerender(
      <EvaluationCommitteeResultCard
        result={r2}
        taxpayerPerShareValuation={11_300}
      />,
    );
    expect(
      screen.getByTestId("evaluation-committee-result-deviation").textContent,
    ).toContain("+13.00%");
  });

  it("K-4-6: 상속세 신청 기한 카운트다운 (D-N일)", () => {
    const baseDate = new Date("2024-01-15");
    const today = new Date("2024-03-01"); // 30일 정도 남음
    const r = buildResult(10_000);
    render(
      <EvaluationCommitteeResultCard
        result={r}
        taxpayerPerShareValuation={10_000}
        baseDate={baseDate}
        taxKind="inheritance"
        today={today}
      />,
    );
    const deadlineCard = screen.getByTestId("evaluation-committee-deadline-card");
    expect(deadlineCard.textContent).toContain("상속세");
    // 상속세 기한 = 2024-01-31 + 6개월 = 2024-07-31
    expect(deadlineCard.textContent).toContain("2024-07-31");
    expect(deadlineCard.textContent).toMatch(/D-\d+/);
  });

  it("K-4-7: 증여세 신청 기한 카운트다운", () => {
    const baseDate = new Date("2024-01-15");
    const today = new Date("2024-02-01");
    const r = buildResult(10_000);
    render(
      <EvaluationCommitteeResultCard
        result={r}
        taxpayerPerShareValuation={10_000}
        baseDate={baseDate}
        taxKind="gift"
        today={today}
      />,
    );
    const deadlineCard = screen.getByTestId("evaluation-committee-deadline-card");
    expect(deadlineCard.textContent).toContain("증여세");
    // 증여세 기한 = 2024-01-31 + 3개월 = 2024-04-30
    expect(deadlineCard.textContent).toContain("2024-04-30");
  });

  it("K-4-8: 기한 초과 음수일 + rose 경고", () => {
    const baseDate = new Date("2023-01-15");
    const today = new Date("2024-01-01"); // 기한 한참 초과
    const r = buildResult(10_000);
    render(
      <EvaluationCommitteeResultCard
        result={r}
        taxpayerPerShareValuation={10_000}
        baseDate={baseDate}
        taxKind="inheritance"
        today={today}
      />,
    );
    const deadlineCard = screen.getByTestId("evaluation-committee-deadline-card");
    expect(deadlineCard.textContent).toContain("초과");
    expect(deadlineCard.textContent).toContain("신청 불가");
    // rose 색조 클래스
    expect(deadlineCard.className).toContain("rose");
  });

  it("K-4-deadlines: 헬퍼 직접 검증", () => {
    // date-fns lastDayOfMonth + addMonths는 local Date 반환
    const inhDl = inheritanceApplicationDeadline(new Date(2024, 0, 15)); // 2024-01-15 local
    expect(inhDl.getFullYear()).toBe(2024);
    expect(inhDl.getMonth()).toBe(6); // 7월 (0-indexed)
    expect(inhDl.getDate()).toBe(31);

    const giftDl = giftApplicationDeadline(new Date(2024, 0, 15));
    expect(giftDl.getFullYear()).toBe(2024);
    expect(giftDl.getMonth()).toBe(3); // 4월
    expect(giftDl.getDate()).toBe(30);

    expect(
      daysUntilDeadline(new Date(2024, 2, 1), new Date(2024, 1, 1)),
    ).toBe(29);
    expect(
      daysUntilDeadline(new Date(2024, 0, 1), new Date(2024, 1, 1)),
    ).toBe(-31);
  });
});
