/**
 * @vitest-environment jsdom
 *
 * ⑦ 국외주식 결과 카드 — 가산세 행
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (§11.6 잔여-1)
 *
 * 엔진이 가산세를 계산해도 카드가 그리지 않으면 사용자는 최종세액이 왜 그 금액인지 알 수 없다
 * (Phase D 의 증권거래세와 같은 실패 모드 — 계산은 맞는데 **표시 누락**).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ForeignStockResultCard } from "@/components/calc/results/ForeignStockResultCard";
import type { ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

afterEach(cleanup);

function res(over: Partial<ForeignStockResult> = {}): ForeignStockResult {
  return {
    taxCategory: "foreign_stock",
    isLiable: true,
    transferPriceKrw: 101_000_000,
    acquisitionPriceKrw: 1_000_000,
    necessaryExpensesKrw: 0,
    transferGain: 100_000_000,
    basicDeduction: 2_500_000,
    taxBase: 97_500_000,
    appliedRate: 0.2,
    progressiveDeduction: 0,
    incomeTax: 19_500_000,
    localIncomeTax: 1_950_000,
    finalTax: 19_500_000,
    finalLocalTax: 1_950_000,
    totalTax: 21_450_000,
    transferExchangeRate: 1,
    acquisitionExchangeRate: 1,
    warnings: [],
    appliedRules: [],
    ...over,
  } as unknown as ForeignStockResult;
}

describe("FC-1 가산세 행", () => {
  it("FC-1-1: 가산세가 0이면 행이 없다 (종전 화면과 같다)", () => {
    render(<ForeignStockResultCard result={res()} />);
    expect(screen.queryByText(/신고불성실 가산세/)).toBeNull();
    expect(screen.queryByText(/납부지연 가산세/)).toBeNull();
  });

  it("FC-1-2: 신고불성실 가산세와 **기준금액**이 보인다", () => {
    render(
      <ForeignStockResultCard
        result={res({
          underReportPenalty: 7_800_000,
          penaltyBase: 19_500_000,
          finalTax: 27_300_000,
        })}
      />,
    );
    expect(screen.getByText(/신고불성실 가산세/)).toBeTruthy();
    expect(screen.getByText(/과소신고납부세액등/)).toBeTruthy();
  });

  it("FC-1-3: 납부지연 가산세 행과 산식이 보인다", () => {
    render(
      <ForeignStockResultCard
        result={res({ latePaymentPenalty: 68_200, finalTax: 19_568_200 })}
      />,
    );
    expect(screen.getByText(/납부지연 가산세/)).toBeTruthy();
    expect(screen.getByText(/1일 10만분의 22/)).toBeTruthy();
  });

  it("FC-1-4: 가산세가 있으면 최종 소득세 산식에 「+ 가산세」가 붙는다", () => {
    render(
      <ForeignStockResultCard
        result={res({ underReportPenalty: 7_800_000, finalTax: 27_300_000 })}
      />,
    );
    expect(screen.getByText(/\+ 가산세/)).toBeTruthy();
  });
});
