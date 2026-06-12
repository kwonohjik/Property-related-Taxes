/**
 * B-5 §165⑤ 종가평균 증자·합병 기간 조정 (상증령 §52의2②2호 — 기간 절단)
 *
 * §99①3 → 상증법 §63①1가목 준용 → 상증령 §52의2②: 상장 종가평균은 평가기간 내 증자·합병
 *   발생 시 사유 발생일 기준 한쪽 구간만 평균(환산주식수 아닌 기간 절단).
 *   §165⑤ forward 윈도우(상장일 이후 1개월) → 2호: 상장일 ~ 발생일 전일 종가만.
 *
 * ★ §165⑤ proxy 적용은 해석(명문·예규 미확인 — 사용자 결정 2026-06-13).
 */

import { describe, it, expect } from "vitest";
import {
  calcMonthlyClosingAverage,
  calcClosingAvgWithEvent,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";

const DATES = ["2009-08-21", "2009-08-24", "2009-08-25", "2009-08-26"];
const CLOSES = [10_000, 10_000, 20_000, 20_000];

// ============================================================
// Pre-Do BASELINE — 현행 calcMonthlyClosingAverage (절단 없음)
// ============================================================
describe("B5 Pre-Do BASELINE — 현행 전체 평균 (절단 미적용)", () => {
  it("B5-BASELINE: 전체 종가 단순 평균 = 15,000 (절단 개념 부재)", () => {
    const r = calcMonthlyClosingAverage(DATES, CLOSES);
    // (10,000 + 10,000 + 20,000 + 20,000) / 4 = 15,000
    expect(r.avg).toBe(15_000);
    expect(r.tradingDays).toBe(4);
  });
});

// ============================================================
// B5-ENGINE — calcClosingAvgWithEvent (§52의2②2호 절단)
// ============================================================
describe("B5 §52의2②2호 기간 절단 — calcClosingAvgWithEvent", () => {
  it("B5-ENGINE-1 (C-1): hasIncrease false → 전체 평균 (회귀 0)", () => {
    const r = calcClosingAvgWithEvent({
      dates: DATES,
      closes: CLOSES,
      basisDate: "2009-08-21",
      hasIncrease: false,
    });
    expect(r.avg).toBe(15_000);
    expect(r.truncation).toBeUndefined();
  });

  it("B5-ENGINE-2 (C-2): 발생일 윈도우 내 → 발생일 전일까지만 평균", () => {
    const r = calcClosingAvgWithEvent({
      dates: DATES,
      closes: CLOSES,
      basisDate: "2009-08-21",
      hasIncrease: true,
      increaseDate: "2009-08-25", // 이 날짜·이후 제외 → 08-21·08-24만
    });
    // (10,000 + 10,000) / 2 = 10,000
    expect(r.avg).toBe(10_000);
    expect(r.truncation).toBeDefined();
    expect(r.truncation!.eventDate).toBe("2009-08-25");
    expect(r.truncation!.includedDays).toBe(2);
    expect(r.truncation!.excludedDays).toBe(2);
  });

  it("B5-ENGINE-3 (C-3): 발생일 윈도우 밖(이후 종가 없음) → 전체 평균 + warning", () => {
    const r = calcClosingAvgWithEvent({
      dates: DATES,
      closes: CLOSES,
      basisDate: "2009-08-21",
      hasIncrease: true,
      increaseDate: "2009-09-30", // 모든 종가가 발생일 이전 → 제외 0
    });
    expect(r.avg).toBe(15_000); // 절단 무효 = 전체 평균
    expect(r.truncation).toBeUndefined();
    expect(r.warning).toBeTruthy();
  });

  it("B5-ENGINE-4 (C-5): 절단 후 거래일 0 → 전체 평균 + warning", () => {
    const r = calcClosingAvgWithEvent({
      dates: DATES,
      closes: CLOSES,
      basisDate: "2009-08-21",
      hasIncrease: true,
      increaseDate: "2009-08-21", // 모든 종가 >= 발생일 → 절단 후 0건
    });
    expect(r.avg).toBe(15_000); // 절단 미적용 (전체 평균)
    expect(r.truncation).toBeUndefined();
    expect(r.warning).toBeTruthy();
  });

  it("B5-HELPER-1: 발생일 당일 제외·전일 포함 경계", () => {
    // 발생일 08-26 → 08-21·08-24·08-25 포함(3건), 08-26 제외
    const r = calcClosingAvgWithEvent({
      dates: DATES,
      closes: CLOSES,
      basisDate: "2009-08-21",
      hasIncrease: true,
      increaseDate: "2009-08-26",
    });
    // (10,000 + 10,000 + 20,000) / 3 = 13,333
    expect(r.avg).toBe(13_333);
    expect(r.truncation!.includedDays).toBe(3);
    expect(r.truncation!.excludedDays).toBe(1);
  });

  it("B5-REGRESS-1: 빈 셀(주말) 혼재 — 거래일만 평균 + 절단", () => {
    const dates = ["2009-08-21", "", "2009-08-25", "2009-08-26"];
    const closes = [10_000, 0, 20_000, 20_000];
    const r = calcClosingAvgWithEvent({
      dates,
      closes,
      basisDate: "2009-08-21",
      hasIncrease: true,
      increaseDate: "2009-08-25",
    });
    // 08-21만 발생일 이전 거래일 → 10,000
    expect(r.avg).toBe(10_000);
    expect(r.truncation!.includedDays).toBe(1);
  });
});
