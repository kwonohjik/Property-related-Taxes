/**
 * adapter SSOT anchor — applyKiwoomValuationResponse 가 response.average(오답)를 무시하고
 * splitTwoMonthSurroundingByMonthGroup 의 closingAverage(정답)를 listedStockAvgPrice 로
 * 채널-fill 하는지 검증.
 *
 * Plan: docs/00-pm/listed-stock-besshi-avg-dual-truth-fix.plan.md §2-1·B-1
 *
 * 산식 차이 입증 fixture:
 *   D=2024-06-03(월) 거래일, D−1=2024-05-31(금) 거래일, D+1=2024-06-04(화) 거래일.
 *   다른 모든 slot 은 비거래일/null.
 *   D 종가=100, D−1=200, D+1=300.
 *
 *   - twoMonthSurroundingAvg (D 1회, response.average): (100+200+300)/3 = 200
 *   - splitTwoMonthSurroundingByMonthGroup (D 2회, groups.closingAverage):
 *       좌 = D + D−1 = 100+200 = 300
 *       우 = D + D+1 = 100+300 = 400
 *       합 = 700, 분모 = 4, 평균 = 175
 *
 * 본 PR 후 adapter 출력의 listedStockAvgPrice 는 175 (groups.closingAverage), 200 아님.
 */

import { describe, it, expect } from "vitest";
import { applyKiwoomValuationResponse } from "@/lib/calc/listed-stock-besshi";
import type { KiwoomValuation2MonthResponse } from "@/lib/calc/listed-stock-besshi";

describe("listed-stock-besshi adapter SSOT (avg-dual-truth)", () => {
  it("response.average(오답 200) 입력 → listedStockAvgPrice = groups.closingAverage(정답 175)", () => {
    // anchor 시프트 없는 평일 D — 2024-06-03 (월)
    const valuationDate = "2024-06-03";

    // splitTwoMonthSurroundingByMonthGroup 가 사용하는 slot 도메인은 D±61일 (offset 기반).
    // adapter 는 splitTwoMonthSurroundingByMonthGroup(slotDates, closingPrices, weekendLabels, anchor)
    // 에서 anchor 기반 NO 매핑으로 D 양쪽 카운트를 수행하므로 slotDates 는 D±2개월 범위면 충분.
    // 본 anchor 는 D−1·D·D+1 만 거래일로 채우고 나머지는 null/비거래일 처리.
    const slotDates: string[] = [];
    const closingPrices: (number | null)[] = [];
    const weekendLabels: string[] = [];
    for (let offset = -65; offset <= 65; offset++) {
      const dt = new Date(Date.UTC(2024, 5, 3));
      dt.setUTCDate(dt.getUTCDate() + offset);
      const iso = dt.toISOString().slice(0, 10);
      slotDates.push(iso);
      if (iso === "2024-05-31") {
        closingPrices.push(200);
        weekendLabels.push("");
      } else if (iso === "2024-06-03") {
        closingPrices.push(100);
        weekendLabels.push("");
      } else if (iso === "2024-06-04") {
        closingPrices.push(300);
        weekendLabels.push("");
      } else {
        closingPrices.push(null);
        weekendLabels.push("비거래일");
      }
    }

    const response: KiwoomValuation2MonthResponse = {
      stockCode: "TEST01",
      stockName: "테스트종목",
      valuationDate,
      slotDates,
      closingPrices,
      weekendLabels,
      tradingDays: 3, // D 1회 산식의 분모
      sum: 600,
      average: 200, // ★ 오답 (D 1회) — adapter 가 이 값을 무시해야 함
    };

    const adapter = applyKiwoomValuationResponse(response);

    // 정답 = splitTwoMonthSurroundingByMonthGroup 의 closingAverage
    expect(adapter.listedStockDailyGroupsInput.closingAverage).toBe(175);
    expect(adapter.listedStockDailyGroupsInput.tradingDays).toBe(4); // D 양쪽 2회 + D−1 + D+1
    expect(adapter.listedStockDailyGroupsInput.closingSum).toBe(700);

    // ★ 핵심: listedStockAvgPrice 는 response.average(200) 가 아닌 groups.closingAverage(175)
    expect(adapter.listedStockAvgPrice).toBe(175);
  });
});
