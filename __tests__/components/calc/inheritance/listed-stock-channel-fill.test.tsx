/**
 * 통합 anchor — 키움 자동조회 응답 → ListedStockEditor.onUpdate 에 listedStockDailyGroupsInput 전달.
 *
 * 버그 fix 검증: stale closure 덮어쓰기 회피 후 마지막 onUpdate 호출에 4그룹 데이터가 보존되는지.
 * Plan: docs/00-pm/listed-stock-besshi-page2-empty-bug-fix.plan.md §3-2
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { applyKiwoomValuationResponse } from "@/lib/calc/listed-stock-besshi";
import { KiwoomValuationAutoFetchButton } from "@/components/calc/KiwoomValuationAutoFetchButton";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { buildTwoMonthSurroundingSlots } from "@/lib/kiwoom/calendar";

const VALUATION = "2022-07-06";

beforeEach(() => {
  const slotDates = buildTwoMonthSurroundingSlots(VALUATION);
  const closingPrices = slotDates.map((d) => (d === VALUATION ? 8452 : null));
  const weekendLabels = slotDates.map(() => "");
  vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      average: 8452,
      tradingDays: 2, // D 양쪽 카운트
      sum: 16904,
      stockName: "테스트사",
      slotDates,
      closingPrices,
      weekendLabels,
    }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/**
 * ListedStockEditor onResponse 흐름 재현 — 자동조회 응답 → applyKiwoomValuationResponse → set
 * (실제 ListedStockEditor 컴포넌트는 마법사 컨텍스트 의존이 커서, onResponse 콜백 로직을
 *  본 anchor에서 동등하게 재현하여 검증)
 */
function TestHarness({ onUpdate }: { onUpdate: (patch: Partial<EstateItem>) => void }) {
  return (
    <KiwoomValuationAutoFetchButton
      stockCode="005930"
      valuationDate={VALUATION}
      syncName
      onResponse={(response) => {
        const adapter = applyKiwoomValuationResponse(response, {});
        onUpdate({
          listedStockAvgPrice: adapter.listedStockAvgPrice,
          listedStockDailyGroupsInput: adapter.listedStockDailyGroupsInput,
          ...(adapter.companyName ? { companyName: adapter.companyName } : {}),
        });
      }}
    />
  );
}

describe("listed-stock channel-fill (page2 empty bug fix)", () => {
  it("onUpdate 호출 1회 + listedStockDailyGroupsInput.beforeM1.length === 31", async () => {
    const onUpdate = vi.fn();
    const { getByRole } = render(<TestHarness onUpdate={onUpdate} />);

    fireEvent.click(getByRole("button", { name: /키움 자동조회/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    const lastPatch = onUpdate.mock.calls[0][0] as Partial<EstateItem>;
    expect(lastPatch.listedStockAvgPrice).toBe(8452);
    expect(lastPatch.listedStockDailyGroupsInput).toBeDefined();
    expect(lastPatch.listedStockDailyGroupsInput?.beforeM1).toHaveLength(31);
    expect(lastPatch.listedStockDailyGroupsInput?.afterM1).toHaveLength(31);
    expect(lastPatch.companyName).toBe("테스트사");
  });

  it("D 양쪽 카운트 — closingAverage = 8452, tradingDays = 2", async () => {
    const onUpdate = vi.fn();
    const { getByRole } = render(<TestHarness onUpdate={onUpdate} />);
    fireEvent.click(getByRole("button", { name: /키움 자동조회/ }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    const groups = (onUpdate.mock.calls[0][0] as Partial<EstateItem>).listedStockDailyGroupsInput!;
    expect(groups.closingAverage).toBe(8452);
    expect(groups.tradingDays).toBe(2); // D in beforeM1 + D in afterM1
    expect(groups.closingSum).toBe(16904);
  });
});
