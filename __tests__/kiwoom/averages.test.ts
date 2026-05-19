import { describe, it, expect } from "vitest";
import { oneMonthBeforeTransferAvg } from "@/lib/kiwoom/averages";

describe("oneMonthBeforeTransferAvg — anchor", () => {
  // K-AVG-01: 일정 종가 80,000 거래일 → 평균 80,000
  // 새 알고리즘 [5/4 ~ 6/3] 양도일 포함. 5/4(토)·5/5(일)·5/6(어린이날대체)·5/11(토)·5/12(일)·5/15(부처님)·5/18(토)·5/19(일)·5/25(토)·5/26(일)·6/1(토)·6/2(일) 제외
  it("K-AVG-01: 일정 종가 80,000 거래일 → 평균 80,000", () => {
    const quotes = [
      "2024-05-07", "2024-05-08", "2024-05-09", "2024-05-10",
      "2024-05-13", "2024-05-14", "2024-05-16", "2024-05-17",
      "2024-05-20", "2024-05-21", "2024-05-22", "2024-05-23", "2024-05-24",
      "2024-05-27", "2024-05-28", "2024-05-29", "2024-05-30", "2024-05-31",
      "2024-06-03",
    ].map((date) => ({ date, close: 80000 }));

    const result = oneMonthBeforeTransferAvg({
      quotes,
      transferDateIso: "2024-06-03",
    });

    expect(result.tradingDays).toBe(19);
    expect(result.average).toBe(80000);
    expect(result.sum).toBe(80000 * 19);
  });

  // K-AVG-02: 휴일·토일 슬롯 → null 채움
  it("K-AVG-02: 휴일·주말 슬롯 → null + label", () => {
    const result = oneMonthBeforeTransferAvg({
      quotes: [{ date: "2024-05-07", close: 70000 }],
      transferDateIso: "2024-06-03",
    });

    // 2024-05-11 토요일 (새 알고리즘 슬롯 [5/4 ~ 6/3] 내)
    const satIdx = result.slotDates.indexOf("2024-05-11");
    expect(satIdx).toBeGreaterThan(-1);
    expect(result.closingPrices[satIdx]).toBeNull();
    expect(result.weekendLabels[satIdx]).toContain("토요일");

    // 2024-05-05 일요일·어린이날
    const childrensDayIdx = result.slotDates.indexOf("2024-05-05");
    expect(childrensDayIdx).toBeGreaterThan(-1);
    expect(result.closingPrices[childrensDayIdx]).toBeNull();
  });

  // K-AVG-03: floor 적용 — 평균이 정수가 아니면 내림
  it("K-AVG-03: floor — 평균 = floor(sum / 거래일)", () => {
    const result = oneMonthBeforeTransferAvg({
      quotes: [
        { date: "2024-05-07", close: 100 },
        { date: "2024-05-08", close: 101 },
        { date: "2024-05-09", close: 100 },
      ],
      transferDateIso: "2024-06-03",
    });
    // 3거래일 (slot [5/4~6/3] 안), 합 301 → floor(301/3) = 100
    expect(result.tradingDays).toBe(3);
    expect(result.average).toBe(100);
  });

  // K-AVG-04: 빈 quotes → 평균 0 (분모 부족 — 자동 보정 금지)
  it("K-AVG-04: 빈 quotes → tradingDays=0, average=0 (자동 보정 금지)", () => {
    const result = oneMonthBeforeTransferAvg({
      quotes: [],
      transferDateIso: "2024-06-03",
    });
    expect(result.tradingDays).toBe(0);
    expect(result.average).toBe(0);
  });
});
