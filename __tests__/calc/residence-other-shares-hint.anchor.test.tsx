/** 축 B 거주 칸 힌트 — 컴패니언에는 거주 칸이 없어 주 자산 값을 승계한다는 안내(`axis-b-companion-residence.plan.md` Q-3 a). */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";

function renderSection(appliesToOtherShares?: boolean) {
  render(
    <ResidencePeriodSection
      residenceInputMode="direct"
      residencePeriods={[]}
      residencePeriodMonthsAsset="60"
      transferDate="2026-02-16"
      appliesToOtherShares={appliesToOtherShares}
      onChange={vi.fn()}
    />,
  );
}

describe("ResidencePeriodSection 지분 힌트", () => {
  afterEach(cleanup);

  it("축 B면 보인다", () => {
    renderSection(true);
    expect(screen.getByTestId("residence-other-shares-hint").textContent).toContain("같은 주택의 다른 지분에도 적용합니다");
  });

  it("아니면 없다", () => {
    renderSection(false);
    expect(screen.queryByTestId("residence-other-shares-hint")).toBeNull();
  });
});
