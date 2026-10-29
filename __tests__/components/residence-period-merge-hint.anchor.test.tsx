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
    expect(hint.textContent).toContain("합가 전 거주는 통산되지 않습니다");
  });

  it("🔑 O-15 — «소유자만 거주한 기간은 통산되지 않는다» 단정이 없고, 일시 퇴거 법리 · 사실판단 · 직접 해석 미확인을 알린다", () => {
    render(<ResidencePeriodSection {...props} mergeStartDate="2022-01-01" />);
    const t = screen.getByTestId("residence-merge-hint").textContent ?? "";
    expect(t).not.toContain("소유자만 거주한 기간");
    expect(t).toContain("취학·질병의 요양·근무상 또는 사업상의 형편으로 일시 퇴거했더라도");
    expect(t).toContain("세대전원이 거주한 것으로 보는 해석");
    expect(t).toContain("재산세과-3173");
    expect(t).toContain("서면-2019-부동산-2077");
    const tail = t.slice(t.indexOf("다만"));
    expect(tail).toContain("사실판단");
    expect(tail).toContain("직접 다룬 해석은 확인하지 못했습니다");
    expect(t).not.toContain("가정불화"); // 법 §88 6호의 4개 사유만(O-16 별건)
  });

  it("mergeStartDate가 없으면 힌트가 없다", () => {
    render(<ResidencePeriodSection {...props} />);
    expect(screen.queryByTestId("residence-merge-hint")).toBeNull();
  });
});
