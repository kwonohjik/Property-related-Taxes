/**
 * PR-M·Q 후속 anchor — §17의2 4호 단서 (충당금 확정분 + 보험법인)
 *
 * 본 PR 엔진 변경 0건 — net-asset-calc.ts:73·77~79에 이미 구현되어 있음.
 * 회귀 보호 anchor만 추가.
 *
 * 검증 대상:
 *   PR-Q (§17의2 4호 단서 가): 충당금 중 평가기준일 비용 확정분은 부채 차감 미적용
 *     → otherProvision 필드를 부채 가산 (모든 법인 적용)
 *   PR-M (§17의2 4호 단서 나·다): 보험사업·보험회사 책임준비금·비상위험준비금·해약환급금준비금
 *     → insuranceReservePolicy / insuranceExtraordinaryReserve / insuranceSurrenderReserve
 *
 * 법령 근거:
 *   §17의2 4호 본문: "제충당금·제준비금 → 부채 차감"
 *   §17의2 4호 단서 가: "충당금 중 평가기준일 현재 비용으로 확정된 것"은 차감 미적용 (모든 법인)
 *   §17의2 4호 단서 나: 보험사업 (법인세법 §30①) 책임준비금·비상위험준비금
 *   §17의2 4호 단서 다: 보험회사 (법인세법 §32①) 책임준비금·비상위험준비금·해약환급금준비금
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §3 PR-M·PR-Q
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §1 Q-1·Q-2
 */

import { describe, it, expect } from "vitest";
import { calcNetAssetTotal } from "@/lib/tax-engine/property-valuation/net-asset-calc";
import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

// 사례 6 기준 부채 (PR-Q·M 검증용 기준값)
const CASE_6_BASE: UnlistedNetAssetCalculation = {
  bsTotalAssets: 2_476_889_520,
  assetValuationDelta: 91_548_350,
  corpTaxReservedAmount: 0,
  paidInCapitalIncrease: 0,
  otherEarnedRights: 0,
  prepaidExpenses: 65_400_500,
  preGiftRetainedEarnings: 0,
  bsTotalLiabilities: 1_833_780_000,
  corporateTaxPayable: 32_627_890,
  farmingSurtax: 0,
  localIncomeTax: 3_262_780,
  dividendPayable: 0,
  retirementProvision: 445_785_000,
  otherProvision: 0,
  reserveExcluded: 0,
  allowanceExcluded: 301_770_000,
  deferredTaxAdjustment: 0,
};

// ============================================================
// PR-Q — §17의2 4호 단서 가 (충당금 확정분, 모든 법인)
// ============================================================

describe("[Q-1] §17의2 4호 단서 가 — 충당금 비용 확정분 부채 가산 (모든 법인)", () => {
  it("Q-1a: 사례 6 baseline + otherProvision=0 → 부채 총액 변동 없음 (회귀)", () => {
    const result = calcNetAssetTotal(CASE_6_BASE);

    // 사례 6 정합 (case-3 U-12 anchor)
    expect(result.totalLiabilities).toBe(2_013_685_670);
    expect(result.netAssetBeforeGoodwill).toBe(489_351_700);
  });

  it("Q-1b: otherProvision=70,000,000 → 부채 +70M 증가 (§17의2 4호 단서 가)", () => {
    // 일반 충당금 1억 중 평가기준일 비용 확정분 7천만 → 부채에 그대로 남음 (차감 미적용)
    const result = calcNetAssetTotal({
      ...CASE_6_BASE,
      otherProvision: 70_000_000,
    });

    // 부채 = 2,013,685,670 + 70,000,000 = 2,083,685,670
    expect(result.totalLiabilities).toBe(2_083_685_670);
    // 순자산 = 자산 2,503,037,370 − 부채 2,083,685,670 = 419,351,700
    expect(result.netAssetBeforeGoodwill).toBe(419_351_700);
  });

  it("Q-1c: otherProvision은 보험법인 필드와 독립 — 동시 입력 시 양쪽 모두 가산", () => {
    // PR-M cross-cutting 보장: otherProvision (일반 충당금) + 보험법인 책임준비금 동시
    const result = calcNetAssetTotal({
      ...CASE_6_BASE,
      otherProvision: 50_000_000,
      insuranceReservePolicy: 100_000_000,
    });

    // 부채 = 2,013,685,670 + 50M + 100M = 2,163,685,670
    expect(result.totalLiabilities).toBe(2_163_685_670);
  });
});

// ============================================================
// PR-M — §17의2 4호 단서 나·다 (보험사업·보험회사)
// ============================================================

describe("[M-1] §17의2 4호 단서 나 — 보험사업 책임준비금·비상위험준비금", () => {
  it("M-1a: 사례 6 baseline에 보험 책임준비금 200M 추가 → 부채 +200M", () => {
    const result = calcNetAssetTotal({
      ...CASE_6_BASE,
      insuranceReservePolicy: 200_000_000,
    });

    expect(result.totalLiabilities).toBe(2_013_685_670 + 200_000_000);
    expect(result.netAssetBeforeGoodwill).toBe(489_351_700 - 200_000_000);
  });

  it("M-1b: 비상위험준비금 50M 추가 → 부채 +50M (책임준비금과 독립 합산)", () => {
    const result = calcNetAssetTotal({
      ...CASE_6_BASE,
      insuranceReservePolicy: 200_000_000,
      insuranceExtraordinaryReserve: 50_000_000,
    });

    expect(result.totalLiabilities).toBe(2_013_685_670 + 250_000_000);
  });
});

describe("[M-2] §17의2 4호 단서 다 — 보험회사 해약환급금준비금", () => {
  it("M-2: 해약환급금준비금 80M 추가 → 부채 +80M (다른 보험 필드와 독립 합산)", () => {
    const result = calcNetAssetTotal({
      ...CASE_6_BASE,
      insuranceReservePolicy: 200_000_000,
      insuranceExtraordinaryReserve: 50_000_000,
      insuranceSurrenderReserve: 80_000_000,
    });

    // 부채 = 사례 6 baseline + (200M + 50M + 80M) = 2,013,685,670 + 330,000,000
    expect(result.totalLiabilities).toBe(2_013_685_670 + 330_000_000);
    expect(result.netAssetBeforeGoodwill).toBe(489_351_700 - 330_000_000);
  });
});

describe("[M-3] 보험 필드 미입력 일반법인 — undefined fallback (회귀)", () => {
  it("M-3: 보험 3 필드 모두 undefined → 사례 6 baseline 동일 (회귀)", () => {
    // case-3 U-12 anchor와 동일 결과 보장 — 일반법인 회귀 보호
    const result = calcNetAssetTotal(CASE_6_BASE);

    expect(result.totalLiabilities).toBe(2_013_685_670);
    expect(result.netAssetBeforeGoodwill).toBe(489_351_700);
  });
});
