import { describe, it, expect } from "vitest";
import {
  isKrxTradingDay,
  isWeekend,
  nonTradingLabel,
  buildOneMonthBeforeSlots,
} from "@/lib/kiwoom/calendar";

describe("KRX calendar — anchor", () => {
  // K-CAL-01: 어린이날 2024-05-05
  it("K-CAL-01: 2024-05-05 어린이날 — 거래일 아님", () => {
    expect(isKrxTradingDay("2024-05-05")).toBe(false);
  });

  // K-CAL-02: 토요일
  it("K-CAL-02: 2024-05-04 토요일 — 거래일 아님 + 토요일 라벨", () => {
    expect(isKrxTradingDay("2024-05-04")).toBe(false);
    expect(isWeekend("2024-05-04")).toBe(true);
    expect(nonTradingLabel("2024-05-04")).toContain("토요일");
  });

  // K-CAL-03: 2020-12-31 임시휴장 (m5 — fixture 2020 범위 확인)
  it("K-CAL-03: 2020-12-31 임시휴장 — 거래일 아님 (m5: fixture 2020 범위 시작)", () => {
    expect(isKrxTradingDay("2020-12-31")).toBe(false);
    expect(nonTradingLabel("2020-12-31")).toContain("휴장일");
  });

  // K-LEAP-01: 윤년 2024-03-01 슬롯 수 29일
  it("K-LEAP-01: 2024-03-01 양도일 → 1개월 슬롯 29일 (2024-02-01 ~ 2024-02-29 윤년)", () => {
    const slots = buildOneMonthBeforeSlots("2024-03-01");
    expect(slots[0]).toBe("2024-02-01");
    expect(slots[slots.length - 1]).toBe("2024-02-29");
    expect(slots.length).toBe(29);
  });

  // 일반 케이스: 2024-06-03 → 2024-05-03 ~ 2024-06-02 (31일)
  it("일반: 2024-06-03 → 2024-05-03 ~ 2024-06-02 (31일)", () => {
    const slots = buildOneMonthBeforeSlots("2024-06-03");
    expect(slots[0]).toBe("2024-05-03");
    expect(slots[slots.length - 1]).toBe("2024-06-02");
    expect(slots.length).toBe(31);
  });
});
