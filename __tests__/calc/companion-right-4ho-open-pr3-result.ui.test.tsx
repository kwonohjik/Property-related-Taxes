/**
 * @vitest-environment jsdom
 *
 * 컴패니언 조합원입주권 §89①4호 열기 PR-3 V-5 — 일괄 결과 자산 카드(`PropertyCard`)가 비과세·고가 안분 근거를 보여 준다.
 * 종전: 비과세는 «비과세 / 해당 없음» 한 줄, 12억 초과 안분은 과세분 양도차익(2.4억)만 보여 15억−3억=12억과 맞지 않는 이유를 알 수 없었다.
 *
 * 시료 값은 실제 API 응답(PR-3 측정, 마포 입주권 취득 2018-03-01 · 인가 2019-06-01 · 양도 2026-06-01 · 취득가 3억):
 *   5억 선언 «예» → 비과세 0 / 15억 → 결정세액 70,310,000(과세 양도차익 240,000,000 · 비과세 960,000,000 · 비율 20%) / 선언 «아니오» → 55,110,000.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PropertyCard } from "@/components/calc/results/BundledAllocationSubCards";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";

afterEach(cleanup);

const BASE = {
  propertyId: "companion-fixed",
  propertyLabel: "자산 2",
  isPartialExempt: false,
  acquisitionPrice: 300_000_000,
  necessaryExpense: 0,
  longTermHoldingDeduction: 0,
  reductionAmount: 0,
  incomeDeductionReducible: 0,
  refCalculatedTax: 0,
  taxBaseShare: 0,
};
const EXEMPT = {
  ...BASE,
  isExempt: true,
  transferPrice: 500_000_000,
  transferGain: 0,
  income: 0,
  redevelopmentDetail: { oneRightExemptionApplied: true, oneRightExemptionClause: "ga" },
} as unknown as PerPropertyBreakdown;
const PARTIAL = {
  ...BASE,
  isExempt: false,
  isPartialExempt: true,
  transferPrice: 1_500_000_000,
  transferGain: 240_000_000,
  income: 240_000_000,
  redevelopmentDetail: {
    oneRightHighValueApplied: true,
    oneRightExemptionClause: "ga",
    highValueAllocation: { nontaxableGain: 960_000_000, taxableGain: 240_000_000, taxableRatio: 0.2, nontaxableThreshold: 1_200_000_000 },
  },
} as unknown as PerPropertyBreakdown;
const TAXED = {
  ...BASE,
  isExempt: false,
  transferPrice: 500_000_000,
  transferGain: 200_000_000,
  income: 200_000_000,
  redevelopmentDetail: {},
} as unknown as PerPropertyBreakdown;

const show = (b: PerPropertyBreakdown) => render(<PropertyCard breakdown={b} assetKind="right_to_move_in" houses={[]} />);

describe("컴패니언 입주권 PR-3 V-5 — 일괄 자산 카드의 4호 근거", () => {
  it("🔑 비과세 → «§89①4호 가목 — 1세대1입주권 비과세» 근거가 뜬다 (종전: «비과세 해당 없음» 한 줄)", () => {
    show(EXEMPT);
    const note = screen.getByTestId("companion-right-exempt-note");
    expect(note.textContent).toContain("유일한 조합원입주권");
    expect(document.body.textContent).toContain("§89①4호 가목");
  });

  it("🔑 12억 초과 안분 → 기준 12억 · 과세 비율 20.00% · 비과세/과세 양도차익이 뜬다 (종전: 과세분 2.4억만)", () => {
    show(PARTIAL);
    const t = screen.getByTestId("companion-right-high-value-note").textContent ?? "";
    expect(t).toContain("12억");
    expect(t).toContain("20.00%");
    expect(t).toContain("960,000,000");
    expect(t).toContain("240,000,000");
    expect(t).toContain("1,500,000,000");
    expect(document.body.textContent).toContain("확인 필요");
  });

  it("나목이면 «나목»으로 뜬다", () => {
    show({ ...EXEMPT, redevelopmentDetail: { oneRightExemptionApplied: true, oneRightExemptionClause: "na" } } as unknown as PerPropertyBreakdown);
    expect(document.body.textContent).toContain("§89①4호 나목");
  });

  it("짝 — 선언 «아니오»(과세)는 근거 카드가 없다", () => {
    show(TAXED);
    expect(screen.queryByTestId("companion-right-exempt-note")).toBeNull();
    expect(screen.queryByTestId("companion-right-high-value-note")).toBeNull();
  });

  it("짝 — 입주권이 아닌 자산(재개발 detail 없음)은 카드가 없다", () => {
    show({ ...TAXED, redevelopmentDetail: undefined } as unknown as PerPropertyBreakdown);
    expect(screen.queryByTestId("companion-right-exempt-note")).toBeNull();
  });
});
