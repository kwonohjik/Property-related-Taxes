/**
 * @vitest-environment jsdom
 *
 * Step2 「② 취득가액」 모드 라디오 — **3개를 한 행에** 두고 **description 을 붙이지 않는다**.
 *
 * 이력:
 *   2026-09-02 제보 — 선택지 4개가 세로로 쌓여 4행을 먹었다 ⇒ `columns={2}`(2열 2행).
 *   2026-09-12 제보 — 옵션 하단 힌트를 지우고 한 행에 ⇒ description 제거 + `columns={3}`.
 *     선택지도 3개가 됐다(「액면가 (장부분실)」 제거 — 법 §99①4 후단은 영 §165④ 보충평가
 *     «안에서» 분자를 대체하는 단서라 환산취득가 하위 토글 `acqFaceValueOnly` 로 일원화).
 *
 * ⚠️ description 제거는 판단 근거를 지우는 것이 **아니다** — 모드를 고르면 그 모드 전용
 *    블록이 바로 아래 펼쳐지고 조문·산식이 거기 다시 나온다. 같은 조문을 두 번 읽히면서
 *    세로만 먹던 것을 없앴다.
 *
 * 🔑 **`RadioCardGroup`을 직접 렌더해서는 안 된다.** 그러면 Step2에서 `columns={3}`을
 *    떼어내도 앵커가 초록으로 남는다 — 관측 단계가 어긋난다.
 *    ⇒ Step2를 통째로 렌더해 «실제 화면이 한 행인가»를 본다.
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

describe("AM — 취득가액 모드 라디오는 3개가 한 행이고 힌트가 없다", () => {
  it("AM-1 sm↑에서 3열 그리드다 (모바일은 1열, 세로 쌓기 아님)", () => {
    renderStep2();
    const cls = acqModeGroup().className;
    expect(cls).toContain("sm:grid-cols-3");
    expect(cls).toContain("grid-cols-1");
    expect(cls).not.toContain("space-y-2"); // 세로 쌓기(columns 미지정) 회귀 차단
    // ⚠️ 「grid 이고 sm 분기가 있다」만 보면 columns 2·4도 통과한다 —
    //    columns 2 = `sm:grid-cols-2`, columns 4 = `sm:grid-cols-2 lg:grid-cols-4`.
    //    3열(=3개가 한 행)만 통과시키려면 두 이웃의 부재까지 봐야 한다.
    expect(cls).not.toContain("sm:grid-cols-2");
    expect(cls).not.toContain("lg:grid-cols-4");
  });

  it("AM-2 선택지는 3개다 — 「액면가」는 토글로 일원화돼 여기 없다", () => {
    renderStep2();
    const values = Array.from(
      acqModeGroup().querySelectorAll<HTMLInputElement>('input[name="acquisitionMode"]')
    ).map((i) => i.value);
    expect(values).toEqual(["actual", "estimated", "sale_case"]);
  });

  it("AM-3 stack 레이아웃이되 description 은 없다 (옵션 하단 힌트 제거)", () => {
    renderStep2();
    // layout 은 stack 그대로다 — inline 으로 바꾸면 카드 모양이 칩으로 변한다
    expect(acqModeGroup().getAttribute("data-layout")).toBe("stack");
    // 종전 description 문구가 되살아나지 않았다
    expect(screen.queryByText(/주권상장법인 주식등 제외/)).toBeNull();
    expect(screen.queryByText(/실제 취득가액 \(1주당\)/)).toBeNull();
    expect(screen.queryByText(/장부가 분실·멸실된 경우/)).toBeNull();
    // 라벨은 남는다 — description 만 지운 것이지 옵션을 지운 게 아니다
    expect(screen.getByText("매매사례가액")).toBeTruthy();
  });
});
