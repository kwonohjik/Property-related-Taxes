/**
 * US-29 후속 W2 — 지방소득세 가산세 고지 문구의 시기별 연혁(렌더).
 * 결과 화면 고지(LocalIncomePenaltyNotice)가 2014 전 미산정·기한 +2개월 연혁(2020-03-01)을 밝히는지 확인한다.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocalIncomePenaltyNotice } from "@/components/calc/results/shared/LocalIncomePenaltyNotice";

describe("LocalIncomePenaltyNotice — 연혁 고지", () => {
  afterEach(cleanup);
  it("결과 고지에 2014년 전 미산정(소득세 부가세 체계)과 2020년 3월 1일 기준 지방 기한을 밝힌다", () => {
    render(<LocalIncomePenaltyNotice />);
    const text = screen.getByTestId("local-income-penalty-notice").textContent ?? "";
    expect(text).toContain("2014년 1월 1일 전");
    expect(text).toContain("소득세 부가세 체계(지방소득세 소득분)");
    expect(text).toContain("독립 가산세(지방세기본법 §53~§55)를 산정하지 않습니다");
    expect(text).toContain("2020년 3월 1일 이후");
    expect(text).toContain("확인 필요");
  });
  it("입력 단계 고지도 같은 연혁을 밝힌다", () => {
    render(<LocalIncomePenaltyNotice variant="input" />);
    const text = screen.getByTestId("local-income-penalty-notice").textContent ?? "";
    expect(text).toContain("2014년 1월 1일 전");
    expect(text).toContain("2020년 3월 1일 이후");
  });
});
