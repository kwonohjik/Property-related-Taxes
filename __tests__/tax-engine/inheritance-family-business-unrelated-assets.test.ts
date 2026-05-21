/**
 * 가업상속공제 사업무관자산 차감 anchor (상증령 §15⑤2호)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §15⑤2호 본문 산식 — 주식가액 × (총자산 − 사업무관자산) / 총자산
 *   - 가~마 5종 사업무관자산
 */

import { describe, expect, it } from "vitest";
import {
  calcFamilyBusinessStockValuation,
  type UnrelatedAssetsBreakdown,
} from "@/lib/tax-engine/deductions/family-business-unrelated-assets";

const LAW_REF = "상증령 §15⑤2호";

function makeUnrelated(overrides: Partial<UnrelatedAssetsBreakdown> = {}): UnrelatedAssetsBreakdown {
  return {
    nonBusinessLand: 0,
    leasedRealEstate: 0,
    excessiveLoans: 0,
    excessCash: 0,
    unrelatedFinancialAssets: 0,
    ...overrides,
  };
}

describe("FB-UA — 사업무관자산 차감 후 가업 주식가액 (§15⑤2호)", () => {
  it("FB-UA-1: 정상 산식 — 주식 100억 × (1000억 − 200억) / 1000억 = 80억", () => {
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 10_000_000_000,
        totalAssetValue: 100_000_000_000,
        unrelatedAssets: makeUnrelated({
          nonBusinessLand: 10_000_000_000,
          excessCash: 10_000_000_000,
        }),
      },
      LAW_REF,
    );
    expect(r.unrelatedTotal).toBe(20_000_000_000);
    expect(r.businessAssetRatio).toBeCloseTo(0.8);
    expect(r.adjustedStockValue).toBe(8_000_000_000);
    expect(r.guardReason).toBeUndefined();
  });

  it("FB-UA-2: 5종 모두 입력 — 가~마 합산 검증", () => {
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 20_000_000_000,
        totalAssetValue: 100_000_000_000,
        unrelatedAssets: {
          nonBusinessLand: 5_000_000_000,
          leasedRealEstate: 3_000_000_000,
          excessiveLoans: 2_000_000_000,
          excessCash: 4_000_000_000,
          unrelatedFinancialAssets: 6_000_000_000,
        },
      },
      LAW_REF,
    );
    // 합계 20억(M)·총자산 1000억 → 사업관련 비율 80%
    expect(r.unrelatedTotal).toBe(20_000_000_000);
    expect(r.adjustedStockValue).toBe(16_000_000_000); // 20억 × 0.8
  });

  it("FB-UA-3: 사업무관 = 0 → 주식 그대로 (사업관련 100%)", () => {
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 10_000_000_000,
        totalAssetValue: 100_000_000_000,
        unrelatedAssets: makeUnrelated(),
      },
      LAW_REF,
    );
    expect(r.adjustedStockValue).toBe(10_000_000_000);
    expect(r.businessAssetRatio).toBe(1);
  });

  it("FB-UA-4: 총자산 0 → 가드 (zero_total)", () => {
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 10_000_000_000,
        totalAssetValue: 0,
        unrelatedAssets: makeUnrelated(),
      },
      LAW_REF,
    );
    expect(r.adjustedStockValue).toBe(0);
    expect(r.guardReason).toBe("zero_total");
  });

  it("FB-UA-5: 사업무관 > 총자산 → 가드 (unrelated_exceeds_total)", () => {
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 10_000_000_000,
        totalAssetValue: 50_000_000_000,
        unrelatedAssets: makeUnrelated({ nonBusinessLand: 60_000_000_000 }),
      },
      LAW_REF,
    );
    expect(r.adjustedStockValue).toBe(0);
    expect(r.guardReason).toBe("unrelated_exceeds_total");
  });

  it("FB-UA-6: 사업무관 = 총자산 → 사업관련 0 → 결과 0", () => {
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 10_000_000_000,
        totalAssetValue: 100_000_000_000,
        unrelatedAssets: makeUnrelated({ excessCash: 100_000_000_000 }),
      },
      LAW_REF,
    );
    expect(r.adjustedStockValue).toBe(0);
    expect(r.guardReason).toBe("unrelated_exceeds_total");
  });

  it("FB-UA-7: floor 적용 검증 — 비율 곱셈 후 원 미만 절사", () => {
    // 주식 1,000,000원 × (3 / 7) = 428,571.42857...
    const r = calcFamilyBusinessStockValuation(
      {
        rawStockValue: 1_000_000,
        totalAssetValue: 7,
        unrelatedAssets: makeUnrelated({ nonBusinessLand: 4 }),
      },
      LAW_REF,
    );
    expect(r.adjustedStockValue).toBe(428_571);
  });
});
