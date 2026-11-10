/**
 * 상세명세서 「장기보유특별공제」 자산별 행 — 비과세 자산이 「차손 자산」으로 찍히지 않는다.
 *
 * 종전: `buildLthFormula`가 `transferGain <= 0`만 보고 「차손 자산 — 장특공제 미적용」을 냈다. 전액 비과세 자산은 엔진 `transferGain`이
 * 0이라(과세 대상 없음) 5억 비과세 주택·1세대1입주권이 차손으로 표시됐다. 비과세와 차손은 전혀 다른 사실이다.
 * 시료 값은 일괄 route 실측(주 자산 토지 + 5억 비과세 주택 / 5억 비과세 입주권 / 토지 차손 −200,000,000).
 */
import { describe, it, expect } from "vitest";
import { buildLthFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

const P = (over: Record<string, unknown>) =>
  ({ propertyId: "p", propertyLabel: "자산", longTermHoldingDeduction: 0, income: 0, transferGain: 0, isExempt: false, ...over }) as unknown as PerPropertyBreakdown;

describe("buildLthFormula — 장특 0원 자산의 사유 문구", () => {
  it("🔑 전액 비과세(transferGain 0 · isExempt)는 «비과세 자산», 차손 문구가 아니다 (종전: «차손 자산 — 장특공제 미적용»)", () => {
    const t = buildLthFormula(P({ isExempt: true, transferGain: 0 }));
    expect(t).toBe("비과세 자산 — 장특공제 미적용");
    expect(t).not.toContain("차손");
  });

  it("§155⑳ 비과세처럼 transferGain이 양수로 남아도 isExempt면 «비과세 자산»", () => {
    expect(buildLthFormula(P({ isExempt: true, transferGain: 100_000_000 }))).toBe("비과세 자산 — 장특공제 미적용");
  });

  it("짝 — 실제 차손(과세 자산 · 양도차익 음수)은 종전 그대로 «차손 자산»", () => {
    expect(buildLthFormula(P({ isExempt: false, transferGain: -200_000_000, income: -200_000_000 }))).toBe("차손 자산 — 장특공제 미적용");
  });

  it("짝 — 과세 양수 차익인데 장특 0(보유 3년 미만)은 종전 그대로", () => {
    expect(buildLthFormula(P({ isExempt: false, transferGain: 50_000_000, income: 50_000_000 }))).toBe("보유 3년 미만 또는 비적용 자산");
  });
});
