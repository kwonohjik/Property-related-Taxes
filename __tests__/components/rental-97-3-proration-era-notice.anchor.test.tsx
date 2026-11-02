/**
 * anchor — §97의3 결과 카드의 양도일 구간 고지 (PR-A: 계획서 #4 ⑦)
 *
 * 엔진 echo `prorationEra`(`data/rental-97-3-proration-era.ts`)가 있을 때만 렌더한다 — 구 이력(echo 없음)은 미표시.
 * 배선까지 고정하려고 `ReductionDetailCards`를 경유한다(같은 폴더 `transfer-reduction-formula-cards.test.tsx` 방식).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";

afterEach(cleanup);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCards(detail: any) {
  return render(
    <ReductionDetailCards
      result={{ rental97LthdDetail: detail } as never}
      calculatedTax={10_000_000}
      taxBase={50_000_000}
      longTermHoldingDeduction={7_000_000}
    />,
  );
}

const base = {
  id: "rental_97_3" as const,
  isEligible: true as const,
  legalBasis: "조특법 §97의3",
  effectCategory: "long_term_holding_special" as const,
  overrideRate: 0.5,
  eligibleRentalYears: 8,
  baseLthdRate: 0.16,
  gainApplied: 100_000_000,
};

describe("§97의3 양도일 구간 고지", () => {
  it("whole_gain — 2020.12.31 이전 양도는 전체 양도소득 적용을 고지한다", () => {
    renderCards({ ...base, prorationEra: "whole_gain", rentalGainRatio: 1, rentalGainApplied: 100_000_000, nonRentalGainApplied: 0, deductionApplied: 50_000_000 });
    expect(screen.getByTestId("rental973-era-whole-gain").textContent).toContain("2020.12.31 이전 양도분");
  });

  it("no_formula + 안분 — 산식 명문화 전 양도분은 준용 사실을 고지한다", () => {
    renderCards({ ...base, prorationEra: "no_formula", rentalGainRatio: 0.6, rentalGainApplied: 60_000_000, nonRentalGainApplied: 40_000_000, deductionApplied: 36_400_000 });
    const t = screen.getByTestId("rental973-era-formula-applied").textContent ?? "";
    expect(t).toContain("2026.2.27");
    expect(t).toContain("기준시가를 기준으로 산정한다");
  });

  it("pre_decree + 안분 — 위임 시행령이 없던 구간을 고지한다", () => {
    renderCards({ ...base, prorationEra: "pre_decree", rentalGainRatio: 0.6, rentalGainApplied: 60_000_000, nonRentalGainApplied: 40_000_000, deductionApplied: 36_400_000 });
    expect(screen.getByTestId("rental973-era-formula-applied").textContent).toContain("2021.2.17 전에는 위임 시행령 자체가 없었습니다");
  });

  it("formula 구간·echo 없는 구 이력·비율 1 준용 구간은 고지하지 않는다", () => {
    const ratio1 = { rentalGainRatio: 1, rentalGainApplied: 100_000_000, nonRentalGainApplied: 0, deductionApplied: 50_000_000 };
    for (const era of ["formula", undefined, "no_formula"]) {
      cleanup();
      renderCards({ ...base, ...ratio1, prorationEra: era });
      expect(screen.queryByTestId("rental973-era-whole-gain"), String(era)).toBeNull();
      expect(screen.queryByTestId("rental973-era-formula-applied"), String(era)).toBeNull();
    }
  });
});
