import { describe, it, expect } from "vitest";
import { evaluateConvertibleBond } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 전환사채 등의 평가 — 상증법 §63①2호 / 상증령 §58의2 (적정할인율 상증칙 §18의3, 배당차액 §57③).
 * 교재 3사례(전환사채·신주인수권증권·신주인수권부사채) + 신주인수권증서 자체산식.
 * PV(R)=발행가액(R은 min 판정용), PV(r)=receivablePV round-half-up. 배당차액 floor.
 * 설계: docs/02-design/features/inheritance-gift-cb-valuation.engine.design.md
 */

const base = (p: Partial<EstateItem>): EstateItem => ({
  id: "cb-1",
  name: "테스트 전환사채등",
  category: "convertible_bond",
  ...p,
});

describe("전환사채 등의 평가 (§58의2)", () => {
  // ── 사례 A: 전환사채 (비거래소, 무할증, R=3% r=8%) ──────────────
  it("[cb-A1] 전환사채 전환금지(Ⅰ 2009.11.1) = 512,493,150", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "convertible_bond",
        cbTradedOnExchange: false,
        cbConvertible: false,
        cbPrincipal: 500_000_000,
        cbCouponRate: 3,
        cbMaturityYears: 3,
        cbHasRedemptionPremium: false,
        cbInterestBaseDate: new Date("2009-01-01"), // 발행일=직전 이자기산
        cbValuationDate: new Date("2009-11-01"),
      }),
    );
    expect(Math.abs(r.valuatedAmount - 512_493_150)).toBeLessThanOrEqual(3);
  });

  it("[cb-A2] 전환사채 전환가능(Ⅱ 2010.4.1) = 1,993,835,617", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "convertible_bond",
        cbTradedOnExchange: false,
        cbConvertible: true,
        cbPrincipal: 500_000_000,
        cbCouponRate: 3,
        cbMaturityYears: 3,
        cbHasRedemptionPremium: false,
        cbInterestBaseDate: new Date("2009-12-31"), // 직전 이자지급일
        cbConvertibleShareValue: 2_000_000_000, // @20,000 × 100,000주
        cbFaceValuePerShare: 5_000,
        cbPriorDividendRate: 5,
        cbShareCount: 100_000,
        cbDividendBaseDate: new Date("2010-04-01"), // 배당기산일 (사업연도개시 2010-01-01부터 90일)
        cbValuationDate: new Date("2010-04-01"),
      }),
    );
    expect(Math.abs(r.valuatedAmount - 1_993_835_617)).toBeLessThanOrEqual(3);
  });

  // ── 사례 B: 신주인수권증권 (비거래소, 상환할증조건, R=유효5% r=8%) ──
  it("[cb-B1] 신주인수권증권 전환금지(Ⅰ 2021.7.5) = 79,211,758", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "warrant_certificate",
        cbTradedOnExchange: false,
        cbConvertible: false,
        cbPrincipal: 1_000_000_000,
        cbCouponRate: 2,
        cbHasRedemptionPremium: true,
        cbRedemptionPremium: 95_000_000,
        cbIssueRate: 5, // 유효이자율
        cbMaturityYears: 3,
        cbValuationDate: new Date("2021-07-05"),
      }),
    );
    expect(Math.abs(r.valuatedAmount - 79_211_758)).toBeLessThanOrEqual(3);
  });

  it("[cb-B2] 신주인수권증권 전환가능(Ⅱ 2023.1.4) = 400,000,000", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "warrant_certificate",
        cbTradedOnExchange: false,
        cbConvertible: true,
        cbPrincipal: 1_000_000_000,
        cbCouponRate: 2,
        cbHasRedemptionPremium: true,
        cbRedemptionPremium: 95_000_000,
        cbIssueRate: 5,
        cbMaturityYears: 3,
        cbConvertibleShareValue: 1_200_000_000, // @12,000 × 100,000주
        cbSubscriptionPrice: 800_000_000, // @8,000 × 100,000주
        // 직전기 배당 없음 → 배당차액 0
        cbValuationDate: new Date("2023-01-04"),
      }),
    );
    expect(r.valuatedAmount).toBe(400_000_000);
  });

  // ── 사례 C: 신주인수권부사채 (전환가능, 무할증, R=3% r=8%) ─────────
  it("[cb-C] 신주인수권부사채 전환가능 = 1,278,624,603 (±2,000 천원절사)", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "bond_with_warrant",
        cbTradedOnExchange: false,
        cbConvertible: true,
        cbPrincipal: 1_000_000_000,
        cbCouponRate: 3,
        cbMaturityYears: 3,
        cbHasRedemptionPremium: false,
        // 교재 발생이자 91일 근사(2016 윤년 date-fns는 92일) — 직접 산정값 override
        cbAccruedInterestOverride: 7_479_452, // 10억×3%×91/365
        cbConvertibleShareValue: 1_200_000_000,
        cbSubscriptionPrice: 800_000_000,
        cbValuationDate: new Date("2016-04-01"),
      }),
    );
    expect(Math.abs(r.valuatedAmount - 1_278_624_603)).toBeLessThanOrEqual(2_000);
  });

  // ── 사례 D: 신주인수권증서 라목 (자체산식) ─────────────────────────
  it("[cb-D] 신주인수권증서 비거래소 = 400,000,000", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "preemptive_right",
        cbTradedOnExchange: false,
        cbConvertible: true,
        cbExRightsPriorPrice: 1_200_000_000,
        cbSubscriptionPrice: 800_000_000,
        cbValuationDate: new Date("2023-01-04"),
      }),
    );
    expect(r.valuatedAmount).toBe(400_000_000);
  });

  it("[cb-D2] 신주인수권증서 상장단서 = 100,000,000", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "preemptive_right",
        cbTradedOnExchange: false,
        cbConvertible: true,
        cbExRightsPriorPrice: 1_200_000_000,
        cbExRightsPostPrice: 900_000_000, // 권리락후 < 권리락전−배당차액 → 단서 발동
        cbSubscriptionPrice: 800_000_000,
        cbValuationDate: new Date("2023-01-04"),
      }),
    );
    expect(r.valuatedAmount).toBe(100_000_000);
  });

  // ── A: 거래소 거래 ────────────────────────────────────────────────
  it("[cb-exch] 거래소 거래·실적有 = Max(2개월평균, 최근시세)", () => {
    const r = evaluateConvertibleBond(
      base({
        cbSecurityType: "convertible_bond",
        cbTradedOnExchange: true,
        cbHasTradeRecord: true,
        cbExchange2mAvg: 510_000_000,
        cbExchangeLatestPrice: 512_000_000,
        cbValuationDate: new Date("2023-01-04"),
      }),
    );
    expect(r.valuatedAmount).toBe(512_000_000);
  });
});
