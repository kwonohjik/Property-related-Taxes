/**
 * Phase A Pre-Do anchor — 직전 공시가격 2단계 통합 동등성·§122 영향 실측
 *
 * 계획서: docs/00-pm/comprehensive-prior-year-2step-consolidation.plan.md §8
 * 출처 케이스: 사례4 (comprehensive-prior-year-multi.test.ts) 재사용.
 *
 * 통합 설계: 직전 공시가격(주택별 priorAssessedValue) 단일 입력 → 변환이
 *   previousYearAuto.priorHouseValues를 파생(엔진 무변경). 따라서 "통합 후 엔진 input"을
 *   현재 엔진에 직접 넣은 실측 = 통합 후 결과 예측 (현행 일치 예상 금지 — 실측으로 단정).
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

describe("Phase A — 직전 공시 2단계 통합 Pre-Do anchor", () => {
  // 사례4: 당해 13억·14억(p2 §8④ 일시적2주택 의제), 직전 12억·13억, 2022 조정2주택
  const base: ComprehensiveTaxInput = {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [
      { propertyId: "p1", assessedValue: 1_300_000_000, exclusionType: "none" },
      {
        propertyId: "p2",
        assessedValue: 1_400_000_000,
        exclusionType: "none",
        section8para4Type: "temporary_two_house",
      },
    ],
    previousYearAuto: {
      assessedValue: 2_500_000_000,
      priorHouseValues: [1_200_000_000, 1_300_000_000],
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: true,
    },
  };

  // A-base: 엔진 무변경 기준선 (사례4 회귀)
  it("A-base: 사례4 determinedHousingTax = 6,464,123 · 세부담상한 미적용", () => {
    const r = calculateComprehensiveTax(base);
    expect(r.determinedHousingTax).toBe(6_464_123);
    expect(r.taxCap?.isApplied).toBe(false);
  });

  // A-priorOnly: 직전 공시를 priorAssessedValue로만 입력(previousYearAuto 없음)
  //   → 현재 엔진은 §10 종부세 세부담상한 직전상당액 미산출(previousYearEquivalent undefined).
  //   "통합 시 변환이 priorAssessedValue → previousYearAuto 파생 필수" 실증.
  it("A-priorOnly: priorAssessedValue만 → §10 직전상당액 미산출 (변환 파생 필요 실증)", () => {
    const priorOnly: ComprehensiveTaxInput = {
      ...base,
      properties: [
        { ...base.properties[0], priorAssessedValue: 1_200_000_000 },
        { ...base.properties[1], priorAssessedValue: 1_300_000_000 },
      ],
      previousYearAuto: undefined,
    };
    const r = calculateComprehensiveTax(priorOnly);
    expect(r.previousYearEquivalent).toBeUndefined();
  });

  // A-integrated: 통합 후 변환이 만들 input (priorAssessedValue + previousYearAuto 둘 다 동일 직전공시)
  //   → §122 layer-1 활성화가 당해 세액을 바꾸는지 실측 (현행 일치 예상 금지).
  it("A-integrated: priorAssessedValue 추가가 당해 세액을 바꾸는가 (§122 영향 실측)", () => {
    const integrated: ComprehensiveTaxInput = {
      ...base,
      properties: [
        { ...base.properties[0], priorAssessedValue: 1_200_000_000 },
        { ...base.properties[1], priorAssessedValue: 1_300_000_000 },
      ],
    };
    const rBase = calculateComprehensiveTax(base);
    const rInt = calculateComprehensiveTax(integrated);
    // 같으면 §122 무영향(통합 안전) · 다르면 §122 영향(설계 환류 필요)
    expect(rInt.determinedHousingTax).toBe(rBase.determinedHousingTax);
  });

  // A-§122활성: 직전 공시를 낮춰(5억) §122 상한이 실제 걸리는 케이스에서
  //   priorAssessedValue가 재산세 ⓐ는 §122로 감액하나(적용), 종부세 최종은 보존되는지 분리 실측.
  //   → "통합으로 priorAssessedValue 추가 시 종부세 결과 영향 여부"를 정확히 규명(설계 직결).
  it("A-§122활성: §122는 재산세 ⓐ를 감액(적용)하나 종부세 최종 영향 실측", () => {
    const simple: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 1_300_000_000, exclusionType: "none" },
      ],
      previousYearAuto: {
        assessedValue: 500_000_000,
        priorHouseValues: [500_000_000],
        isOneHouseOwner: false,
      },
    };
    const withPrior: ComprehensiveTaxInput = {
      ...simple,
      properties: [{ ...simple.properties[0], priorAssessedValue: 500_000_000 }],
    };
    const rNo = calculateComprehensiveTax(simple);
    const rWith = calculateComprehensiveTax(withPrior);
    const cap = rWith.properties[0]?.housingTaxCapDetail;
    // (1) §122 실제 적용: 상한액이 당해 표준세율보다 낮아 cappedTax 감액
    expect(cap?.cappedTax).toBeLessThan(cap?.standardTax ?? Number.POSITIVE_INFINITY);
    // (2) 종부세 최종 영향: priorAssessedValue 유무 차이 실측 (예상 금지 — 실측값으로 단정)
    expect(rWith.determinedHousingTax).toBe(rNo.determinedHousingTax);
  });

  // A-사례8통합: 다주택+감면 — 통합 변환이 만드는 input(priorAssessedValue 주택별 §122 +
  //   previousYearAuto §10·집계 §122 단서, reductionRate=properties[0]).
  //   §122 이중 제거 회귀 방어: 주택별 §122가 있으면 집계 §122 단서 스킵 → 교재 정답 ⑤ 16,747,099 보존.
  //   (집계 단서가 previousYearAuto.reductionRate 스칼라로 ⓓ를 왜곡하던 17,001,297 차단.)
  it("A-사례8통합: 다주택+감면 §122 이중 제거 → ⑤ 16,747,099 (교재 보존)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: true,
      properties: [
        { propertyId: "seocho", assessedValue: 2_000_000_000, reductionRate: 0.3, priorAssessedValue: 1_500_000_000 },
        { propertyId: "gangnam", assessedValue: 1_000_000_000, priorAssessedValue: 800_000_000 },
      ],
      previousYearAuto: {
        assessedValue: 2_300_000_000,
        priorHouseValues: [1_500_000_000, 800_000_000],
        isOneHouseOwner: false,
        isMultiHouseInAdjustedArea: true,
        reductionRate: 0.3,
      },
    };
    const r = calculateComprehensiveTax(input);
    expect(r.calculatedTax).toBe(18_960_000); // ① 산출세액 (중과 2.2%)
    expect(r.propertyTaxCredit.creditAmount).toBe(2_212_901); // ⓓ (주택별 §122만)
    expect(r.determinedHousingTax).toBe(16_747_099); // ⑤ (집계 §122 단서 스킵 — 교재 보존)
  });
});
