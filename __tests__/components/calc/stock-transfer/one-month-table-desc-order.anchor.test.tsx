/**
 * @vitest-environment jsdom
 *
 * ORD — 「양도일 이전 1개월 종가」 표는 **기준일(양도일)을 왼쪽 맨 위**에 둔다.
 *
 * 제보(2026-09-10): 기준일이 마지막 칸(오른쪽 맨 아래)에 있어 자동조회 결과를 볼 때
 * 정작 기준이 되는 날짜를 가장 늦게 찾게 된다. ⇒ 표시를 최신 → 과거 역순으로 뒤집었다.
 *
 * 🔑 **표시만 뒤집는다** — `displayDates[idx]` ↔ `transferPriceClosing[idx]` 매핑은
 *    오름차순 그대로여야 한다(키움 자동조회·엔진 전달 배열이 그 순서에 묶여 있다).
 *    ORD-2가 그 매핑을 못박는다 — 표시 순서만 바꾸려다 배열 인덱스까지 뒤집으면
 *    자동조회가 채운 종가가 **엉뚱한 날짜 칸에 붙는다**.
 */

import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { TransferDate1MonthClosingPriceTable } from "@/components/calc/stock-transfer/TransferDate1MonthClosingPriceTable";
import { buildOneMonthBeforeSlots } from "@/lib/kiwoom/calendar";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const TRANSFER_DATE = "2026-02-26";
const DATES = buildOneMonthBeforeSlots(TRANSFER_DATE);

function renderTable(closing: string[] = []) {
  return render(
    <TransferDate1MonthClosingPriceTable
      form={{
        ...createInitialStockFormData(),
        transferDate: TRANSFER_DATE,
        transferPriceClosing: closing,
      }}
      onChange={vi.fn()}
    />,
  );
}

describe("ORD — 1개월 종가 표는 기준일부터 내림차순으로 보인다", () => {
  it("ORD-1 첫 슬롯이 기준일(양도일), 마지막 슬롯이 기간 시작일이다", () => {
    const { container } = renderTable();
    const slots = Array.from(container.querySelectorAll("[data-slot-idx]"));
    expect(slots.length).toBe(DATES.length);

    // 화면 번호는 «표시 위치»를 따른다 — 1번이 기준일
    expect(slots[0].textContent).toContain(`1. ${TRANSFER_DATE}`);
    expect(slots[slots.length - 1].textContent).toContain(`${DATES.length}. ${DATES[0]}`);

    // 날짜가 실제로 최신 → 과거 순으로 나열된다
    const shown = slots.map((el) => el.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "");
    expect(shown).toEqual([...DATES].reverse());
  });

  it("ORD-2 🔴 데이터 인덱스는 오름차순 그대로다 — 기준일 칸이 배열 «마지막» 값을 보인다", () => {
    const closing = DATES.map((_, i) => String(10000 + i));
    const { container } = renderTable(closing);
    const slots = Array.from(container.querySelectorAll("[data-slot-idx]"));

    // 첫 슬롯(= 기준일)의 데이터 인덱스는 last, 마지막 슬롯은 0
    expect(slots[0].getAttribute("data-slot-idx")).toBe(String(DATES.length - 1));
    expect(slots[slots.length - 1].getAttribute("data-slot-idx")).toBe("0");

    // 그 인덱스의 종가가 그 칸에 실제로 들어 있다 (거래일 칸에만 input이 있다)
    const firstInput = slots[0].querySelector("input");
    expect(firstInput).not.toBeNull();
    expect(firstInput!.value.replace(/,/g, "")).toBe(closing[DATES.length - 1]);
  });

  it("ORD-3 Enter는 «화면 아래» 칸으로 간다 — 역순 표시에서 방향이 반대로 튀지 않는다", () => {
    const { container } = renderTable();
    const slots = Array.from(container.querySelectorAll("[data-slot-idx]"));
    const firstInput = slots[0].querySelector("input")!;
    firstInput.focus();
    fireEvent.keyDown(firstInput, { key: "Enter" });

    const focusedSlot = (document.activeElement as HTMLElement).closest("[data-slot-idx]");
    // 화면상 바로 아래 = 표시 순서의 다음 = 데이터 인덱스가 하나 작은 거래일
    expect(focusedSlot).toBe(slots[1]);
  });
});
