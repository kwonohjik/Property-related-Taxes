/**
 * @vitest-environment jsdom
 *
 * B-2 — 「양도일 이전 1개월 종가평균」 저장값이 낡아 화면 두 줄이 서로 다른 값을 보인다.
 *
 * 제보(2026-09-01, 이미지 13): 같은 화면에 두 줄이 나란히 뜨는데 값이 갈렸다.
 *   amber : 거래일 16일 · 종가합계 264,970 · 1개월 종가평균 16,560   ← 매 렌더 실시간 재계산
 *   green : 자동 산정 평균 = 16,559 원                                ← 저장 필드 (stale)
 *
 * 저장 필드 `transferDatePriceAvg1Month`가 **셀 편집·키움 자동조회 때만** 쓰이는 반면
 * 표의 미리보기는 `displayDates`(= 양도일 파생) × `transferPriceClosing`으로 **매 렌더
 * 재계산**된다. 그래서 셀 편집 없이 `displayDates`만 바뀌면 저장값이 낡는다.
 *
 * 🔴 표시만의 문제가 아니다 — **저장값이 곧 §99①3 환산 분모로 엔진에 간다.**
 *
 * 종전 리셋은 `transferStdInputMode === "daily"` 일 때로 **한정**돼 있었다(Step1).
 * direct 모드에서 양도일을 바꾼 뒤 daily로 전환하면 배열이 낡은 채 살아남는다.
 *
 * Plan: docs/00-pm/one-month-window-boundary-and-avg-tip.plan.md B-2
 */

import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Step1 } from "@/app/calc/stock-transfer-tax/steps/Step1";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function Harness({
  initial,
  onPatch,
}: {
  initial: Partial<StockTransferFormData>;
  onPatch: (p: Partial<StockTransferFormData>) => void;
}) {
  const [form, setForm] = React.useState<StockTransferFormData>({
    ...createInitialStockFormData(),
    marketType: "kospi",
    ...initial,
  } as StockTransferFormData);
  return (
    <Step1
      form={form}
      onChange={(patch) => {
        onPatch(patch);
        setForm((prev) => ({ ...prev, ...patch }));
      }}
    />
  );
}

function fillTransferDate(y: string, m: string, d: string) {
  const label = screen.getByText("양도일");
  const card = label.closest("[data-slot='field-card']") as HTMLElement;
  const scope = within(card);
  fireEvent.change(scope.getByLabelText("연도"), { target: { value: y } });
  fireEvent.change(scope.getByLabelText("월"), { target: { value: m } });
  fireEvent.change(scope.getByLabelText("일"), { target: { value: d } });
}

/** 키움 자동조회가 채워 둔 상태를 흉내낸다 — 일자 배열·종가 배열·평균이 함께 저장돼 있다. */
const FETCHED: Partial<StockTransferFormData> = {
  transferDate: "2026-02-26",
  transferPriceDates: ["2026-01-26", "2026-01-27", "2026-01-28"],
  transferPriceClosing: ["16000", "16320", "16020"],
  transferDatePriceAvg1Month: "16113",
};

describe("SM — 양도일이 바뀌면 1개월 종가표 잔재와 저장 평균이 «모드와 무관하게» 리셋된다", () => {
  it("SM-1 (회귀 가드) daily 모드에서 양도일 변경 → 3필드 모두 초기화", () => {
    const onPatch = vi.fn();
    render(
      <Harness initial={{ ...FETCHED, transferStdInputMode: "daily" }} onPatch={onPatch} />,
    );
    fillTransferDate("2026", "03", "31");

    const patch = onPatch.mock.calls.map((c) => c[0]).find((p) => p.transferDate === "2026-03-31");
    expect(patch).toBeTruthy();
    expect(patch.transferPriceDates).toEqual([]);
    expect(patch.transferPriceClosing).toEqual([]);
    expect(patch.transferDatePriceAvg1Month).toBe("");
  });

  it("SM-2 🔴 direct 모드에서 양도일 변경 → 3필드가 «그대로 살아남으면» 저장 평균이 낡는다", () => {
    const onPatch = vi.fn();
    render(
      <Harness initial={{ ...FETCHED, transferStdInputMode: "direct" }} onPatch={onPatch} />,
    );
    fillTransferDate("2026", "03", "31");

    const patch = onPatch.mock.calls.map((c) => c[0]).find((p) => p.transferDate === "2026-03-31");
    expect(patch).toBeTruthy();
    // 종전 결함: 이 세 줄이 undefined였다 (리셋이 daily 모드로 한정돼 있었다)
    expect(patch.transferPriceDates).toEqual([]);
    expect(patch.transferPriceClosing).toEqual([]);
    expect(patch.transferDatePriceAvg1Month).toBe("");
  });

  it("SM-3 양도일이 «같은 값»으로 재입력되면 잔재를 지우지 않는다 (불필요한 데이터 손실 방지)", () => {
    const onPatch = vi.fn();
    render(
      <Harness initial={{ ...FETCHED, transferStdInputMode: "daily" }} onPatch={onPatch} />,
    );
    fillTransferDate("2026", "02", "26"); // 동일 일자

    const patches = onPatch.mock.calls.map((c) => c[0]);
    const clearing = patches.find((p) => p.transferPriceClosing?.length === 0);
    expect(clearing).toBeUndefined();
  });
});
