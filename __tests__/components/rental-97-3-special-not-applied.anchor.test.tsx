/**
 * anchor — §97의3 결과 카드: 요건은 충족했으나 일반 공제액이 커서 특례를 적용하지 않은 경우 (PR-B #1 ⑦)
 *
 * - 「적용 불가」(rose)로 보이면 안 된다 — 요건 불충족이 아니라 선택 결과다.
 * - 특례 산식의 우변은 「특례를 적용했다면」의 값(`deductionWithSpecial`)이어야 한다. 실제 적용값(일반 공제액)을
 *   특례 산식에 붙이면 산식이 자기모순이 된다.
 * - echo 없는 구 이력은 기존 표시 그대로.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";

afterEach(cleanup);

function bodyText(): string {
  return document.body.textContent?.replace(/\s+/g, " ") ?? "";
}

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
  baseLthdRate: 0.8,
  gainApplied: 600_000_000,
};

describe("§97의3 특례 미적용 표시", () => {
  it("일부 임대분 — 안내 + 「특례 적용 시」 산식(우변 = 특례 공제액) + 적용한 일반 산식", () => {
    renderCards({
      ...base,
      rentalGainRatio: 6 / 7,
      rentalGainFraction: { num: 600_000_000, den: 700_000_000 },
      rentalGainApplied: 514_285_714,
      nonRentalGainApplied: 85_714_286,
      specialApplied: false,
      deductionWithSpecial: 428_571_427,
      deductionWithoutSpecial: 480_000_000,
      deductionApplied: 480_000_000,
    });
    expect(screen.getByTestId("rental973-special-not-applied").textContent).toContain("특례를 적용하지 않은 것으로 계산했습니다");
    const t = bodyText();
    expect(t).toContain("특례 적용 시 장기보유특별공제 = 임대기간 분 양도차익 × 특례 공제율 + 비임대 분 양도차익 × 일반 공제율");
    expect(t).toContain("514,285,714 × 70% + 85,714,286 × 80% = 428,571,427");
    expect(screen.getByTestId("rental973-general-formula").textContent?.replace(/\s+/g, " ")).toContain("600,000,000 × 80% = 480,000,000");
    expect(t).not.toContain("적용 불가");
  });

  it("특례 채택(specialApplied true)·구 이력(echo 없음)은 안내·일반 산식을 렌더하지 않는다", () => {
    const applied = {
      ...base,
      baseLthdRate: 0.3,
      rentalGainRatio: 1,
      rentalGainApplied: 600_000_000,
      nonRentalGainApplied: 0,
      deductionApplied: 420_000_000,
    };
    for (const extra of [{ specialApplied: true, deductionWithSpecial: 420_000_000, deductionWithoutSpecial: 180_000_000 }, {}]) {
      cleanup();
      renderCards({ ...applied, ...extra });
      expect(screen.queryByTestId("rental973-special-not-applied")).toBeNull();
      expect(screen.queryByTestId("rental973-general-formula")).toBeNull();
      expect(bodyText()).toContain("600,000,000 × 70% = 420,000,000");
      expect(bodyText()).not.toContain("특례 적용 시");
    }
  });
});
