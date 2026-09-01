import { describe, it, expect } from "vitest";
import {
  isKrxTradingDay,
  isWeekend,
  nonTradingLabel,
  buildOneMonthBeforeSlots,
  buildOneMonthAfterListingSlots,
  buildTwoMonthSurroundingSlots,
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

  // K-LEAP-01: 윤년 슬롯 — 양도일 포함
  // 법률 용어 "양도일 이전 1개월" = 양도일 포함 (사용자 검증)
  //
  // 2026-08-27 정정: 종전 기대값은 2024-03-01(**삼일절**)을 anchor로 그대로 두어
  // [2024-02-02 ~ 2024-03-01] 29일이었다. 그러나 상증법 §63①1가목 괄호는
  // 「평가기준일이 **공휴일 등** 매매가 없는 날인 경우에는 **그 전일**을 기준으로 한다」이고
  // 상증령 §52의2④가 그 「매매가 없는 날」을 공휴일·대체공휴일·토요일로 정한다.
  // 소득세법 §99①3이 이 가목을 준용하므로 삼일절 양도는 **직전 거래일 2024-02-29**가 기준이다.
  // (같은 조문에서 나온 상증세 평가용 resolveValuationAnchor는 이미 그렇게 동작하고 있었다.)
  it("K-LEAP-01: 2024-03-01(삼일절) 양도일 → anchor 2024-02-29 → [2024-01-29 ~ 2024-02-29] 32일", () => {
    const slots = buildOneMonthBeforeSlots("2024-03-01");
    expect(slots[0]).toBe("2024-01-29");
    expect(slots[slots.length - 1]).toBe("2024-02-29");
    expect(slots.length).toBe(32);
  });

  // K-LEAP-02: 윤년 2월 자체가 anchor인 경우 — 시프트 없이 양도일 포함
  it("K-LEAP-02: 2024-02-29(목·거래일) → [2024-01-29 ~ 2024-02-29] 32일", () => {
    const slots = buildOneMonthBeforeSlots("2024-02-29");
    expect(slots[0]).toBe("2024-01-29");
    expect(slots[slots.length - 1]).toBe("2024-02-29");
    expect(slots.length).toBe(32);
  });

  // 일반 케이스: 2024-06-03 (월) → [2024-05-04 ~ 2024-06-03] 31일
  it("일반: 2024-06-03 → [2024-05-03 ~ 2024-06-03] 32일", () => {
    const slots = buildOneMonthBeforeSlots("2024-06-03");
    expect(slots[0]).toBe("2024-05-03");
    expect(slots[slots.length - 1]).toBe("2024-06-03");
    expect(slots.length).toBe(32);
  });

  // anchor 시프트: 2025-06-21 (토) → anchor=6/20 (금) → [2025-05-21 ~ 2025-06-20] 31일
  it("anchor 시프트: 2025-06-21 (토) 양도일 → anchor 6/20 (금) → [2025-05-20 ~ 2025-06-20] 32일", () => {
    const slots = buildOneMonthBeforeSlots("2025-06-21");
    expect(slots[0]).toBe("2025-05-20");
    expect(slots[slots.length - 1]).toBe("2025-06-20");
    expect(slots.length).toBe(32);
  });

  // F-02 §165⑤ 상장일 이후 1개월 슬롯 anchor
  it("F-02 §165⑤ 상장일 이후 1개월 — 2009-08-21 → [2009-08-21 ~ 2009-09-21] 32일 (사례 48 PDF)", () => {
    const slots = buildOneMonthAfterListingSlots("2009-08-21");
    expect(slots[0]).toBe("2009-08-21");
    expect(slots[slots.length - 1]).toBe("2009-09-21");
    expect(slots.length).toBe(32);
  });

  it("F-02 §165⑤ 평년 2월 — 2009-02-01 → [2009-02-01 ~ 2009-03-01] 29일", () => {
    const slots = buildOneMonthAfterListingSlots("2009-02-01");
    expect(slots[0]).toBe("2009-02-01");
    expect(slots[slots.length - 1]).toBe("2009-03-01");
    expect(slots.length).toBe(29);
  });

  it("F-02 §165⑤ 윤년 2월 — 2024-02-01 → [2024-02-01 ~ 2024-03-01] 30일", () => {
    const slots = buildOneMonthAfterListingSlots("2024-02-01");
    expect(slots[0]).toBe("2024-02-01");
    expect(slots[slots.length - 1]).toBe("2024-03-01");
    expect(slots.length).toBe(30);
  });

  // F-01 §63①1가목 전후 2개월 슬롯
  it("F-01 §63①1가목 전후 2개월 — 2024-06-15 → [2024-04-15 ~ 2024-08-15]", () => {
    const slots = buildTwoMonthSurroundingSlots("2024-06-15");
    expect(slots[0]).toBe("2024-04-15");
    expect(slots[slots.length - 1]).toBe("2024-08-15");
    // 4월(30) + 5월(31) + 6월(30) + 7월(31) + 8월(15) = 123일
    expect(slots.length).toBe(123);
  });

  it("F-01 윤년 경계 — 2024-02-29 → [2023-12-29 ~ 2024-04-29]", () => {
    const slots = buildTwoMonthSurroundingSlots("2024-02-29");
    expect(slots[0]).toBe("2023-12-29");
    expect(slots[slots.length - 1]).toBe("2024-04-29");
  });
});
