/**
 * @vitest-environment jsdom
 *
 * 「양도 당시 기준시가」 섹션 — **무엇을 넣는 칸인지 제목이 먼저 말한다**.
 *
 * 제보(2026-09-02): 「입력 방식」과 「1개월 종가 평균」이 각각 떨어진 카드로 있어서
 * **라벨만으로는 무엇을 입력하는지 알 수 없었다** — 아래 hint를 읽고 나서야
 * 「아, 양도 당시 기준시가 계산이구나」 하고 알았다.
 *
 * ⇒ 두 필드를 한 섹션(`ToneCard`)으로 묶고 제목이 답을 먼저 말하게 한다.
 *
 * 근거 — 「소득세법」 제99조 제1항 제3호 → 같은 법 시행령 제165조 제3항:
 *   상장주식의 기준시가 = 양도일·취득일 **이전 1개월간 최종시세가액의 평균액**.
 *   이 값이 「소득세법 시행령」 제176조의2 제2항 제1호 환산취득가액의 **분모**다.
 *
 * 「입력 방식」 라디오는 `layout="inline"`으로 한 행에 놓는다 — 한 행 배치와
 * description 미렌더가 같은 prop에서 나온다.
 *
 * ⚠️ 선택지 **라벨**은 E2E 셀렉터다(`getByRole("radio", { name: /일자별 입력/ })` —
 *    e2e/stock-listed-conversion-kiwoom-autofetch.spec.ts). 바꾸면 함께 갱신할 것.
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PostListingValuationCard } from "@/components/calc/stock-transfer/PostListingValuationCard";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderCard(patch: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kosdaq",
    acquiredBeforeListing: true,
    ...patch,
  } as StockTransferFormData;
  render(<PostListingValuationCard form={form} onChange={vi.fn()} />);
}

/** 「양도 당시 기준시가」 제목을 가진 섹션 카드 */
function section(): HTMLElement {
  const title = screen.getByText("양도 당시 기준시가");
  const card = title.closest("div.rounded-lg");
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

describe("TS — 양도 당시 기준시가 섹션", () => {
  it("TS-1 섹션 제목이 「양도 당시 기준시가」다", () => {
    renderCard();
    expect(screen.getByText("양도 당시 기준시가")).toBeTruthy();
  });

  it("TS-2 「입력 방식」과 「1개월 종가 평균」이 **같은 섹션 안**에 있다", () => {
    renderCard({ transferStdInputMode: "direct" });
    const inside = section();
    const labels = Array.from(inside.querySelectorAll("label")).map((l) =>
      (l.textContent ?? "").replace("*", "").trim()
    );
    expect(labels).toContain("입력 방식");
    expect(labels).toContain("1개월 종가 평균");
  });

  it("TS-3 daily 모드의 일자별 표도 같은 섹션 안에 있다 (같은 값의 다른 입력 경로)", () => {
    renderCard({ transferStdInputMode: "daily" });
    const inside = section();
    expect(inside.querySelector('input[name="transferStdInputMode"]')).toBeTruthy();
    // 일자별 경로의 키움 자동조회 버튼이 이 섹션 안에서 잡힌다
    const buttons = Array.from(inside.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(buttons.some((t) => /키움 자동조회/.test(t))).toBe(true);
  });

  it("TS-4 입력 방식 라디오는 한 행(inline)에 놓인다", () => {
    renderCard();
    const group = section().querySelector('[data-slot="radio-card-group"]');
    expect(group?.getAttribute("data-layout")).toBe("inline");
  });

  it("TS-5 선택지는 direct → daily 순서이고 라벨은 종전 그대로다 (E2E 셀렉터 보호)", () => {
    renderCard();
    const inputs = Array.from(
      section().querySelectorAll<HTMLInputElement>('input[name="transferStdInputMode"]')
    );
    expect(inputs.map((i) => i.value)).toEqual(["direct", "daily"]);
    expect(inputs.map((i) => (i.closest("label") as HTMLElement).textContent?.trim())).toEqual([
      "직접 입력 (1개월 평균 단일 숫자)",
      "일자별 입력 (자동 평균 산정)",
    ]);
  });

  it("TS-6 「입력 방식」의 종전 hint·description은 사라졌다 (제목이 같은 말을 한다)", () => {
    renderCard();
    for (const gone of [
      "direct(단일 숫자) vs daily(일자별 자동 평균)",
      "외부에서 평균 산정 후 입력",
      "양도일 이전 1개월 거래일 종가 입력",
    ]) {
      expect(screen.queryByText(new RegExp(gone.replace(/[()]/g, "\\$&")))).toBeNull();
    }
  });
});
