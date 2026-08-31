/**
 * @vitest-environment jsdom
 *
 * anchor: 국외전출세 ⑥ 사이드바 · ⑦ 결과 카드 — §118의15④ 가산세와 총 납부세액
 *
 * ## 왜 이 파일이 필요한가
 *
 * 리뷰 2026-08-28 #24 — `holdingsReportPenalty`는 계산만 되고 어느 총계에도 들어가지
 * 않았다. 결과 카드는 단독 행으로 보여줬지만 **사이드바 요약에서는 금액이 통째로 사라져**,
 * 요약만 본 사용자는 1,000만원을 못 본다. `ExitTaxResult`에 `finalTax`/`totalTax` 필드
 * 자체가 없어(형제 국외주식 트랙엔 있다) 총액 개념이 아예 없었다.
 *
 * 엔진에 필드를 만들어도 화면에 배선하지 않으면 no-op이므로
 * (memory `feedback_api_trigger_without_input_path_is_noop`) 여기가 그 배선을 고정한다.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { ExitTaxResultCard } from "@/components/calc/results/ExitTaxResultCard";
import {
  useStockTransferStore,
  createInitialStockFormData,
} from "@/lib/stores/calc-wizard-stock-store";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

afterEach(cleanup);

function makeResult(over: Partial<ExitTaxInput> = {}) {
  return calculateExitTax({
    marketType: "exit_tax",
    yearsResidentLast10: 8,
    departureDate: new Date("2025-06-02"),
    isMajorShareholder: true,
    holdings: [
      {
        id: "h1",
        stockName: "삼성전자",
        marketType: "kospi",
        shareCount: 100_000,
        acquisitionDate: new Date("2015-03-02"),
        perShareAcquisitionPrice: 20_000,
        departureDayValuationMode: "market_price",
        departureDayMarketPrice: 50_000,
      },
    ],
    hasFiledHoldingsReport: false,
    totalFaceValue: 500_000_000,
    ...over,
  } as ExitTaxInput);
}

describe("EX-UI-CARD — ⑦ 결과 카드가 총계를 보여준다", () => {
  it("EX-UI-CARD-1: 결정세액·총 납부세액 행이 있다", () => {
    render(<ExitTaxResultCard result={makeResult()} />);
    const body = document.body.textContent ?? "";
    // 결정세액 744,375,000 = 산출세액 734,375,000 + 가산세 10,000,000
    expect(body).toContain("744,375,000");
    // 총 납부세액 817,812,500 = 744,375,000 + 지방소득세 73,437,500
    expect(body).toContain("817,812,500");
  });

  it("EX-UI-CARD-2: 가산세가 없으면 결정세액이 산출세액과 같다", () => {
    render(<ExitTaxResultCard result={makeResult({ hasFiledHoldingsReport: true })} />);
    expect(document.body.textContent).toContain("807,812,500"); // 734,375,000 + 73,437,500
  });
});

describe("EX-UI-SIDE — ⑥ 사이드바 요약에서 가산세가 사라지지 않는다", () => {
  beforeEach(() => {
    useStockTransferStore.setState({
      formData: { ...createInitialStockFormData(), marketType: "exit_tax" },
      savedItems: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: makeResult() as any,
      aggregateResult: null,
    });
  });

  it("EX-UI-SIDE-1: 보유현황 미신고 가산세와 총 납부세액이 요약에 뜬다", () => {
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.queryByText("보유현황 미신고 가산세")).not.toBeNull();
    expect(screen.queryByText("총 납부세액")).not.toBeNull();
  });

  it("EX-UI-SIDE-2: 가산세가 없으면 그 행은 그리지 않는다 (0원 행 금지)", () => {
    useStockTransferStore.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: makeResult({ hasFiledHoldingsReport: true }) as any,
    });
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.queryByText("보유현황 미신고 가산세")).toBeNull();
    expect(screen.queryByText("총 납부세액")).not.toBeNull();
  });
});
