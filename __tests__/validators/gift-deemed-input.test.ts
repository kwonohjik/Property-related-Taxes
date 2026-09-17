import { describe, it, expect } from "vitest";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";

describe("deemedGiftInputSchema", () => {
  it("valid insurance 통과", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "insurance", caseType: "non_payer",
      insuranceProceeds: 100_000_000, totalPremiumPaid: 10_000_000,
      relevantPremium: 6_000_000, isInheritanceInsurance: false,
    });
    expect(r.success).toBe(true);
  });

  it("관련보험료 > 총보험료 → 차단 (§34①)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "insurance", caseType: "non_payer",
      insuranceProceeds: 100_000_000, totalPremiumPaid: 5_000_000,
      relevantPremium: 6_000_000, isInheritanceInsurance: false,
    });
    expect(r.success).toBe(false);
  });

  it("free_use인데 부동산가액 없음 → 차단 (§37①)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "free_realestate", subType: "free_use", isRelatedParty: true,
    });
    expect(r.success).toBe(false);
  });

  it("collateral 차입금 입력 시 통과", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "free_realestate", subType: "collateral",
      loanAmount: 500_000_000, actualInterestPaid: 0, isRelatedParty: true,
    });
    expect(r.success).toBe(true);
  });

  it("valid free_loan(분수 이자율) 통과", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "free_loan", loanAmount: 300_000_000, actualInterestPaid: 0,
      appropriateRate: { numer: 46, denom: 1000 }, isRelatedParty: true,
    });
    expect(r.success).toBe(true);
  });

  it("알 수 없는 type → 차단", () => {
    const r = deemedGiftInputSchema.safeParse({ type: "unknown_kind", foo: 1 });
    expect(r.success).toBe(false);
  });

  it("시가 0 → 차단 (bargain_transfer)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "bargain_transfer", transactionPrice: 0, marketValue: 0,
      isRelatedParty: true, transactionType: "purchase",
    });
    expect(r.success).toBe(false);
  });

  // ── ⑫ 비율·주식수 정수 강제 — 엔진 RangeError 도달 경로 차단 ──────────
  //
  // 종전 `ratioSchema`는 `denom: z.number().positive()`라 **0.5 같은 소수 분모**가
  // 통과했고, 그 값이 엔진의 `safeMultiplyThenDivide` BigInt 분기에서
  // `BigInt(Math.floor(0.5))` = `0n` → `RangeError: Division by zero`가 되어
  // `/api/calc/gift-deemed`가 **HTTP 500**으로 떨어졌다(route.ts의 catch는
  // `TaxCalculationError`가 아니면 500). ⑫가 첫 관문이다.
  //
  // `ratioSchema`는 merger·capital increase·contribution·specific_corp·
  // convertible bond·related_corp이 공유하므로 한 곳을 막으면 전 경로가 닫힌다.

  it("specific_corp 소수 분모 → ⑫에서 차단 (단일 모드)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "specific_corp", transactionBenefit: 10_000_000_000_000,
      corporateTax: 0, ownershipRatio: { numer: 1000, denom: 0.5 },
    });
    expect(r.success).toBe(false);
  });

  it("specific_corp 소수 주식수 → ⑫에서 차단 (roster 모드)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "specific_corp", transactionBenefit: 10_000_000_000_000,
      annualIncome: 0, corporateTaxComputed: 0,
      shareholders: [{
        id: "a", name: "갑", relation: "lineal_descendant",
        shares: 1000, totalShares: 0.5, isDonor: false, isRelated: true,
      }],
    });
    expect(r.success).toBe(false);
  });

  it("정수 비율은 그대로 통과한다 (정상 입력을 막지 않는다)", () => {
    // 생산 측 `parseRatio`는 항상 {Math.round(pct × 100), 10_000}을 만든다.
    const r = deemedGiftInputSchema.safeParse({
      type: "specific_corp", transactionBenefit: 10_000_000_000_000,
      corporateTax: 0, ownershipRatio: { numer: 2000, denom: 10_000 },
    });
    expect(r.success).toBe(true);
  });
});
