/**
 * 신탁이익의 증여 (§33) anchor — Pre-Do
 * 법령: KoreanLaw §33·령§25·§61·칙§19의2 본문(2026-06-19). 계산사례: 교재 §2장 p.557(이미지 6).
 * 설계: docs/02-design/features/gift-trust-benefit.engine.design.md
 */
import { describe, it, expect } from "vitest";
import { calcTrustBenefit } from "@/lib/tax-engine/gift-deemed/trust-benefit";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import type { TrustBenefitInput } from "@/lib/tax-engine/gift-deemed/types";

// 계산사례: 원본 8억·수익률 10%·원천징수 15.4%·3년·동일수익자 (UI %→분수 변환과 동일 표현)
const base: TrustBenefitInput = {
  beneficiaryType: "same",
  trustPropertyValue: 800_000_000,
  yieldRate: { numer: 1000, denom: 10000 }, // 10%
  withholdingRate: { numer: 1540, denom: 10000 }, // 15.4%
  installments: 3,
};

describe("신탁이익의 증여 §33 — 계산사례 anchor", () => {
  it("[TB-C] 동일수익자·3년 → 증여재산가액 997,183,628", () => {
    const r = calcTrustBenefit(base);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(997_183_628);
    // 세후 연수익 = 8억 × 10% × (1−0.154) = 67,680,000
    expect(r.thresholdEcho?.afterTaxIncome).toBe(67_680_000);
    // 수익권 현가합 197,183,628
    expect(r.thresholdEcho?.incomeRight).toBe(197_183_628);
  });

  it("[TB-2] 회차별 현재가치 floor (67,680,000 / 65,708,737 / 63,794,891)", () => {
    const r = calcTrustBenefit(base);
    const amounts = r.breakdown
      .filter((b) => b.label.includes("회차 현재가치"))
      .map((b) => b.amount);
    expect(amounts).toEqual([67_680_000, 65_708_737, 63_794_891]);
  });

  it("[TB-router] router 경유 동일 결과", () => {
    expect(calcDeemedGift({ type: "trust_benefit", ...base }).deemedGiftValue).toBe(997_183_628);
  });

  it("[TB-income] 수익만 수령(diff_income) → 수익권 197,183,628만", () => {
    const r = calcTrustBenefit({ ...base, beneficiaryType: "diff_income" });
    expect(r.deemedGiftValue).toBe(197_183_628);
  });

  it("[TB-3] 원본만 수령(diff_principal) → 신탁재산 − 수익권 = 602,816,372", () => {
    const r = calcTrustBenefit({ ...base, beneficiaryType: "diff_principal" });
    expect(r.deemedGiftValue).toBe(800_000_000 - 197_183_628);
  });

  it("[TB-4] 해지일시금 > 평가액 → 일시금 (§61① 단서)", () => {
    const r = calcTrustBenefit({ ...base, surrenderValue: 1_000_000_000 });
    expect(r.deemedGiftValue).toBe(1_000_000_000);
    expect(r.thresholdEcho?.surrenderApplied).toBe(true);
  });

  it("[TB-4b] 해지일시금 < 평가액 → 평가액 유지", () => {
    const r = calcTrustBenefit({ ...base, surrenderValue: 500_000_000 });
    expect(r.deemedGiftValue).toBe(997_183_628);
    expect(r.thresholdEcho?.surrenderApplied).toBe(false);
  });

  it("[TB-5] 수익률 미확정 → 원본 × 3% (칙§19의2②), 세후 20,304,000", () => {
    const r = calcTrustBenefit({ ...base, yieldRate: undefined });
    // 8억 × 3% = 24,000,000 − 원천징수 15.4%(3,696,000) = 20,304,000
    expect(r.thresholdEcho?.afterTaxIncome).toBe(20_304_000);
    expect(r.applied).toBe(true);
  });

  it("[TB-floor] installments 큰 경우 BigInt 정밀도 (n=20 무오류)", () => {
    const r = calcTrustBenefit({ ...base, installments: 20 });
    // 20개 항 모두 양수·단조감소 (Number 거듭제곱이면 n≥8서 정밀도 깨짐)
    const pvs = r.breakdown.filter((b) => b.label.includes("회차 현재가치")).map((b) => b.amount);
    expect(pvs).toHaveLength(20);
    for (let i = 1; i < pvs.length; i++) expect(pvs[i]).toBeLessThan(pvs[i - 1]);
    expect(pvs[19]).toBeGreaterThan(0);
  });
});
