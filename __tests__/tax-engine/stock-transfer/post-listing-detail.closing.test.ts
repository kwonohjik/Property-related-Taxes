/**
 * PL-CLOSE — 종가 1개월 평균 (H-01).
 * 사례 EXAMPLE_POST_LISTING — 상장일 이후 1개월 (2009-08-21~2009-09-21).
 * Phase A KoreanLaw 결론: "상장일 이후 1개월" (소령 §165⑤ 본문 — 상장일 이전은 비상장).
 */

import { describe, it, expect } from "vitest";
import { calcMonthlyClosingAverage } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { listingClosingExample } from "./helpers/post-listing-input-builder";

describe("PL-CLOSE — 종가 1개월 평균 (H-01)", () => {
  it("PL-CLOSE-1 — EXAMPLE_POST_LISTING 21 거래일 평균 = 8,001", () => {
    const { dates, closes } = listingClosingExample();
    const result = calcMonthlyClosingAverage(dates, closes);
    expect(result.tradingDays).toBe(21);
    expect(result.sum).toBe(168_040);
    expect(result.avg).toBe(8_001);
  });

  it("PL-CLOSE-2 — 빈 셀(휴일·주말) 자동 제외", () => {
    const dates = ["2009-08-21", "2009-08-22", "2009-08-23", "2009-08-24"];
    const closes = [7_750, 0, 0, 7_790];   // 0 = 거래 없음
    const result = calcMonthlyClosingAverage(dates, closes);
    expect(result.tradingDays).toBe(2);
    expect(result.sum).toBe(15_540);
    expect(result.avg).toBe(7_770);
  });

  it("PL-CLOSE-3 — 1주당 원 단위 미만 절사", () => {
    const result = calcMonthlyClosingAverage(["a", "b", "c"], [10_001, 10_002, 10_004]);
    // sum = 30,007 / 3 = 10,002.33... → floor = 10,002
    expect(result.avg).toBe(10_002);
  });

  it("PL-CLOSE-4 — 거래일 0건 시 avg = 0 (방어)", () => {
    const result = calcMonthlyClosingAverage([], []);
    expect(result.tradingDays).toBe(0);
    expect(result.avg).toBe(0);
  });

  it("PL-CLOSE-5 — 음수 종가는 거래일 미포함", () => {
    const result = calcMonthlyClosingAverage(["a", "b"], [-100, 5_000]);
    expect(result.tradingDays).toBe(1);
    expect(result.sum).toBe(5_000);
    expect(result.avg).toBe(5_000);
  });
});
