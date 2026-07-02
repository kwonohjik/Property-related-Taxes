import { describe, it, expect } from "vitest";
import { evaluateConvertibleBond } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 전환사채 발생이자·배당차액 — 소수 이자율/배당률 정밀도 (리뷰 확정 #2 회귀).
 *
 * floorMulDiv가 모든 part를 BigInt(Math.round(p))로 정수화하는데, 소수 백분율 rate를
 * part로 넘겨 율 자체가 반올림(2.5%→3%, 0.4%→0%)되던 버그.
 * 발생이자 = floor(원금 × 율% × 일수 / (100×365)), 배당차액 = floor(액면 × 율% × 주식수 × 일수 / (100×365)).
 */
const base = (p: Partial<EstateItem>): EstateItem => ({
  id: "cb-1",
  name: "테스트 전환사채등",
  category: "convertible_bond",
  ...p,
});

describe("전환사채 소수 이자율/배당률 정밀도 (리뷰 #2)", () => {
  // 발생이자: 전환금지 전환사채, 무할증, 적정할인율(2009)≥쿠폰 → 평가액 = 발행가액 + 발생이자
  it("[cb-dec-accrued] 쿠폰 2.5%·500M·304일 발생이자 = 10,410,958 (버그 시 12,493,150)", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "convertible_bond",
        cbTradedOnExchange: false,
        cbConvertible: false,
        cbPrincipal: 500_000_000,
        cbCouponRate: 2.5, // 소수 쿠폰
        cbMaturityYears: 3,
        cbHasRedemptionPremium: false,
        cbInterestBaseDate: new Date("2009-01-01"),
        cbValuationDate: new Date("2009-11-01"), // 304일
      }),
    );
    // floor(500,000,000 × 2.5 × 304 / (100×365)) = 10,410,958
    expect(r.valuatedAmount).toBe(510_410_958);
  });

  // 배당차액: 전환가능 전환사채 = Max(1호나, 전환주식가액 − 배당차액)
  it("[cb-dec-dividend] 배당률 2.5%·액면 5000·10만주·90일 배당차액 = 3,082,191 (버그 시 3,698,630)", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "convertible_bond",
        cbTradedOnExchange: false,
        cbConvertible: true,
        cbPrincipal: 500_000_000,
        cbCouponRate: 3,
        cbMaturityYears: 3,
        cbHasRedemptionPremium: false,
        cbInterestBaseDate: new Date("2009-12-31"),
        cbConvertibleShareValue: 2_000_000_000,
        cbFaceValuePerShare: 5_000,
        cbPriorDividendRate: 2.5, // 소수 배당률
        cbShareCount: 100_000,
        cbDividendBaseDate: new Date("2010-04-01"), // 사업연도개시~90일
        cbValuationDate: new Date("2010-04-01"),
      }),
    );
    // floor(5000 × 2.5 × 100000 × 90 / (100×365)) = 3,082,191
    // 평가액 = 2,000,000,000 − 3,082,191 = 1,996,917,809
    expect(r.valuatedAmount).toBe(1_996_917_809);
  });
});
