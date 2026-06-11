/**
 * 종합부동산세 후속 특례 — Pre-Do anchor (Phase 0)
 *
 * 출처:
 *   - 국세청 「2022 귀속 종합부동산세 계산 사례」 사례5 (pdf11~13, 300dpi 재실측)
 *   - 종합부동산세법 시행령 §2의4② (토지 FMR 2021=95%)
 *   - 신고서 작성방법 pdf38 ⑥·⑦ (재산세 안분 ⑤ 분자·⑥ 분모 산식)
 *
 * 설계: docs/02-design/features/comprehensive-tax-special-cases.engine.design.md
 *
 * ★ Pre-Do 상태: G-7·SC-A1은 엔진 수정 전 — 실패가 정상 (갭 실증).
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

// ============================================================
// G-7: 주택분 재산세 안분 ⑥ 분모 — 합산 단일 누진 (시행령 §4의3)
// ============================================================

describe("G-7 (사례5): 다주택 재산세 안분 ⑥ = 합산 단일 누진 — pdf12 실측", () => {
  // 사례5 (2022 귀속, 부부 공동명의 특례 §10의2 — 엔진 관점은 1세대1주택 경로):
  //   공시가격 합산: 15억(성동, 부부 50%×2 합산) + 2억(세종) = 17억
  //   과세표준: (17억 − 11억) × 60% = 3.6억
  //   산출세액: 3.6억 × 0.8% − 600,000 = 2,280,000
  //   ⓐ 부과 재산세 합계: 성동 2,970,000(9억×0.4%−63만) + 세종 150,000(1.2억×0.15%−3만) = 3,120,000
  //   ⑤ = 3.6억 × 60% × 0.4% = 864,000
  //   ⑥ = 17억 × 60% × 0.4% − 630,000 = 3,450,000   ★ 합산 단일 누진 (Σ per-house 3,120,000 아님)
  //   공제 = floor(3,120,000 × 864,000 / 3,450,000) = 781,356
  //   공제 후: 2,280,000 − 781,356 = 1,498,644 (pdf13 확인)
  it("사례5: 공제 781,356 · 공제 후 1,498,644 (현행 Σ per-house 분모는 864,000 — 갭)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: true, // §10의2 특례 = 1세대1주택 의제 (Do 단계에서 isJointOwnershipSpecialCase로 대체)
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 200_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(1_100_000_000);
    expect(result.taxBase).toBe(360_000_000);
    expect(result.calculatedTax).toBe(2_280_000);          // 사례5 ① (pdf11)

    // ★ G-7 핵심: ⑥ 분모는 합산 단일 누진 3,450,000
    expect(result.propertyTaxCredit.creditAmount).toBe(781_356);   // pdf12 ④
    expect(result.calculatedTax - result.propertyTaxCredit.creditAmount).toBe(
      1_498_644,                                            // pdf12 ③ 상한 적용 전 종부세
    );
  });
});

// ============================================================
// SC-A1: 토지 FMR 연도화 — 2021 = 95% (시행령 §2의4②)
// ============================================================

describe("SC-A1: 2021 종합합산 토지 FMR 95%", () => {
  // 과세표준 = trunc10k(floor((10억 − 5억) × 0.95)) = 475,000,000
  // 현행 엔진: fairMarketRatioLand 전달 경로 부재 → 100% 고정 = 5억 (갭)
  it("공시 10억 → 과표 4.75억 · echo fairMarketRatio 0.95", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2021,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 500_000_000, exclusionType: "none" },
      ],
      landAggregate: {
        totalOfficialValue: 1_000_000_000,
        propertyTaxBase: 700_000_000,
        propertyTaxAmount: 2_000_000,
      },
    };
    const result = calculateComprehensiveTax(input);

    expect(result.aggregateLandTax?.taxBase).toBe(475_000_000);
    expect(result.aggregateLandTax?.fairMarketRatio).toBe(0.95);
  });
});
