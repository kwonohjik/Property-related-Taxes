/**
 * 종합부동산세 과세연도별 세법 파라미터 anchor (Pre-Do)
 *
 * 출처: 국세청 「2022 귀속 종합부동산세 계산 사례」 (원단위 toBe 고정)
 *   - 세율표 축자: pdf38 (책 193) 신고서 작성방법 부록 — 구간 3/6/12/50/94억 확정
 *   - 사례1 (pdf3):  일반 1주택 공시 9.5억
 *   - 사례4 (pdf9):  일시적 1세대 2주택 (1세대1주택 특례) 공시 27억
 *   - 사례9 (pdf22): 3주택 (14+10+5=29억) — 다주택 중과 자동 판정
 *
 * 설계: docs/02-design/features/comprehensive-tax-year-aware.engine.design.md
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import { calculatePropertyTaxCreditProration } from "../../lib/tax-engine/comprehensive-tax-helpers";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

describe("연도별 파라미터 — 2022 귀속 (Pre-Do anchor)", () => {
  // YA-1: 사례1 — 일반 1주택, 기본공제 6억·FMR 60%·세율 0.6%
  it("YA-1 (사례1): 2022 일반 1주택 공시 9.5억 → 과표 2.1억 × 0.6% = 1,260,000", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 950_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(600_000_000);   // 2022 일반 6억 (현행 9억 아님)
    expect(result.fairMarketRatio).toBe(0.6);
    expect(result.taxBase).toBe(210_000_000);          // (9.5억 − 6억) × 60%
    expect(result.appliedRate).toBe(0.006);            // 2022 최저구간 0.6% (현행 0.5% 아님)
    expect(result.calculatedTax).toBe(1_260_000);      // 사례1 산출세액
  });

  // YA-2: 사례4 — 1세대1주택 공제 11억 (현행 12억 아님), 6~12억 구간 1.2%
  it("YA-2 (사례4): 2022 1세대1주택 공시 27억 → 과표 9.6억 × 1.2% − 300만 = 8,520,000", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: true,
      properties: [
        { propertyId: "p1", assessedValue: 1_300_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 1_400_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.basicDeduction).toBe(1_100_000_000); // 2022 1세대1주택 11억
    expect(result.taxBase).toBe(960_000_000);          // (27억 − 11억) × 60%
    expect(result.appliedRate).toBe(0.012);
    expect(result.progressiveDeduction).toBe(3_000_000);
    expect(result.calculatedTax).toBe(8_520_000);      // 사례4 산출세액
  });

  // YA-3: 사례9 — 3주택 자동 다주택 중과 (조정지역 입력 없이 주택 수로 판정)
  it("YA-3 (사례9): 2022 3주택 합산 29억 → 과표 13.8억 × 3.6% − 2,160만 = 28,080,000", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 1_400_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 1_000_000_000, exclusionType: "none" },
        { propertyId: "p3", assessedValue: 500_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    expect(result.taxBase).toBe(1_380_000_000);        // (29억 − 6억) × 60%
    expect(result.appliedRate).toBe(0.036);            // 3주택 → multi 표 자동 (12억~50억 구간)
    expect(result.progressiveDeduction).toBe(21_600_000);
    expect(result.calculatedTax).toBe(28_080_000);     // 사례9 산출세액
  });
});

describe("현행(2023~) 3주택 이상 중과 §9①2호 (Pre-Do anchor — 신규 발견 갭)", () => {
  // YA-4: 현행법도 3주택+ 12억 초과 구간은 중과세율 — 현행 엔진 단일표는 과소 계산
  it("YA-4: 2024 3주택 합산 31억 → 과표 13.2억 × 2.0% − 1,440만 = 12,000,000 (§9①2호)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2024,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 1_000_000_000, exclusionType: "none" },
        { propertyId: "p3", assessedValue: 600_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    // (31억 − 9억) × 60% = 13.2억 → §9①2호 12억~25억 구간 2.0%, 누진 1,440만
    expect(result.taxBase).toBe(1_320_000_000);
    expect(result.appliedRate).toBe(0.02);
    expect(result.calculatedTax).toBe(12_000_000);
  });
});

describe("재산세 비율안분 공제 산식 (Pre-Do anchor — 시행령 산식 갭 실증)", () => {
  // YA-5: 사례1 공제 504,000 — 법정 산식 §4의3 (표준세율 기반)
  //
  // 사례1 (국세청 사례집 pdf3~4 실측, pdf38 신고서 작성방법 확인):
  //   ⓐ 부과 재산세: 1,650,000 (재산세 과표 9.5억×60%=5.7억 × 0.4% − 630,000)
  //   ⑤ 종부세 과표분 표준세율 재산세상당액:
  //      = 종부세 과표(2.1억) × 재산세FMR(60%) × 0.4% = 504,000
  //      = floor(210_000_000 × 60 × 4 / 100_000) = 504,000
  //   ⑥ 총 표준세율 재산세 산출세액: 1,650,000 (= 5.7억 × 0.4% − 63만, 일반세율)
  //   공제 = floor(ⓐ × ⑤/⑥) = floor(1,650,000 × 504,000/1,650,000) = 504,000
  //
  // ※ 구 산식(단순 과표 비율): 1,650,000 × 2.1억/5.7억 = 607,894 (틀림 — 법정 산식과 불일치)
  it("YA-5 (사례1): 안분 공제 = 504,000 (시행령 §4의3 표준세율 기반 법정 산식)", () => {
    const credit = calculatePropertyTaxCreditProration(
      1_650_000,   // ⓐ: 재산세 부과세액
      504_000,     // ⑤: 종부세 과표분 표준세율 재산세 상당액 (2.1억 × 60% × 0.4%)
      1_650_000,   // ⑥: 총 표준세율 재산세 산출세액 (5.7억 × 0.4% − 63만)
      1_260_000,   // 종부세 산출세액 (공제 상한)
    );
    expect(credit.creditAmount).toBe(504_000);
  });
});

// ============================================================
// 사례1 통합 anchor — calculateComprehensiveTax 전체 흐름 검증
// ============================================================

describe("사례1 통합 anchor — 결정세액 756,000 (국세청 사례집 pdf4 확인)", () => {
  // 사례1 (2022, 일반 1주택, 공시 9.5억):
  //   과세표준: (9.5억 − 6억) × 60% = 2.1억
  //   산출세액: 2.1억 × 0.6% = 1,260,000
  //   재산세 비율안분 공제: 504,000 (시행령 §4의3 법정 산식)
  //   결정세액: 1,260,000 − 504,000 = 756,000
  it("YA-6 (사례1 통합): calculateComprehensiveTax → determinedHousingTax = 756,000", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,  // 일반 1주택 (1세대1주택 특례 미신청)
      properties: [
        { propertyId: "p1", assessedValue: 950_000_000, exclusionType: "none" },
      ],
    };
    const result = calculateComprehensiveTax(input);

    // 과세표준·산출세액 확인 (YA-1과 동일)
    expect(result.taxBase).toBe(210_000_000);
    expect(result.calculatedTax).toBe(1_260_000);

    // 재산세 비율안분 공제: 504,000 (법정 산식 §4의3)
    expect(result.propertyTaxCredit.creditAmount).toBe(504_000);

    // 결정세액 = 산출세액 − 재산세 안분 공제 (전년도 미입력 → 세부담상한 미적용)
    expect(result.determinedHousingTax).toBe(756_000);  // 사례집 pdf4 확인값
  });
});
