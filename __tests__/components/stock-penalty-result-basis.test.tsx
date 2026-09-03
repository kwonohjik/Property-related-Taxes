/**
 * @vitest-environment jsdom
 *
 * 결과뷰 「가산세 분기 안내」 — 없는 위반을 인쇄하지 않는다 (리뷰 2026-08-28 #19 부수)
 *
 * 이 카드는 신고불성실가산세 **행**과 달리 무조건 렌더된다. 그래서 분기 문구를 만드는
 * 삼항 사슬이 `violation === "none"`을 「일반 과소신고 10%」로 떨어뜨리면,
 * 정상 신고 + 납부지연만 있는 결과에 **하지도 않은 과소신고가 인쇄된다**.
 * §47조의4는 §47조의2·§47조의3을 요건으로 하지 않으므로 이 조합은 정상적인 사안이다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StockTransferPenaltySection } from "@/components/calc/results/StockTransferPenaltySection";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

afterEach(cleanup);

function result(o: Partial<StockTransferResult> = {}): StockTransferResult {
  return {
    underReportPenalty: 0,
    latePaymentPenalty: 68_200,
    electronicFilingCredit: 0,
  } as StockTransferResult & typeof o;
}

describe("PR-BASIS 정상 신고 + 납부지연", () => {
  it("PR-BASIS-1: 「과소신고」 분기 문구가 인쇄되지 않는다", () => {
    render(
      <StockTransferPenaltySection
        result={result()}
        filingViolation="none"
        isFraudulent={false}
        isInternationalTransaction={false}
      />,
    );
    expect(screen.queryByText(/일반 과소신고 10%/)).toBeNull();
    expect(screen.getByText(/신고불성실가산세 해당 없음/)).toBeTruthy();
  });

  it("PR-BASIS-2: 납부지연 행은 그대로 표시된다", () => {
    render(
      <StockTransferPenaltySection
        result={result()}
        filingViolation="none"
        isFraudulent={false}
        isInternationalTransaction={false}
      />,
    );
    // 🔴 G-17: 「납부불성실」은 폐지된 조문 제목이다 — 현행 §47조의4의 제목은 「납부지연가산세」.
    expect(screen.getByText(/납부지연 가산세 \(국세기본법 §47조의4\)/)).toBeTruthy();
  });

  it("PR-BASIS-3: 실제 과소신고면 종전 문구 그대로 (회귀 가드)", () => {
    render(
      <StockTransferPenaltySection
        result={{ ...result(), underReportPenalty: 1_000_000 } as StockTransferResult}
        filingViolation="under_report"
        isFraudulent={false}
        isInternationalTransaction={false}
      />,
    );
    expect(screen.getByText(/일반 과소신고 10%/)).toBeTruthy();
  });
});
