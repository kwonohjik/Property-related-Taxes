/**
 * 가업상속공제 사후관리 추징 + 이자상당액 anchor (Phase F)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - 상증법 §18의2⑤ 4호 위반 유형
 *   - 상증령 §15⑮ 추징율 100분의 100 일률
 *   - 상증령 §15⑩ 자산처분비율
 *   - 상증령 §15⑯ 이자상당액 일수×율
 */

import { describe, expect, it } from "vitest";
import {
  calcAssetDisposalRatio,
  calcFamilyBusinessInterest,
  calcFamilyBusinessRecapture,
} from "@/lib/tax-engine/credits/family-business-postmanagement";

const LAW_REF = "상증법 §18의2⑤ + 상증령 §15⑮";

describe("FB-RECAPTURE — 사후관리 추징세액 (§18의2⑤ + §15⑮)", () => {
  it("FB-RECAPTURE-1: 자산처분 50% (1호) → 적용공제 × 100% × 50%", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "asset_disposal", assetDisposalRatio: 0.5 },
      LAW_REF,
    );
    expect(r.taxableAmountAddback).toBe(15_000_000_000);
    expect(r.recaptureRate).toBe(1.0);
    expect(r.effectiveRatio).toBe(0.5);
  });

  it("FB-RECAPTURE-2: 가업미종사 (2호) → 100% 일률 (자산처분비율 미적용)", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "business_cessation" },
      LAW_REF,
    );
    expect(r.taxableAmountAddback).toBe(30_000_000_000);
    expect(r.effectiveRatio).toBe(1.0);
  });

  it("FB-RECAPTURE-3: 지분 감소 (3호) → 100% 일률", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 40_000_000_000, violationType: "share_decrease" },
      LAW_REF,
    );
    expect(r.taxableAmountAddback).toBe(40_000_000_000);
  });

  it("FB-RECAPTURE-4: 정규직&총급여 (4호) AND → 100% 일률", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 25_000_000_000, violationType: "employment_drop" },
      LAW_REF,
    );
    expect(r.taxableAmountAddback).toBe(25_000_000_000);
  });

  it("FB-RECAPTURE-5: 자산처분비율 1.0 초과 입력 → 1.0 clamp", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "asset_disposal", assetDisposalRatio: 1.5 },
      LAW_REF,
    );
    expect(r.effectiveRatio).toBe(1.0);
    expect(r.taxableAmountAddback).toBe(30_000_000_000);
  });

  it("FB-RECAPTURE-6: 자산처분 + assetDisposalRatio undefined → 1.0 fallback", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "asset_disposal" },
      LAW_REF,
    );
    expect(r.effectiveRatio).toBe(1.0);
  });
});

describe("FB-INTEREST — 이자상당액 (§15⑯)", () => {
  it("FB-INTEREST-1: 일반 산식 — 결정세액 × 일수 × (연이자율/365)", () => {
    // 결정세액 10억 × 365일 × (2.2%/365) = 10억 × 2.2% = 22M
    const r = calcFamilyBusinessInterest(
      { determinedTax: 1_000_000_000, daysFromFilingDeadlineToViolation: 365, annualInterestRate: 0.022 },
      LAW_REF,
    );
    expect(r.interestAmount).toBe(22_000_000);
    expect(r.dailyRate).toBeCloseTo(0.022 / 365);
  });

  it("FB-INTEREST-2: 일수 0 → 이자 0", () => {
    const r = calcFamilyBusinessInterest(
      { determinedTax: 1_000_000_000, daysFromFilingDeadlineToViolation: 0, annualInterestRate: 0.022 },
      LAW_REF,
    );
    expect(r.interestAmount).toBe(0);
  });

  it("FB-INTEREST-3: 결정세액 0 → 이자 0", () => {
    const r = calcFamilyBusinessInterest(
      { determinedTax: 0, daysFromFilingDeadlineToViolation: 365, annualInterestRate: 0.022 },
      LAW_REF,
    );
    expect(r.interestAmount).toBe(0);
  });

  it("FB-INTEREST-4: floor 절사 검증", () => {
    // 100원 × 1일 × (2.2%/365) = 100 × 0.0000602739... = 0.006...
    const r = calcFamilyBusinessInterest(
      { determinedTax: 100, daysFromFilingDeadlineToViolation: 1, annualInterestRate: 0.022 },
      LAW_REF,
    );
    expect(r.interestAmount).toBe(0); // floor 적용
  });
});

describe("FB-ASSET-DISPOSAL — 자산처분비율 (§15⑩)", () => {
  it("FB-ASSET-DISPOSAL-1: 50% 처분 (50억 / 100억)", () => {
    expect(calcAssetDisposalRatio(5_000_000_000, 10_000_000_000)).toBe(0.5);
  });

  it("FB-ASSET-DISPOSAL-2: 총자산 0 가드 → 0", () => {
    expect(calcAssetDisposalRatio(5_000_000_000, 0)).toBe(0);
  });

  it("FB-ASSET-DISPOSAL-3: 처분 > 총자산 → 1.0 clamp", () => {
    expect(calcAssetDisposalRatio(15_000_000_000, 10_000_000_000)).toBe(1);
  });

  it("FB-ASSET-DISPOSAL-4: 처분 0 → 0", () => {
    expect(calcAssetDisposalRatio(0, 10_000_000_000)).toBe(0);
  });

  it("FB-ASSET-DISPOSAL-5: 음수 처분 → 0 가드", () => {
    expect(calcAssetDisposalRatio(-1_000_000_000, 10_000_000_000)).toBe(0);
  });
});

describe("FB-INTEGRATION-PHASE-F — 추징 + 이자 통합 시뮬", () => {
  it("FB-PHASE-F-1: 30억 공제 + 자산 60% 처분 + 1년 경과 + 2.2% 이자율", () => {
    // 추징: 30억 × 100% × 60% = 18억
    const recapture = calcFamilyBusinessRecapture(
      { appliedDeduction: 3_000_000_000, violationType: "asset_disposal", assetDisposalRatio: 0.6 },
      LAW_REF,
    );
    expect(recapture.taxableAmountAddback).toBe(1_800_000_000);

    // 결정세액 = 추징세액 가정 (실제 산정은 orchestrator)
    const interest = calcFamilyBusinessInterest(
      { determinedTax: recapture.taxableAmountAddback, daysFromFilingDeadlineToViolation: 365, annualInterestRate: 0.022 },
      LAW_REF,
    );
    // 18억 × 1년 × 2.2% = 39.6M
    expect(interest.interestAmount).toBe(39_600_000);
  });
});
