/**
 * PL-NI — 순손익 계산서 산식 (H-02) + PL-WEIGHT 가중평균 (H-04).
 *
 * 사례 EXAMPLE_POST_LISTING:
 *   상장연도: (A 7,832,120,458 − B 113,574,915) / 1,253,600 / 0.10 = 61,570
 *   취득연도: (A 5,638,712,600 − B 56,840,000) / 1,253,600 / 0.10 = 44,520
 *   가중평균: 상장 39,083 / 취득 28,451 (3:2)
 */

import { describe, it, expect } from "vitest";
import {
  calcNetIncomePerShare,
  calcUnlistedPerShareWeighted,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import {
  listingYearNIExample,
  acqYearNIExample,
} from "./helpers/post-listing-input-builder";

describe("PL-NI — 순손익 1주당 가치 (H-02)", () => {
  it("PL-NI-1 — 상장연도 1주당 순손익가치 = 61,570", () => {
    const result = calcNetIncomePerShare(listingYearNIExample());
    expect(result.netIncomeAmount).toBe(7_718_545_543);
    expect(result.perShareIncome).toBe(6_157);
    expect(result.perShareValue).toBe(61_570);
  });

  it("PL-NI-2 — 취득연도 1주당 순손익가치 = 44,520", () => {
    const result = calcNetIncomePerShare(acqYearNIExample());
    expect(result.netIncomeAmount).toBe(5_581_872_600);
    expect(result.perShareIncome).toBe(4_452);
    expect(result.perShareValue).toBe(44_520);
  });

  it("PL-NI-3 — discountRate default = 0.10 (시행규칙 §81② → 상증령 §17)", () => {
    const result = calcNetIncomePerShare({
      addA: [1_000_000],
      subB: [],
      shareCount: 100,
      discountRate: 0,   // 0 이하 시 default 0.10
    });
    expect(result.perShareValue).toBe(100_000);
  });

  it("PL-NI-4 — shareCount 0 시 방어 (perShareValue = 0)", () => {
    const result = calcNetIncomePerShare({
      addA: [1_000_000],
      subB: [],
      shareCount: 0,
      discountRate: 0.10,
    });
    expect(result.perShareValue).toBe(0);
  });

  it("PL-NI-5 — 음수 순손익 케이스 (적자 회사) — perShareValue 그대로", () => {
    const result = calcNetIncomePerShare({
      addA: [500_000],
      subB: [1_000_000],
      shareCount: 100,
      discountRate: 0.10,
    });
    // (500,000 − 1,000,000) / 100 / 0.10 = -50,000
    // Math.floor(-5,000 / 0.10) = -50,000
    expect(result.netIncomeAmount).toBe(-500_000);
    expect(result.perShareValue).toBeLessThan(0);
  });
});

describe("PL-WEIGHT — 1주당 가중평균 (H-04)", () => {
  it("PL-WEIGHT-1 — 상장연도 가중평균 39,083 (PDF 직접 입력값 5,352)", () => {
    // PDF input 그대로 사용 시: 61,570×3/5 + 5,352×2/5 = 36,942 + 2,140.8 = 39,082.8 → floor 39,082
    // 단, case-48 anchor와 동일하려면 5,352 직접 입력 — H-04 결과는 39,082
    expect(calcUnlistedPerShareWeighted(61_570, 5_352)).toBe(39_082);
  });

  it("PL-WEIGHT-1b — 상장연도 가중평균 39,082 (H-03 자동 계산값 5,351)", () => {
    // H-03 floor 산식 결과 5,351 사용 시: 36,942 + 2,140.4 = 39,082.4 → floor 39,082
    expect(calcUnlistedPerShareWeighted(61_570, 5_351)).toBe(39_082);
  });

  it("PL-WEIGHT-2 — 취득연도 가중평균 28,451 (3:2 일반)", () => {
    expect(calcUnlistedPerShareWeighted(44_520, 4_348)).toBe(28_451);
  });

  it("PL-WEIGHT-3 — 부동산과다 (2:3 반전)", () => {
    // 일반: 100×3/5 + 50×2/5 = 60+20 = 80
    // 반전: 100×2/5 + 50×3/5 = 40+30 = 70
    expect(calcUnlistedPerShareWeighted(100, 50, false)).toBe(80);
    expect(calcUnlistedPerShareWeighted(100, 50, true)).toBe(70);
  });

  it("PL-WEIGHT-4 — 1주당 원 단위 절사 (소수점 절사)", () => {
    // 100×3/5 + 51×2/5 = 60 + 20.4 = 80.4 → 80
    expect(calcUnlistedPerShareWeighted(100, 51)).toBe(80);
  });
});
