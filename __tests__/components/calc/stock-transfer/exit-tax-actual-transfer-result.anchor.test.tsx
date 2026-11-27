/**
 * @vitest-environment jsdom
 *
 * 국외전출세 결과 카드 — 종목별 실제 양도(PR-7b ⑦ · ⑥) anchor
 *
 * 시료는 폼 → ④ body → ⑭ 매핑 → 엔진 실행 결과(`calculateExitTax`)를 그대로 카드에 넣는다(화면은 엔진 echo만 읽는다).
 * 손계산: F1 전량 양도 — 출국일 1,400,000,000 · 실제 1,200,000,000 → 하락분 200,000,000 × 20% = 조정공제 40,000,000 · 경정 후 143,500,000
 *         F1 400주 — 판 부분 560,000,000 · 실제 480,000,000 → 하락분 80,000,000 → 16,000,000
 *   R-1 종목별 근거(판 주식 수 · 판 부분 가액 · 실제 양도가액 · 하락분)와 구분별 조정공제 · 종목별 산식 라벨
 *   R-2 부분 양도·환산 기준일·종목별 비교 «확인 필요» 고지가 주의사항에 보인다(엔진 warnings)
 *   R-3 외국납부세액 안분 echo
 *   R-4 전역 입력 결과(echo 없음)는 종전 라벨 그대로 · 섹션 없음
 *   R-5 사이드바 — 하락분 합 줄(엔진 echo)
 */

import "fake-indexeddb/auto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ExitTaxResultCard } from "@/components/calc/results/ExitTaxResultCard";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { buildExitTaxEngineInput } from "@/lib/api/stock-transfer-exit-tax-engine-input";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { exitActual, exitForm, F1, F1_SOLD, H1 } from "../../../_helpers/exit-tax-2027-form";

afterEach(cleanup);

const html = (n: React.ReactElement) => renderToStaticMarkup(n);
const resultOf = (form: StockTransferFormData) => calculateExitTax(buildExitTaxEngineInput(buildExitTaxApiBody(form)));

describe("R-1 · R-2 종목별 실제 양도 근거", () => {
  it("전량 양도 — 종목별 echo · 구분별 조정공제 · 종목별 산식 라벨 · 경정 후 최종세액", () => {
    const r = resultOf(exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })] }));
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain('data-testid="exit-actual-transfer-result"');
    expect(out).toContain('data-testid="exit-actual-lot-f1"');
    expect(out).toContain("1,000주");
    expect(out).toContain("1,400,000,000"); // 출국일 양도가액 중 판 부분
    expect(out).toContain("1,200,000,000"); // 실제 양도가액
    expect(out).toContain("200,000,000"); // 하락분
    expect(out).toContain('data-testid="exit-actual-bucket-clause2b"');
    expect(out).toContain("조정공제 (§118의12①) = 세율 구분별 조정공제의 합");
    expect(out).toContain("40,000,000");
    expect(out).toContain("143,500,000");
    // 국내 종목에는 «원» 단위 표기를 붙이지 않는다
    expect(out).not.toMatch(/1,200,000,000원/);
  });

  it("부분 양도 400주 — 판 부분 가액과 조정공제 16,000,000 + 고지", () => {
    const r = resultOf(exitForm({ etHoldings: [F1({ actualTransfer: exitActual({ ...F1_SOLD, shareCount: "400" }) })] }));
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("400주");
    expect(out).toContain("560,000,000");
    expect(out).toContain("480,000,000");
    expect(out).toContain("16,000,000");
    // 엔진 warnings — 부분 양도 · 환산 기준일 «확인 필요»
    expect(out).toContain("일부만 양도한 종목");
    expect(out).toContain("환산 기준일은 법령");
    expect(out).toContain("확인 필요");
  });

  it("1호 + 2호 — 구분별 두 줄 · 혼합 조정공제 «확인 필요»", () => {
    const r = resultOf(
      exitForm({
        etHoldings: [
          H1({ actualTransfer: exitActual({ shareCount: "10,000", pricePerShare: "40,000" }) }),
          F1({ actualTransfer: F1_SOLD }),
        ],
        etBasicDeductionAllocClause1: "2,500,000",
        etBasicDeductionAllocClause2b: "0",
      }),
    );
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain('data-testid="exit-actual-bucket-clause1"');
    expect(out).toContain('data-testid="exit-actual-bucket-clause2b"');
    expect(out).toContain("조정공제는 구분별 세율로 계산했습니다");
  });

  it("R-3 외국납부세액 — 입력액과 §118의13① 안분액 echo · 한도 고지는 구분 ≥2일 때", () => {
    const a = exitActual({ ...F1_SOLD, foreignTaxInput: "krw", foreignTaxPaid: "10,000,000" });
    const r = resultOf(exitForm({ etHoldings: [F1({ actualTransfer: a })] }));
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).toContain("입력한 외국납부세액 (원화 환산)");
    expect(out).toContain("외국납부세액 안분 = 외국납부세액 × (양도가액 − 필요경비) ÷ (실제 양도가액 − 필요경비)");
    expect(out).toContain("외국납부세액공제 (§118의13①) = 종목별 안분 외국납부세액의 합과 한도");
  });
});

describe("R-4 전역 입력 결과는 종전 그대로", () => {
  it("echo 없음 → 섹션 없음 · 종전 라벨", () => {
    const r = resultOf(
      exitForm({
        etHoldings: [H1()],
        etDeferralRequested: true,
        etActualTransferDate: "2027-06-01",
        etActualTransferPricePerShare: "40,000",
      }),
    );
    expect(r.adjustmentDeduction).toBeGreaterThan(0);
    const out = html(<ExitTaxResultCard result={r} />);
    expect(out).not.toContain("exit-actual-transfer-result");
    expect(out).toContain("조정공제 (§118의12) = 출국일 시가 - 실양도가액 차이분");
  });
});

describe("R-5 사이드바 (⑥)", () => {
  it("종목별 하락분 합 줄은 엔진 echo — 전역 결과에는 없다", () => {
    const form = exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })] });
    useStockTransferStore.setState({
      formData: form,
      savedItems: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: resultOf(form) as any,
      aggregateResult: null,
    });
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    const row = screen.getByText("실제 양도 하락분 (종목별 합)").closest("div");
    expect(row?.textContent).toContain("200,000,000");
    cleanup();
    const g = exitForm({
      etHoldings: [H1()],
      etDeferralRequested: true,
      etActualTransferDate: "2027-06-01",
      etActualTransferPricePerShare: "40,000",
    });
    useStockTransferStore.setState({
      formData: g,
      savedItems: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: resultOf(g) as any,
      aggregateResult: null,
    });
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.queryByText("실제 양도 하락분 (종목별 합)")).toBeNull();
  });
});
