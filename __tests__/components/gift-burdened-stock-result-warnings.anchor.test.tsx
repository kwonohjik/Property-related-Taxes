/**
 * anchor: 주식 부담부증여 결과 카드 ⑦ — 엔진 `warnings` 표시
 *
 * ## 무엇을 잡는가
 *
 * 이 카드는 `result.warnings`를 **한 번도 참조하지 않았다**(grep 0건). 그래서 §157 자동
 * 판정과 폼 값이 어긋난다는 경고도, 상장 환산 종가평균이 비어 취득가액이 0이 됐다는 경고도
 * 화면에 전혀 뜨지 않았다 — 「소리 없이 틀린 세액」의 마지막 관문이 닫혀 있던 것이다.
 *
 * 문구·색은 다른 결과뷰와 같은 공용 leaf(`CalculationWarningsCard`)를 써야 사용자가 같은
 * 것으로 읽는다(memory `feedback_transfer_result_view_is_not_one` 계열).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BurdenedStockTransferTaxResultCard } from "@/components/calc/results/BurdenedStockTransferTaxResultCard";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

function makeResult(warnings: string[]): StockTransferResult {
  return {
    stockName: "삼성전자",
    taxCategory: "listed_off_market_non_major",
    appliedSection94: "①3가",
    transferPrice: 10_000_000,
    acquisitionPrice: 5_000_000,
    expenses: 50_000,
    transferGain: 4_950_000,
    transferIncome: 4_950_000,
    basicDeduction: 2_500_000,
    taxBase: 2_450_000,
    appliedRate: 0.2,
    calculatedTax: 490_000,
    finalTax: 490_000,
    localIncomeTax: 49_000,
    warnings,
    appliedRules: [],
    calculationSteps: [],
  } as unknown as StockTransferResult;
}

describe("BG-WARN — 결과 카드가 엔진 경고를 노출한다", () => {
  it("BG-WARN-1: warnings가 있으면 「확인이 필요한 사항」으로 표시된다", () => {
    render(
      <BurdenedStockTransferTaxResultCard
        stockTransferTaxResults={[
          makeResult(["자동 판정과 폼 토글 입력값이 다릅니다 — 자동 산출 우선 적용"]),
        ]}
      />,
    );
    expect(screen.queryByText("확인이 필요한 사항")).not.toBeNull();
    expect(screen.getByText(/자동 판정과 폼 토글 입력값이 다릅니다/)).not.toBeNull();
  });

  it("BG-WARN-2: 경고가 없으면 카드를 그리지 않는다 (빈 박스 금지)", () => {
    render(<BurdenedStockTransferTaxResultCard stockTransferTaxResults={[makeResult([])]} />);
    expect(screen.queryByText("확인이 필요한 사항")).toBeNull();
  });

  it("BG-WARN-3: 종목마다 자기 경고를 표시한다", () => {
    render(
      <BurdenedStockTransferTaxResultCard
        stockTransferTaxResults={[makeResult(["첫 종목 경고"]), makeResult(["둘째 종목 경고"])]}
      />,
    );
    expect(screen.getByText("첫 종목 경고")).not.toBeNull();
    expect(screen.getByText("둘째 종목 경고")).not.toBeNull();
  });
});
