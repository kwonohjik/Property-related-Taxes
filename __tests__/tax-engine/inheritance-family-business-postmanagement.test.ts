/**
 * 가업상속공제 사후관리 추징 + 이자상당액 anchor (Phase F)
 *
 * KoreanLaw MCP 검증 2026-05-21 / 재검증 2026-07-17:
 *   - 상증법 §18의2⑤ 전단 — 산입액을 "상속세 과세가액에 산입하여 상속세를 부과"
 *   - 상증령 §15⑮ "100분의 100" = 과세가액 산입율(공제액 전액 되돌림), 추징세액률 아님
 *   - 상증령 §15⑩ 자산처분비율 (산입액에 추가 곱)
 *   - 상증령 §15⑯ 이자상당액 일수×율
 *
 * ⚠️ 추징세액 = 상속세(originalTaxBase + 산입액) − 상속세(originalTaxBase) (§26 누진 marginal).
 *    originalTaxBase=50억(최고구간)에서 base·base+산입액 모두 50% 구간 → 추징=산입액×0.5.
 */

import { describe, expect, it } from "vitest";
import {
  calcAssetDisposalRatio,
  calcFamilyBusinessInterest,
  calcFamilyBusinessRecapture,
} from "@/lib/tax-engine/credits/family-business-postmanagement";

const LAW_REF = "상증법 §18의2⑤ + 상증령 §15⑮";

describe("FB-RECAPTURE — 사후관리 추징세액 (§18의2⑤ 전단 marginal)", () => {
  const TOP_BASE = 5_000_000_000; // 50억 — §26 최고구간(50%)

  it("FB-RECAPTURE-1: 자산처분 50% (1호) → 산입액=공제×100%×50%, 추징=marginal(산입액)", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "asset_disposal", assetDisposalRatio: 0.5, originalTaxBase: TOP_BASE },
      LAW_REF,
    );
    // 산입액 = 300억×100%×50% = 150억. 추징 = f(200억)−f(50억) = 95.4억−20.4억 = 75억 (150억×50%)
    expect(r.addBackAmount).toBe(15_000_000_000);
    expect(r.recaptureAmount).toBe(7_500_000_000);
    expect(r.recaptureRate).toBe(1.0);
    expect(r.effectiveRatio).toBe(0.5);
  });

  it("FB-RECAPTURE-2: 가업미종사 (2호) → 산입액 300억, 추징 = 산입액×50%(최고구간)", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "business_cessation", originalTaxBase: TOP_BASE },
      LAW_REF,
    );
    expect(r.addBackAmount).toBe(30_000_000_000);
    expect(r.recaptureAmount).toBe(15_000_000_000); // f(350억)−f(50억)
    expect(r.effectiveRatio).toBe(1.0);
  });

  it("FB-RECAPTURE-3: 지분 감소 (3호) → 산입액 400억, 추징 200억", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 40_000_000_000, violationType: "share_decrease", originalTaxBase: TOP_BASE },
      LAW_REF,
    );
    expect(r.recaptureAmount).toBe(20_000_000_000); // f(450억)−f(50억)
  });

  it("FB-RECAPTURE-4: 정규직&총급여 (4호) AND → 산입액 250억, 추징 125억", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 25_000_000_000, violationType: "employment_drop", originalTaxBase: TOP_BASE },
      LAW_REF,
    );
    expect(r.recaptureAmount).toBe(12_500_000_000); // f(300억)−f(50억)
  });

  it("FB-RECAPTURE-5: 자산처분비율 1.0 초과 입력 → 1.0 clamp", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "asset_disposal", assetDisposalRatio: 1.5, originalTaxBase: TOP_BASE },
      LAW_REF,
    );
    expect(r.effectiveRatio).toBe(1.0);
    expect(r.addBackAmount).toBe(30_000_000_000);
    expect(r.recaptureAmount).toBe(15_000_000_000);
  });

  it("FB-RECAPTURE-6: 자산처분 + assetDisposalRatio undefined → 1.0 fallback", () => {
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "asset_disposal", originalTaxBase: TOP_BASE },
      LAW_REF,
    );
    expect(r.effectiveRatio).toBe(1.0);
    expect(r.recaptureAmount).toBe(15_000_000_000);
  });

  it("FB-RECAPTURE-7 ★: 구간 넘나듦 — base 20억(40%) + 산입 300억 → 추징 < 산입액×50%", () => {
    // base 20억→30억(10억) 40% + 30억→320억(290억) 50% = 4억+145억 = 149억.
    //   산입액 300억×50%=150억보다 1억 작다(10억이 40% 구간).
    const r = calcFamilyBusinessRecapture(
      { appliedDeduction: 30_000_000_000, violationType: "business_cessation", originalTaxBase: 2_000_000_000 },
      LAW_REF,
    );
    expect(r.addBackAmount).toBe(30_000_000_000);
    expect(r.recaptureAmount).toBe(14_900_000_000);
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
  it("FB-PHASE-F-1: 30억 공제 + 자산 60% 처분 + 1년 경과 + 2.2% 이자율 (base 50억)", () => {
    // 산입액: 30억 × 100% × 60% = 18억. 추징: f(68억)−f(50억) = 29.4억−20.4억 = 9억
    const recapture = calcFamilyBusinessRecapture(
      { appliedDeduction: 3_000_000_000, violationType: "asset_disposal", assetDisposalRatio: 0.6, originalTaxBase: 5_000_000_000 },
      LAW_REF,
    );
    expect(recapture.addBackAmount).toBe(1_800_000_000);
    expect(recapture.recaptureAmount).toBe(900_000_000);

    // 결정세액 = 추징세액(marginal) — §15⑯1호
    const interest = calcFamilyBusinessInterest(
      { determinedTax: recapture.recaptureAmount, daysFromFilingDeadlineToViolation: 365, annualInterestRate: 0.022 },
      LAW_REF,
    );
    // 9억 × 1년 × 2.2% = 19.8M
    expect(interest.interestAmount).toBe(19_800_000);
  });
});
