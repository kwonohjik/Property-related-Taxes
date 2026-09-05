/**
 * anchor: 상속주택 환산 카드 (B) 박스는 **결론이 아니라 상태를 밝힌 참고 산식**이다 (Q18).
 *
 * 종전에는 「환산취득가액 = 양도가액 × 비율」을 무조건 결론처럼 표시했다. 같은 화면 옆
 * 카드(`InheritedAcquisitionDetailCard`)는 동일 판정을 「미적용」 취소선으로 보여 주므로
 * 한 화면 안에서 모순됐다.
 *
 * ⭐ 판정은 **복제하지 않는다** — 옆 카드가 읽는 `preDeemedBreakdown.selectedMethod`를
 *    그대로 받는다. 그래서 「항상 미적용」 같은 단정 없이도 화면이 갈리지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { InheritedHouseValuationDetailCard } from "../../components/calc/results/transfer/InheritedHouseValuationDetailCard";
import type { InheritanceHouseValuationResult } from "../../lib/tax-engine/types/inheritance-house-valuation.types";
import type { InheritanceAcquisitionResult } from "../../lib/tax-engine/types/inheritance-acquisition.types";

afterEach(cleanup);

const DETAIL: InheritanceHouseValuationResult = {
  sumAtInheritance: 100_000_000,
  sumAtFirstDisclosure: 200_000_000,
  landStdAtInheritance: 60_000_000,
  landStdAtTransfer: 300_000_000,
  landStdAtFirstDisclosure: 120_000_000,
  buildingStdAtInheritance: 40_000_000,
  buildingStdAtFirstDisclosure: 80_000_000,
  housePriceAtFirstDisclosure: 250_000_000,
  housePriceAtInheritanceUsed: 125_000_000,
  housePriceAtTransfer: 500_000_000,
  estimationMethod: "estimated_phd",
  formula: "테스트 산식",
  legalBasis: "소득세법 시행령 §164⑦",
  warnings: [],
};

function acq(over: Partial<InheritanceAcquisitionResult>): InheritanceAcquisitionResult {
  return {
    acquisitionPrice: 125_000_000,
    method: "pre_deemed_max",
    legalBasis: "테스트",
    formula: "테스트",
    ...over,
  };
}

describe("상속주택 환산 카드 — (B) 환산취득가액 적용 상태", () => {
  it("가목(①②)이 확인된 경우 — 「미적용」을 밝힌다", () => {
    render(
      <InheritedHouseValuationDetailCard
        detail={DETAIL}
        acquisitionDetail={acq({
          preDeemedBreakdown: {
            reportedAmount: 130_000_000,
            convertedAmount: 125_000_000,
            sec164Amount: 125_000_000,
            selectedMethod: "reported",
          },
        })}
      />,
    );
    const box = screen.getByTestId("inh-house-converted-box");
    expect(box.textContent).toMatch(/미적용/);
    expect(box.textContent).toMatch(/실지거래가액 의제/);
  });

  it("실제로 환산이 쓰인 경우 — 「적용」으로 표시한다", () => {
    render(
      <InheritedHouseValuationDetailCard
        detail={DETAIL}
        acquisitionDetail={acq({
          preDeemedBreakdown: {
            reportedAmount: null,
            convertedAmount: 125_000_000,
            sec164Amount: null,
            selectedMethod: "converted",
          },
        })}
      />,
    );
    const box = screen.getByTestId("inh-house-converted-box");
    expect(box.textContent).toMatch(/적용/);
    expect(box.textContent).not.toMatch(/미적용/);
  });

  it("의제취득일 이후 상속(나목 자체가 없음) — 「미적용」", () => {
    render(
      <InheritedHouseValuationDetailCard
        detail={DETAIL}
        acquisitionDetail={acq({ method: "supplementary", preDeemedBreakdown: undefined })}
      />,
    );
    expect(screen.getByTestId("inh-house-converted-box").textContent).toMatch(/미적용/);
  });

  it("🔑 취득가액 결과가 없으면 적용·미적용 어느 쪽도 단정하지 않는다", () => {
    render(<InheritedHouseValuationDetailCard detail={DETAIL} />);
    const box = screen.getByTestId("inh-house-converted-box");
    expect(box.textContent).not.toMatch(/미적용/);
    // 「적용」 배지도 붙이지 않는다 — 산식 본문의 「환산취득가액」만 남는다.
    expect(box.querySelector(".bg-emerald-100")).toBeNull();
  });

  it("산식 자체는 상태와 무관하게 계속 보여 준다 (근거 추적용)", () => {
    render(<InheritedHouseValuationDetailCard detail={DETAIL} />);
    expect(screen.getByTestId("inh-house-converted-box").textContent).toMatch(
      /양도당시 개별주택가격/,
    );
  });
});
