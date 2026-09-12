/**
 * @vitest-environment jsdom
 *
 * ⑤ — 코스피에서 거래정지 2모드가 `disabled` 다 (영 §165③ 코스닥·코넥스 한정)
 *
 * 법령 근거와 두 논거(공백·잉여)는 단일 정본
 * `lib/tax-engine/stock-transfer/trading-halt-market-scope.ts` 머리말에 있다.
 *
 * 🔑 **`AcquisitionStdModeRadio` 를 직접 렌더하지 않는다** — 그러면 Step2 가 `marketType`
 *    prop 을 넘기지 않게 돼도 앵커가 초록으로 남는다(관측 단계 어긋남).
 *    ⇒ Step2 를 통째로 렌더해 «실제 화면이 막혔는가»를 본다.
 *    [[feedback_anchor_observes_wrong_stage]]
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderStep2(marketType: string, extra: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType,
    ...extra,
    securityCode: "005930",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    acquisitionMode: "estimated",
  } as StockTransferFormData;
  render(<Step2 form={form} onChange={() => {}} />);
}

/** 기준시가 산정 방식 라디오의 한 옵션 input */
function stdModeInput(value: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    `input[name="acquisitionStdMode"][value="${value}"]`,
  );
}

describe("KHU — 코스피에서 거래정지 옵션은 고를 수 없다", () => {
  it("KHU-1: 코스피 — halt 2개는 disabled, 나머지 2개는 살아 있다", () => {
    renderStep2("kospi");
    expect(stdModeInput("halt_transfer")?.disabled).toBe(true);
    expect(stdModeInput("halt_acquisition")?.disabled).toBe(true);
    // 같은 그룹의 형제까지 함께 막지 않았는지 — 좁히기가 이웃을 먹는 것을 차단
    expect(stdModeInput("monthly_avg")?.disabled).toBe(false);
    expect(stdModeInput("post_listing")?.disabled).toBe(false);
  });

  it("KHU-2: 코스닥·코넥스 — halt 2개가 그대로 살아 있다 (구별력 짝)", () => {
    for (const mt of ["kosdaq", "konex"]) {
      cleanup();
      renderStep2(mt);
      expect(stdModeInput("halt_transfer")?.disabled, mt).toBe(false);
      expect(stdModeInput("halt_acquisition")?.disabled, mt).toBe(false);
    }
  });

  it("KHU-3: 코스피에서 차단 사유가 화면에 뜬다 (왜 못 고르는지)", () => {
    renderStep2("kospi");
    const group = stdModeInput("halt_transfer")!.closest('[data-slot="radio-card-group"]')!;
    expect(group.textContent).toContain("코스닥·코넥스 상장법인에만 적용");
    expect(group.textContent).toContain("§99①3");
  });

  /**
   * KHU-4~5: 키움 거래정지 감지 배너는 **시장을 안다**.
   * 종전 문구는 코스피에서도 「거래정지를 고르세요」라고 안내해 이제 disabled 인 옵션을
   * 가리켰다 — 사용자를 막다른 길로 보낸다.
   */
  it("KHU-4: 코스피 — 감지 배너가 「바꿀 필요 없다」고 말한다", () => {
    renderStep2("kospi", { kiwoomTradingHalt: true } as Partial<StockTransferFormData>);
    const body = document.body.textContent ?? "";
    expect(body).toContain("거래정지·관리종목이 감지");
    expect(body).toContain("바꿀 필요가 없습니다");
    expect(body).not.toContain("「양도일 거래정지」 또는 「취득일 거래정지」를 고르세요");
  });

  it("KHU-5: 코스닥 — 종전대로 「고르세요」다 (구별력 짝)", () => {
    renderStep2("kosdaq", { kiwoomTradingHalt: true } as Partial<StockTransferFormData>);
    const body = document.body.textContent ?? "";
    expect(body).toContain("「양도일 거래정지」 또는 「취득일 거래정지」를 고르세요");
    expect(body).not.toContain("바꿀 필요가 없습니다");
  });
});
