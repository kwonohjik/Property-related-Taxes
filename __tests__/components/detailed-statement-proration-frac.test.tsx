/**
 * 앵커 — 상세명세서 "과세대상 양도차익" §95③ 안분 산식 Frac 분수 표기 (PR #746 표준)
 * prorationFormulaAsFrac: 엔진 STEP 3 문자열 → 분자/분모 세로 분수. 형식 미일치 시 원문 fallback.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { prorationFormulaAsFrac } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";

afterEach(cleanup);

describe("prorationFormulaAsFrac (Frac 분수 표기 앵커)", () => {
  it("엔진 12억 안분 formula → Frac 분자·분모 분리, '/' 미노출", () => {
    const engineFormula =
      "900,000,000 × (양도가 1,400,000,000 - 12억) / 양도가 1,400,000,000";
    const { container } = render(<div>{prorationFormulaAsFrac(engineFormula)}</div>);
    // 분자·분모가 각각 존재
    expect(screen.getByText("양도가 1,400,000,000 - 12억")).toBeTruthy();
    expect(screen.getByText("양도가 1,400,000,000")).toBeTruthy();
    // 인라인 나눗셈 기호 미노출 (Frac 세로 분수 전환)
    expect(container.textContent).not.toContain(" / ");
    expect(container.textContent).toContain("900,000,000 ×");
  });

  it("형식 미일치 문자열은 원문 그대로 fallback", () => {
    const raw = "전체 양도차익 900,000,000 (전액 과세)";
    const { container } = render(<div>{prorationFormulaAsFrac(raw)}</div>);
    expect(container.textContent).toBe(raw);
  });
});
