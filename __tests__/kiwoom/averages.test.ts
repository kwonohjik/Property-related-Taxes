import { describe, it, expect } from "vitest";
import { oneMonthBeforeTransferAvg } from "@/lib/kiwoom/averages";

describe("oneMonthBeforeTransferAvg — anchor", () => {
  // K-AVG-01: KOSPI 정상 — 거래일 22일 × 종가 80,000 = 평균 80,000
  it("K-AVG-01: 일정 종가 80,000 22거래일 → 평균 80,000", () => {
    // 2024-06-03 양도 → [2024-05-03 ~ 2024-06-02] 거래일 22일 (어린이날 5/6, 부처님오신날 5/15 휴장, 토일 8일)
    const quotes = [
      "2024-05-03",
      "2024-05-07",
      "2024-05-08",
      "2024-05-09",
      "2024-05-10",
      "2024-05-13",
      "2024-05-14",
      "2024-05-16",
      "2024-05-17",
      "2024-05-20",
      "2024-05-21",
      "2024-05-22",
      "2024-05-23",
      "2024-05-24",
      "2024-05-27",
      "2024-05-28",
      "2024-05-29",
      "2024-05-30",
      "2024-05-31",
    ].map((date) => ({ date, close: 80000 }));

    const result = oneMonthBeforeTransferAvg({
      quotes,
      transferDateIso: "2024-06-03",
    });

    expect(result.tradingDays).toBe(19); // 위 19일 종가 매핑
    expect(result.average).toBe(80000);
    expect(result.sum).toBe(80000 * 19);
  });

  // K-AVG-02: 휴일·토일 슬롯 → null 채움
  it("K-AVG-02: 휴일·주말 슬롯 → null + label", () => {
    const result = oneMonthBeforeTransferAvg({
      quotes: [{ date: "2024-05-07", close: 70000 }],
      transferDateIso: "2024-06-03",
    });

    // 2024-05-04 토요일
    const satIdx = result.slotDates.indexOf("2024-05-04");
    expect(satIdx).toBeGreaterThan(-1);
    expect(result.closingPrices[satIdx]).toBeNull();
    expect(result.weekendLabels[satIdx]).toContain("토요일");

    // 2024-05-05 어린이날 (일요일과 겹침)
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
    // 3거래일, 합 301 → floor(301/3) = 100
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
