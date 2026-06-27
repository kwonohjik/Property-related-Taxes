/**
 * 신탁수익권(§61)·정기금받을권리(§62) 평가 anchor.
 * KoreanLaw 상증령 §61①·§62 본문 검증(2026-06-27). §61①1호=신탁재산가액(수익권 PV 미가산).
 */
import { describe, it, expect } from "vitest";
import { evaluateTrustBenefit, evaluatePeriodicPayment } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function trust(over: Partial<EstateItem>): EstateItem {
  return {
    id: "t1",
    category: "trust_benefit",
    name: "신탁수익권",
    trustAssets: [{ kind: "simple", value: 800_000_000 }],
    ...over,
  } as EstateItem;
}

describe("신탁수익권 §61", () => {
  it("TBV-1 동일수익자(1호) = 신탁재산 가액 (수익권 PV 미가산)", () => {
    const r = evaluateTrustBenefit(trust({ trustBeneficiaryType: "same", trustRemainingYears: 3 }));
    expect(r.valuatedAmount).toBe(800_000_000);
  });

  it("TBV-2 수익권(2호나) 현가합 n=0,1,2 = 197,183,628", () => {
    const r = evaluateTrustBenefit(
      trust({
        trustBeneficiaryType: "diff_income",
        trustYieldRateNumer: 10,
        trustYieldRateDenom: 100,
        trustWithholdingRateNumer: 154,
        trustWithholdingRateDenom: 1000,
        trustRemainingYears: 3,
      }),
    );
    // 세후연수익 67,680,000 → 67,680,000 + 65,708,737 + 63,794,891
    expect(r.valuatedAmount).toBe(197_183_628);
  });

  it("TBV-3 원본권(2호가) = 신탁재산 − 수익권 = 602,816,372", () => {
    const r = evaluateTrustBenefit(
      trust({
        trustBeneficiaryType: "diff_principal",
        trustYieldRateNumer: 10,
        trustYieldRateDenom: 100,
        trustWithholdingRateNumer: 154,
        trustWithholdingRateDenom: 1000,
        trustRemainingYears: 3,
      }),
    );
    expect(r.valuatedAmount).toBe(602_816_372);
  });

  it("TBV-4 해지일시금 > 평가액 → 일시금 (§61① 단서)", () => {
    const r = evaluateTrustBenefit(trust({ trustBeneficiaryType: "same", trustSurrenderValue: 900_000_000 }));
    expect(r.valuatedAmount).toBe(900_000_000);
  });

  it("TBV-5 수익률 미확정 → 신탁재산 × 3% (칙§19의2②)", () => {
    const r = evaluateTrustBenefit(trust({ trustBeneficiaryType: "diff_income", trustRemainingYears: 1 }));
    // 800,000,000 × 30/1000 = 24,000,000, n=0 → 24,000,000
    expect(r.valuatedAmount).toBe(24_000_000);
  });
});

describe("정기금받을권리 §62", () => {
  function periodic(over: Partial<EstateItem>): EstateItem {
    return { id: "p1", category: "periodic_payment", name: "정기금", periodicAnnualAmount: 10_000_000, ...over } as EstateItem;
  }

  it("PP-1 유기 현가합 < 20배 (ordinary n=1..5)", () => {
    const r = evaluatePeriodicPayment(periodic({ periodicAnnuityType: "finite", periodicRemainingYears: 5 }));
    // floor-per-term Σ n=1..5 (BigInt 실측 동결). 계수표 45,797,100은 반올림 근사
    expect(r.valuatedAmount).toBe(45_797_069);
  });

  it("PP-2 유기 20배 cap (현가합 > 1년분×20)", () => {
    const r = evaluatePeriodicPayment(periodic({ periodicAnnuityType: "finite", periodicRemainingYears: 50 }));
    expect(r.valuatedAmount).toBe(200_000_000); // 10,000,000 × 20
  });

  it("PP-3 무기 = 1년분 × 20", () => {
    const r = evaluatePeriodicPayment(periodic({ periodicAnnuityType: "perpetual" }));
    expect(r.valuatedAmount).toBe(200_000_000);
  });

  it("PP-4 종신 50년 — 20배 cap 미적용 (§62 3호 '제1호 계산식'만 준용)", () => {
    const r = evaluatePeriodicPayment(periodic({ periodicAnnuityType: "lifetime", periodicRemainingYears: 50 }));
    // 종신은 1호 단서(20배) 미준용 → Σ n=1..50 현가합 > 200,000,000 (유기였다면 cap으로 200M)
    expect(r.valuatedAmount).toBeGreaterThan(200_000_000);
  });

  it("PP-5 일시금 > 본칙 → 일시금 (§62 본문 단서)", () => {
    const r = evaluatePeriodicPayment(
      periodic({ periodicAnnuityType: "finite", periodicRemainingYears: 5, periodicSurrenderValue: 50_000_000 }),
    );
    expect(r.valuatedAmount).toBe(50_000_000);
  });
});
