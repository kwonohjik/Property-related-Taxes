/**
 * @vitest-environment jsdom
 *
 * ⑤ 가산세 상세 입력 — **Step3 에서 시작하는** UI anchor
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase A′)
 *
 * 🔑 **`PenaltyDetailBlock` 을 직접 렌더하면 안 된다** — 그러면 「블록이 Step3 에 배선됐는가」와
 *    「신고 위반 축에서만 열리는가」를 검증하지 못한다. 진입점이 결함보다 아래면 통과가
 *    도달을 뜻하지 않는다(메모리 `feedback_leaf_anchor_skips_zod_layer` 의 UI 판).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    transferDate: "2024-06-01",
    ...o,
  };
}

describe("PS-1 §47조의3 기준금액은 신고 위반 축에서만, §47조의4 납부지연은 항상 열린다", () => {
  /**
   * 🔴 **PS-1-1은 종전에 「정상 신고면 납부지연 칸이 없다」를 단언해 결함을 동결하고 있었다**
   *    (리뷰 2026-08-28 #19). 국세기본법 §47조의4①1호는 「법정납부기한까지 납부하지
   *    아니하거나 적게 납부한 경우」로 §47조의2·§47조의3을 **요건으로 하지 않는다**.
   *    기한 내에 정확히 신고하고 납부만 늦은 사안이 가장 흔한데, 그 입력 경로가 아예 없었다.
   *    부동산 정본(`transfer-tax/steps/Step6.tsx`)도 이 블록을 게이트 밖 형제로 둔다.
   */
  it("PS-1-1: 정상 신고(none)여도 납부지연 칸은 열린다 (§47조의4는 독립)", () => {
    render(<Step3 form={form({ filingViolation: "none" })} onChange={() => {}} />);
    expect(screen.getByText("법정납부기한")).toBeTruthy();
    expect(screen.getByText(/미납·과소납부세액/)).toBeTruthy();
  });

  it("PS-1-1b: 정상 신고(none)면 §47조의3 기준금액 차감 칸은 없다", () => {
    render(<Step3 form={form({ filingViolation: "none" })} onChange={() => {}} />);
    expect(screen.queryByText(/당초 신고세액/)).toBeNull();
    expect(screen.queryByText(/기납부세액/)).toBeNull();
  });

  it("PS-1-2: 과소신고면 기준금액 차감 칸과 납부지연 칸이 모두 열린다", () => {
    render(<Step3 form={form({ filingViolation: "under_report" })} onChange={() => {}} />);
    expect(screen.getByText("법정납부기한")).toBeTruthy();
    expect(screen.getByText(/당초 신고세액/)).toBeTruthy();
    expect(screen.getByText(/기납부세액/)).toBeTruthy();
  });

  it("PS-1-3: 무신고에는 「당초 신고세액」이 없다 — 신고 자체가 없었기 때문", () => {
    render(<Step3 form={form({ filingViolation: "non_report" })} onChange={() => {}} />);
    expect(screen.queryByText(/당초 신고세액/)).toBeNull();
    // 나머지 차감·납부지연 칸은 무신고에도 있다
    expect(screen.getByText(/기납부세액/)).toBeTruthy();
    expect(screen.getByText("법정납부기한")).toBeTruthy();
  });

  it("PS-1-4: 납부지연 칸은 축 3종 어디서나 **정확히 1개**다 (게이트 안팎 중복 금지)", () => {
    for (const v of ["none", "under_report", "non_report"] as const) {
      cleanup();
      render(<Step3 form={form({ filingViolation: v })} onChange={() => {}} />);
      expect(screen.getAllByText("법정납부기한")).toHaveLength(1);
    }
  });
});

describe("PS-2 안내 문구가 신고-단위 1회 산정을 말한다", () => {
  it("PS-2-1: 「합산 결정세액에 한 번」이 안내에 있다", () => {
    render(<Step3 form={form({ filingViolation: "under_report" })} onChange={() => {}} />);
    expect(screen.getByText(/합산 결정세액에 한 번/)).toBeTruthy();
  });
});

describe("PS-3 §47조의3①1호 나목 — 「부정행위로 인한 과소신고분」", () => {
  it("PS-3-1: 과소신고 + 부정행위면 칸이 열린다", () => {
    render(
      <Step3
        form={form({ filingViolation: "under_report", isFraudulent: true })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/부정행위로 인한 과소신고분/)).toBeTruthy();
  });

  it("PS-3-2: 부정행위가 아니면 칸이 없다 — 분해가 성립하지 않는다", () => {
    render(
      <Step3
        form={form({ filingViolation: "under_report", isFraudulent: false })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/부정행위로 인한 과소신고분/)).toBeNull();
  });

  it("PS-3-3: **무신고에는 칸이 없다** — §47조의2① 은 「비율을 곱한 금액」이라 각 목이 없다", () => {
    render(
      <Step3
        form={form({ filingViolation: "non_report", isFraudulent: true })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/부정행위로 인한 과소신고분/)).toBeNull();
  });
});
