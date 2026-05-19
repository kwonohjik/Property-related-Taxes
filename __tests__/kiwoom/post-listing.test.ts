import { describe, it, expect } from "vitest";
import { oneMonthAfterListingAvg } from "@/lib/kiwoom/averages";

describe("oneMonthAfterListingAvg — F-02 §165⑤ 상장일 이후 1개월", () => {
  // K-POST-01: 상장일 + 22거래일 일정 종가
  it("K-POST-01: 상장일 2024-08-01 + 22거래일 일정 종가 80,000 → 평균 80,000", () => {
    // [2024-08-01, ..., 2024-08-31] 31일 중 토일·휴장일(8/15 광복절) 제외 → 거래일 22일
    const quotes = [
      "2024-08-01", "2024-08-02", "2024-08-05", "2024-08-06", "2024-08-07",
      "2024-08-08", "2024-08-09", "2024-08-12", "2024-08-13", "2024-08-14",
      "2024-08-16", "2024-08-19", "2024-08-20", "2024-08-21", "2024-08-22",
      "2024-08-23", "2024-08-26", "2024-08-27", "2024-08-28", "2024-08-29",
      "2024-08-30",
    ].map((date) => ({ date, close: 80000 }));

    const result = oneMonthAfterListingAvg({
      quotes,
      listingDateIso: "2024-08-01",
    });

    expect(result.tradingDays).toBe(21);
    expect(result.average).toBe(80000);
  });

  // K-POST-02: 광복절 자동 제외
  it("K-POST-02: 2024-08-15 광복절 → null + 휴장일 라벨", () => {
    const result = oneMonthAfterListingAvg({
      quotes: [{ date: "2024-08-01", close: 70000 }],
      listingDateIso: "2024-08-01",
    });
    const idx = result.slotDates.indexOf("2024-08-15");
    expect(idx).toBeGreaterThan(-1);
    expect(result.closingPrices[idx]).toBeNull();
    expect(result.weekendLabels[idx]).toContain("휴장일");
  });

  // K-POST-03: floor 적용
  it("K-POST-03: floor — 3거래일 합 151 → floor(151/3) = 50", () => {
    const result = oneMonthAfterListingAvg({
      quotes: [
        { date: "2024-08-01", close: 50 },
        { date: "2024-08-02", close: 51 },
        { date: "2024-08-05", close: 50 },
      ],
      listingDateIso: "2024-08-01",
    });
    expect(result.tradingDays).toBe(3);
    expect(result.average).toBe(50);
  });
});
