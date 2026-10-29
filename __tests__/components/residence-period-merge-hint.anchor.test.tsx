/**
 * 거주 구간 칸의 합가 힌트(계획서 `land-only-merge-residence-period.plan.md` Q-3 a) — 합가한 토지만 본인 주택일 때만 뜬다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResidencePeriodSection } from "@/components/calc/transfer/ResidencePeriodSection";

const props = {
  residenceInputMode: "interval" as const,
  residencePeriods: [{ moveInDate: "", moveOutDate: "" }],
  residencePeriodMonthsAsset: "",
  transferDate: "2026-02-16",
  onChange: () => {},
};

describe("ResidencePeriodSection 합가 힌트", () => {
  afterEach(cleanup);

  it("🔑 mergeStartDate가 있으면 합가일 이후 · 건물 소유자와 함께 거주한 기간만 입력하라는 힌트", () => {
    render(<ResidencePeriodSection {...props} mergeStartDate="2022-01-01" />);
    const hint = screen.getByTestId("residence-merge-hint");
    expect(hint.textContent).toContain("2022-01-01");
    // O-12 — 누구의 거주인지 명시(입력자 본인) · 소유자만 거주한 기간은 통산되지 않는다
    expect(hint.textContent).toContain("본인이 소유자와 함께 거주한 기간만");
    expect(hint.textContent).toContain("소유자만 거주한 기간");
  });

  it("mergeStartDate가 없으면 힌트가 없다", () => {
    render(<ResidencePeriodSection {...props} />);
    expect(screen.queryByTestId("residence-merge-hint")).toBeNull();
  });
});
