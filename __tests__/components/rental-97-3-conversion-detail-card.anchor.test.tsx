/**
 * anchor — §97의3 결과 카드: 단기→장기 변경신고 의제 개시일 표시 (PR-C #3 ⑦). echo 없는 구 이력은 미표시.
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
  overrideRate: 0.7,
  eligibleRentalYears: 10,
  rentalGainRatio: 1,
};

describe("§97의3 변경신고 의제 개시일", () => {
  it("2019.2.12 이후 신고(가목) — 의제 개시일·의무기간을 보여준다", () => {
    renderCards({ ...base, shortTermConversionDetail: { era: "new_before_end", deemedStartDate: "2016-03-01", obligationYears: 4 } });
    const t = screen.getByTestId("rental973-conversion-detail").textContent ?? "";
    expect(t).toContain("2016-03-01");
    expect(t).toContain("단기 임대의무기간 4년 종료 전 변경신고");
  });

  it("2019.2.11 이전 신고 — 50% 산입 일수를 보여준다 · 부칙 §29② 해당이면 그 근거도", () => {
    renderCards({ ...base, shortTermConversionDetail: { era: "old", deemedStartDate: "2017-02-11", creditedDays: 730 } });
    expect(screen.getByTestId("rental973-conversion-detail").textContent).toContain("730일");
    cleanup();
    renderCards({ ...base, shortTermConversionDetail: { era: "old_grandfathered", deemedStartDate: "2015-02-15", creditedDays: 913 } });
    expect(screen.getByTestId("rental973-conversion-detail").textContent).toContain("부칙 §29②");
  });

  it("echo 없음 → 미표시", () => {
    renderCards(base);
    expect(screen.queryByTestId("rental973-conversion-detail")).toBeNull();
  });
});
