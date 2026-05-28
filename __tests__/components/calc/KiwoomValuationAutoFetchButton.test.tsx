/**
 * KiwoomValuationAutoFetchButton — onResponse·onFill 분기 anchor.
 *
 * 버그 fix 검증: onResponse 제공 시 onFill 호출 skip (stale closure 덮어쓰기 방지).
 * Plan: docs/00-pm/listed-stock-besshi-page2-empty-bug-fix.plan.md §3-1
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { KiwoomValuationAutoFetchButton } from "@/components/calc/KiwoomValuationAutoFetchButton";

const MOCK_RESPONSE = {
  average: 8452,
  tradingDays: 84,
  sum: 710030,
  stockName: "테스트사",
  slotDates: ["2022-07-06"],
  closingPrices: [8452],
  weekendLabels: [""],
};

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => MOCK_RESPONSE,
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("KiwoomValuationAutoFetchButton — onResponse·onFill 분기", () => {
  it("T-1: onResponse 만 전달 → onResponse 호출, onFill 호출 안 됨", async () => {
    const onResponse = vi.fn();
    const { getByRole } = render(
      <KiwoomValuationAutoFetchButton
        stockCode="005930"
        valuationDate="2022-07-06"
        onResponse={onResponse}
      />,
    );
    fireEvent.click(getByRole("button", { name: /키움 자동조회/ }));
    await waitFor(() => expect(onResponse).toHaveBeenCalledTimes(1));
    expect(onResponse.mock.calls[0][0]).toMatchObject({
      stockCode: "005930",
      valuationDate: "2022-07-06",
      slotDates: ["2022-07-06"],
      closingPrices: [8452],
      average: 8452,
    });
  });

  it("T-2: onFill 만 전달 → onFill 호출 (기존 동작 회귀 가드)", async () => {
    const onFill = vi.fn();
    const { getByRole } = render(
      <KiwoomValuationAutoFetchButton
        stockCode="005930"
        valuationDate="2022-07-06"
        onFill={onFill}
      />,
    );
    fireEvent.click(getByRole("button", { name: /키움 자동조회/ }));
    await waitFor(() => expect(onFill).toHaveBeenCalledTimes(1));
    expect(onFill.mock.calls[0][0]).toMatchObject({
      listedStockAvgPrice: 8452,
    });
  });

  it("T-3: onResponse + onFill 동시 전달 → onResponse 만 호출, onFill 0건 (stale closure 방지)", async () => {
    const onResponse = vi.fn();
    const onFill = vi.fn();
    const { getByRole } = render(
      <KiwoomValuationAutoFetchButton
        stockCode="005930"
        valuationDate="2022-07-06"
        onResponse={onResponse}
        onFill={onFill}
      />,
    );
    fireEvent.click(getByRole("button", { name: /키움 자동조회/ }));
    await waitFor(() => expect(onResponse).toHaveBeenCalledTimes(1));
    expect(onFill).not.toHaveBeenCalled();
  });
});
