/**
 * @vitest-environment jsdom
 *
 * 가산세 상세 «기납부세액» 안내 문구 anchor (V-13 · Q-1 a)
 *
 * 계획서: docs/00-pm/stock-penalty-base-unit-v13.plan.md
 *
 * 가산세 기준금액 = 결정세액 − 기납부 − 당초신고 − 이자상당액(`calculateFilingPenalty`). 이 «기납부세액»은 §111③ 확정신고 정산의
 * «기납부 양도소득세»와 **다른 입력 축**이라(스키마 주석이 의도적 분리를 명시) 같은 값을 두 번 넣어야 한다. 비우면 기준금액이
 * 결정세액 전액이 된다. 문구가 그 사실을 알려야 한다. 계산·전송은 건드리지 않는다.
 *
 * 🔑 Step3 을 렌더한다 — 블록을 직접 렌더하면 «Step3 에 배선됐는가»를 못 본다(`stock-penalty-detail-step3.test.tsx` 와 같은 규약).
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

describe("PH-1 신고 위반을 선언하면 «기납부세액» 칸에 두 입력 축의 관계를 안내한다", () => {
  for (const v of ["non_report", "under_report"] as const) {
    it(`PH-1 ${v}: 확정 정산 칸과 같은 값 · 예정 합산 시 이미 신고한 예정신고 산출세액 · 비우면 결정세액 전액`, () => {
      render(<Step3 form={form({ filingViolation: v })} onChange={() => {}} />);
      const hint = screen.getByTestId("stock-penalty-prior-paid-hint").textContent ?? "";
      expect(hint).toContain("기납부 양도소득세");
      expect(hint).toContain("§111③");
      expect(hint).toContain("§107②");
      expect(hint).toContain("이미 신고한 예정신고 산출세액");
      expect(hint).toContain("결정세액 전액");
    });
  }

  it("PH-2 정상 신고(none)면 가산세 기준금액 블록 자체가 없다 — 안내도 없다(대조군)", () => {
    render(<Step3 form={form({ filingViolation: "none" })} onChange={() => {}} />);
    expect(screen.queryByTestId("stock-penalty-prior-paid-hint")).toBeNull();
  });
});
