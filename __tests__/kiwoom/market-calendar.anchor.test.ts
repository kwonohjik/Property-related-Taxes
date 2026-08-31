/**
 * Phase 1 — 참조 종목 거래일로 anchor를 확정한다 (B′안)
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 1)
 *
 * 근거: 소득세법 §99①3 → 상증법 §63①1가목 괄호(「평가기준일이 매매가 없는 날이면 그 전일」)
 *      + 상증령 §52의2③(거래정지 종목은 본 평가 미적용) · §52의2④(공휴일·대체공휴일·토요일)
 *
 * 🔑 핵심은 **「종가가 없다」를 두 사유로 가르는 것**이다.
 *    휴장이면 옮기고, 그 종목의 정지면 옮기지 않는다. 섞으면 정지 구간을 건너뛴 평균이 나온다.
 */

import { describe, it, expect } from "vitest";
import {
  needsMarketCalendar,
  buildMarketDaySet,
  resolveAnchorFromMarketDays,
  isStockSpecificGap,
  MARKET_ANCHOR_MAX_LOOKBACK_DAYS,
  MARKET_REFERENCE_STOCK_CODE,
} from "@/lib/kiwoom/market-calendar";

/** 2015-02 실측 거래일 (설 연휴 2/18~2/20 휴장) */
const FEB_2015 = new Set([
  "2015-02-11",
  "2015-02-12",
  "2015-02-13",
  "2015-02-16",
  "2015-02-17",
  "2015-02-23",
]);

describe("MC — 참조 달력 게이트", () => {
  it("MC-1: fixture 범위(2020~2026) 안에서는 참조 달력이 필요 없다", () => {
    expect(needsMarketCalendar("2020-01-01")).toBe(false);
    expect(needsMarketCalendar("2025-06-10")).toBe(false);
    expect(needsMarketCalendar("2026-12-31")).toBe(false);
  });

  it("MC-2: 범위 밖에서는 필요하다 (취득일은 대개 여기다)", () => {
    expect(needsMarketCalendar("2019-12-31")).toBe(true);
    expect(needsMarketCalendar("2015-02-19")).toBe(true);
    expect(needsMarketCalendar("2005-04-20")).toBe(true);
    expect(needsMarketCalendar("2027-01-01")).toBe(true);
  });

  it("MC-3: 참조 종목은 삼성전자다 (1975 상장 — 실무 취득일 범위를 덮는다)", () => {
    expect(MARKET_REFERENCE_STOCK_CODE).toBe("005930");
  });
});

describe("MD — 시장 거래일 집합", () => {
  it("MD-1: 종가 > 0 인 날만 거래일로 센다", () => {
    const s = buildMarketDaySet([
      { date: "2015-02-17", close: 1_372_000 },
      { date: "2015-02-18", close: 0 },
      { date: "2015-02-16", close: 1_371_500 },
    ]);
    expect(s.has("2015-02-17")).toBe(true);
    expect(s.has("2015-02-16")).toBe(true);
    expect(s.has("2015-02-18")).toBe(false);
  });
});

describe("MA — anchor 확정", () => {
  it("MA-1: 기준일이 시장 거래일이면 옮기지 않는다", () => {
    const r = resolveAnchorFromMarketDays("2015-02-17", FEB_2015);
    expect(r).toEqual({ anchor: "2015-02-17", shifted: false, exhausted: false });
  });

  /**
   * ⭐ 이 트랙의 핵심 케이스. 2015-02-19는 설날(목)이라 KRX가 열지 않았는데,
   *    휴장일 fixture가 2015를 몰라 `calendar.ts`는 그대로 anchor로 삼는다.
   */
  it("MA-2: 설날(2015-02-19)은 직전 시장 거래일 2015-02-17로 옮긴다", () => {
    const r = resolveAnchorFromMarketDays("2015-02-19", FEB_2015);
    expect(r.anchor).toBe("2015-02-17");
    expect(r.shifted).toBe(true);
    expect(r.exhausted).toBe(false);
  });

  it("MA-3: 주말도 같은 규칙으로 옮긴다 — 2015-02-21(토) → 2015-02-17", () => {
    // 2/18~2/20 설 연휴 + 2/21 토 ⇒ 직전 거래일은 2/17
    const r = resolveAnchorFromMarketDays("2015-02-21", FEB_2015);
    expect(r.anchor).toBe("2015-02-17");
    expect(r.shifted).toBe(true);
  });

  /**
   * 🔴 **참조 종목을 못 받으면 옮기지 않는다.** 추정으로 창을 움직이면
   *    사용자가 검증할 수 없는 평균이 만들어진다([[feedback_no_silent_apportion_fallback]]).
   */
  it("MA-4: 시장 거래일 집합이 비면 옮기지 않고 exhausted로 알린다", () => {
    const r = resolveAnchorFromMarketDays("2015-02-19", new Set());
    expect(r.anchor).toBe("2015-02-19");
    expect(r.shifted).toBe(false);
    expect(r.exhausted).toBe(true);
  });

  it("MA-5: 되짚기 한도를 넘으면 옮기지 않는다 (휴장이 아니라 이상 신호로 본다)", () => {
    const far = new Set(["2015-01-01"]);
    const r = resolveAnchorFromMarketDays("2015-02-19", far);
    expect(r.shifted).toBe(false);
    expect(r.exhausted).toBe(true);
    expect(MARKET_ANCHOR_MAX_LOOKBACK_DAYS).toBe(10);
  });

  it("MA-6: 한도 경계 — 정확히 10일 전이면 옮긴다", () => {
    const r = resolveAnchorFromMarketDays("2015-02-19", new Set(["2015-02-09"]));
    expect(r.anchor).toBe("2015-02-09");
    expect(r.shifted).toBe(true);
  });

  it("MA-7: 한도 밖 — 11일 전은 옮기지 않는다 (MA-6의 음성 대조군)", () => {
    const r = resolveAnchorFromMarketDays("2015-02-19", new Set(["2015-02-08"]));
    expect(r.shifted).toBe(false);
    expect(r.exhausted).toBe(true);
  });

  it("MA-8: 월·연 경계를 넘어 되짚는다 — 2015-01-01 → 2014-12-30", () => {
    const r = resolveAnchorFromMarketDays("2015-01-01", new Set(["2014-12-30"]));
    expect(r.anchor).toBe("2014-12-30");
    expect(r.shifted).toBe(true);
  });
});

describe("SG — 휴장 vs 그 종목의 정지", () => {
  /**
   * ⭐⭐ 이 구분이 B안을 B′안으로 바꾼 이유다(V-3).
   *    시장은 열렸는데 «그 종목»만 종가가 없으면 거래정지·미상장이고,
   *    그때 anchor를 옮기면 상증령 §52의2③이 배제한 구간을 조용히 건너뛰게 된다.
   */
  it("SG-1: 시장은 열렸는데 종목 종가가 없으면 종목 사유다", () => {
    const stock = new Set(["2015-02-16"]);
    expect(isStockSpecificGap("2015-02-17", FEB_2015, stock)).toBe(true);
  });

  it("SG-2: 시장이 안 열린 날은 종목 사유가 아니다 (휴장)", () => {
    const stock = new Set(["2015-02-16", "2015-02-17"]);
    expect(isStockSpecificGap("2015-02-19", FEB_2015, stock)).toBe(false);
  });

  it("SG-3: 둘 다 있으면 사유 없음", () => {
    const stock = new Set(["2015-02-17"]);
    expect(isStockSpecificGap("2015-02-17", FEB_2015, stock)).toBe(false);
  });
});
