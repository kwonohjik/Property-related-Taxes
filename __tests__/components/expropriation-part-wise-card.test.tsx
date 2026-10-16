/** 5B — §77 결과 카드가 파트별 판정(감면대상 파트·제외분·기본공제 선공제)을 그린다. 파트별이 아니면 그 줄이 없다. */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PublicExpropriationDetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import { calculatePublicExpropriationReduction } from "@/lib/tax-engine/public-expropriation-reduction";

afterEach(cleanup);

const base = {
  cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: new Date("2025-06-01"),
  transferDate: new Date("2026-06-30"), calculatedTax: 95_060_000, transferIncome: 305_000_000, basicDeduction: 2_500_000, taxBase: 302_500_000,
} as const;

describe("§77 카드 — 파트별 판정 줄 (5B)", () => {
  it("건물만 충족 → 감면대상 건물분·제외 토지분·기본공제 선공제를 표시", () => {
    const detail = calculatePublicExpropriationReduction({
      ...base,
      parts: {
        land: { acquisitionDate: new Date("2024-01-10"), income: 200_000_000 },
        building: { acquisitionDate: new Date("2010-03-02"), income: 105_000_000 },
      },
    });
    const { getByTestId } = render(<PublicExpropriationDetailCard detail={detail} calculatedTax={base.calculatedTax} taxBase={base.taxBase} />);
    const t = getByTestId("expropriation-part-wise").textContent ?? "";
    expect(t).toContain("감면대상 건물분 양도소득금액 105,000,000");
    expect(t).toContain("감면 제외 토지분 200,000,000");
    expect(t).toContain("기본공제 −2,500,000는 감면 제외분에서 먼저 공제");
  });

  it("감면대상 파트의 호가 따로 있으면(Q-F2c) ⑤ 산식이 그 호의 산출세액·과세표준을 쓴다", () => {
    const detail = calculatePublicExpropriationReduction({
      ...base,
      parts: {
        land: { acquisitionDate: new Date("2024-01-10"), income: 200_000_000 },
        building: { acquisitionDate: new Date("2010-03-02"), income: 105_000_000, clauseBasis: { calculatedTax: 16_810_000, taxBase: 105_000_000 } },
      },
    });
    // 현금 100% · 2026 양도 개정율 → 감면소득 = 105,000,000 × 현금율, 감면액 = 16,810,000 × 감면소득 / 105,000,000
    expect(detail.partWise?.clauseBasis).toEqual({ calculatedTax: 16_810_000, taxBase: 105_000_000 });
    expect(detail.rawReductionAmount).toBe(Math.floor((16_810_000 * detail.breakdown.reducibleIncome) / 105_000_000));
    const { getByTestId, container } = render(<PublicExpropriationDetailCard detail={detail} calculatedTax={base.calculatedTax} taxBase={base.taxBase} />);
    expect(getByTestId("expropriation-clause-basis").textContent).toContain("감면대상 파트의 호로 계산");
    const t = container.textContent ?? "";
    expect(t).toContain("건물분이 속한 호의 산출세액");
    expect(t).toContain("16,810,000");
    expect(t).not.toContain("95,060,000 ×");
  });

  it("파트 입력이 없으면(자산 단위 판정) 그 줄이 없다", () => {
    const detail = calculatePublicExpropriationReduction({ ...base, acquisitionDate: new Date("2010-03-02") });
    const { queryByTestId } = render(<PublicExpropriationDetailCard detail={detail} calculatedTax={base.calculatedTax} taxBase={base.taxBase} />);
    expect(queryByTestId("expropriation-part-wise")).toBeNull();
  });
});
