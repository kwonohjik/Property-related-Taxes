/**
 * @vitest-environment jsdom
 *
 * ⑤ Step 2 — 영 §163⑨ 추계 차단의 UI: 매매사례는 상속·증여면 언제나 비활성, 환산취득가는 «장부분실이 성립할 수
 * 있는 시장»(비상장·코스닥·코넥스)에서만 열린다. 날짜는 보지 않는다.
 *
 * 계획서 `docs/00-pm/stock-163-9-valuation-unavailable-exception.plan.md` §3.3 · Q-2
 *
 *   UI-1  비상장 상속/증여 → 매매사례 비활성 · 환산 활성 · 안내가 «취득시점 장부분실»을 알린다
 *   UI-2  날짜 무관 — 의제취득일 전·후 모두 같다 (종전엔 날짜로 갈렸다)
 *   UI-3  코스피 → 환산도 비활성 (토글이 성립할 수 없다) · 안내는 «쓸 수 없습니다»
 *   UI-3b 기타자산 → 환산 활성 (영 §165⑧1호 — 비상장 보충평가라 토글이 성립한다. 2026-10-04 재기준)
 *   UI-4  코스닥 → 환산 활성 (양도일 거래정지 경로에서 토글이 열린다)
 *   UI-5  매수는 영향 없음 — 안내 없음 · 둘 다 활성
 *
 * 긍정 짝: UI-5 · UI-1의 환산 활성. 부정: UI-3.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function formOf(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "unlisted",
    acquisitionCause: "inheritance",
    acquisitionDate: "1990-01-01",
    transferDate: "2025-12-01",
    shareCount: "1000",
    ...o,
  } as StockTransferFormData;
}

function radio(name: string): HTMLInputElement | HTMLElement {
  return screen.getByRole("radio", { name });
}
const isDisabled = (el: HTMLElement) =>
  (el as HTMLInputElement).disabled === true || el.getAttribute("aria-disabled") === "true";
const notice = () => screen.queryByTestId("gift-valuation-only-notice");

describe("UI-1·2: 비상장 상속·증여 — 환산은 장부분실로 열린다, 날짜는 무관", () => {
  it.each([
    ["inheritance", "1990-01-01"],
    ["gift", "1990-01-01"],
    ["inheritance", "1985-09-13"], // 의제취득일 전 — 종전엔 날짜 때문에 열렸다
    ["gift", "2020-06-01"],
  ] as const)("%s · %s → 매매사례 비활성 · 환산 활성", (cause, date) => {
    render(<Step2 form={formOf({ acquisitionCause: cause, acquisitionDate: date })} onChange={vi.fn()} />);
    expect(isDisabled(radio("매매사례가액"))).toBe(true);
    expect(isDisabled(radio("환산취득가"))).toBe(false);
  });

  it("안내는 «취득시점 장부분실»로 안내하고 매매사례 불가를 말한다", () => {
    render(<Step2 form={formOf()} onChange={vi.fn()} />);
    const t = notice()!.textContent ?? "";
    expect(t).toContain("취득시점 장부분실");
    expect(t).toContain("매매사례가액은 쓸 수 없습니다");
    expect(t).toContain("§99①4 후단");
    expect(t).not.toMatch(/\d원/); // 「원」 미표기 (feedback_no_won_suffix)
  });
});

describe("UI-3: 장부분실이 성립할 수 없는 시장 — 환산도 비활성 (부정)", () => {
  it.each(["kospi"] as const)("%s → 둘 다 비활성 · 안내 «쓸 수 없습니다»", (m) => {
    render(<Step2 form={formOf({ marketType: m })} onChange={vi.fn()} />);
    expect(isDisabled(radio("매매사례가액"))).toBe(true);
    expect(isDisabled(radio("환산취득가"))).toBe(true);
    const t = notice()!.textContent ?? "";
    expect(t).toContain("환산취득가·매매사례가액은 쓸 수 없습니다");
    expect(t).not.toContain("취득시점 장부분실");
  });
});

describe("UI-3b: 기타자산 — 비상장 보충평가라 장부분실 토글이 성립하므로 환산 활성", () => {
  it("other_asset → 환산 활성 · 매매사례 비활성 · 안내가 «취득시점 장부분실»을 알린다", () => {
    render(<Step2 form={formOf({ marketType: "other_asset" })} onChange={vi.fn()} />);
    expect(isDisabled(radio("환산취득가"))).toBe(false);
    expect(isDisabled(radio("매매사례가액"))).toBe(true);
    expect(notice()!.textContent).toContain("취득시점 장부분실");
  });
});

describe("UI-4: 코스닥·코넥스 — 양도일 거래정지 경로에서 토글이 열리므로 환산 활성", () => {
  it.each(["kosdaq", "konex"] as const)("%s → 환산 활성 · 매매사례 비활성", (m) => {
    render(<Step2 form={formOf({ marketType: m })} onChange={vi.fn()} />);
    expect(isDisabled(radio("환산취득가"))).toBe(false);
    expect(isDisabled(radio("매매사례가액"))).toBe(true);
  });
});

describe("UI-5: 매수·승계 외 원인은 영향 없음 (긍정 짝)", () => {
  it("매수 → 안내 없음 · 둘 다 활성", () => {
    render(<Step2 form={formOf({ acquisitionCause: "purchase" })} onChange={vi.fn()} />);
    expect(notice()).toBeNull();
    expect(isDisabled(radio("환산취득가"))).toBe(false);
    expect(isDisabled(radio("매매사례가액"))).toBe(false);
  });
});
