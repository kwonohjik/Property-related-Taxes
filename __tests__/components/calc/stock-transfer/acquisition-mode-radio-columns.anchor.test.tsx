/**
 * @vitest-environment jsdom
 *
 * Step2 「② 취득가액」 모드 라디오 — **4개를 2열 2행으로 접는다**.
 *
 * 제보(2026-09-02): 선택지 4개가 세로로 쌓여 4행을 먹었다.
 *
 * ⚠️ `layout="inline"`이 아니라 `columns={2}`다 — 이 그룹의 description은
 *    **조문과 적용 범위**를 담고 있어(영§176의2③1호 주권상장법인 제외 · §99①4 등)
 *    지우면 판단 근거가 사라진다. inline은 description을 렌더하지 않는다.
 *    ⇒ 카드 모양(stack)을 유지한 채 열만 2로 접는다. 모바일은 항상 1열.
 *
 * 🔑 **`RadioCardGroup`을 직접 렌더해서는 안 된다.** 그러면 Step2에서 `columns={2}`를
 *    떼어내도 앵커가 초록으로 남는다 — 관측 단계가 어긋난다.
 *    ⇒ Step2를 통째로 렌더해 «실제 화면이 2열인가»를 본다.
 *    [[feedback_anchor_observes_wrong_stage]]
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function renderStep2(o: Partial<StockTransferFormData> = {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    acquisitionMode: "estimated",
    ...o,
  } as StockTransferFormData;
  render(<Step2 form={form} onChange={() => {}} />);
}

/** 취득가액 모드 라디오 그룹 — 정체는 `name`이다(같은 화면에 다른 그룹이 여럿 있다) */
function acqModeGroup(): HTMLElement {
  const input = document.querySelector('input[name="acquisitionMode"]');
  expect(input).toBeTruthy();
  const group = input!.closest('[data-slot="radio-card-group"]');
  expect(group).toBeTruthy();
  return group as HTMLElement;
}

describe("AM — 취득가액 모드 라디오는 2열 2행이다", () => {
  it("AM-1 sm↑에서 2열 그리드다 (모바일은 1열, 세로 쌓기 아님)", () => {
    renderStep2();
    const cls = acqModeGroup().className;
    expect(cls).toContain("sm:grid-cols-2");
    expect(cls).toContain("grid-cols-1");
    expect(cls).not.toContain("space-y-2"); // 세로 쌓기(columns 미지정) 회귀 차단
    // ⚠️ `sm:grid-cols-2` 포함만 보면 **columns={4}도 통과한다** —
    //    columns 4는 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`라 sm 단계가 겹친다(뮤테이션 M-10 실측).
    //    넓은 화면에서 4열(=1행)이 되는 것은 이 변경의 의도가 아니므로 lg 분기 부재까지 본다.
    expect(cls).not.toContain("lg:grid-cols-4");
    expect(cls).not.toContain("sm:grid-cols-3");
  });

  it("AM-2 선택지는 4개 그대로다 (2열 × 2행)", () => {
    renderStep2();
    const values = Array.from(
      acqModeGroup().querySelectorAll<HTMLInputElement>('input[name="acquisitionMode"]')
    ).map((i) => i.value);
    expect(values).toEqual(["actual", "estimated", "sale_case", "face_value"]);
  });

  it("AM-3 stack 레이아웃이라 description이 남는다 (조문·적용범위 근거)", () => {
    renderStep2();
    expect(acqModeGroup().getAttribute("data-layout")).toBe("stack");
    expect(screen.getByText(/주권상장법인 주식등 제외/)).toBeTruthy();
    expect(screen.getByText(/장부가 분실·멸실된 경우/)).toBeTruthy();
  });
});
