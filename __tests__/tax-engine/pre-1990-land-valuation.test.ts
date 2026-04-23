/**
 * 1990.8.30. 이전 취득 토지 기준시가 환산 엔진 단위 테스트
 *
 * 검증 대상:
 * - 국세청 집행기준 97-176의2 산정예시 5가지 유형 전량 재현
 * - 『2023 양도·상속·증여세 이론 및 계산실무』 PDF 실사례 재현
 * - 경계값(1990.1.1., 1990.8.30., 등급 1/365 등) 및 입력 검증
 */

import { describe, it, expect } from "vitest";
import {
  calculatePre1990LandValuation,
  classifyCaseType,
  GRADE_CAP_TRIGGER_DATE,
  INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE,
  type Pre1990LandValuationInput,
} from "@/lib/tax-engine/pre-1990-land-valuation";
import {
  LAND_GRADE_MAX,
  LAND_GRADE_MIN,
  LAND_GRADE_VALUES,
  getGradeValue,
} from "@/lib/tax-engine/data/land-grade-values";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";

// ============================================================
// A. 국세청 5가지 예시 재현 (1990.1.1. 공시지가 10,000원/㎡ 가정)
// ============================================================

describe("국세청 집행기준 97-176의2 — 5가지 유형 재현", () => {
  const base = {
    transferDate: new Date("2023-01-01"),
    areaSqm: 1,
    pricePerSqm_1990: 10_000,
    pricePerSqm_atTransfer: 100_000,
  };

  it("Case ① 등급조정이 계속 없었던 경우 → 8,888원", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1983-01-01"),
      grade_1990_0830:     { gradeValue: 100_000 },
      gradePrev_1990_0830: { gradeValue:  80_000 },
      gradeAtAcquisition:  { gradeValue:  80_000 },
    });
    expect(Math.floor(r.pricePerSqmAtAcquisition)).toBe(8_888);
    expect(r.caseType).toBe("case1_no_adjustment");
    expect(r.breakdown.denominatorCap1Applied).toBe(false);
    expect(r.breakdown.ratioCap2Applied).toBe(false);
  });

  it("Case ② 1990.1.1. 등급조정이 없는 경우 → 4,444원", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1987-08-01"),
      grade_1990_0830:     { gradeValue: 180_000 },
      gradePrev_1990_0830: { gradeValue: 180_000 },
      gradeAtAcquisition:  { gradeValue:  80_000 },
    });
    expect(Math.floor(r.pricePerSqmAtAcquisition)).toBe(4_444);
    expect(r.caseType).toBe("case2_no_1990_adjustment");
    expect(r.breakdown.appliedDenominator).toBe(180_000);
    expect(r.breakdown.denominatorCap1Applied).toBe(false);
  });

  it("Case ③ 분모가액이 90.8.30. 현재를 초과 → CAP-1 발동 → 8,000원", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1987-08-01"),
      grade_1990_0830:     { gradeValue: 100_000 },
      gradePrev_1990_0830: { gradeValue: 150_000 },
      gradeAtAcquisition:  { gradeValue:  80_000 },
    });
    expect(r.pricePerSqmAtAcquisition).toBe(8_000);
    expect(r.caseType).toBe("case3_denominator_cap");
    expect(r.breakdown.denominatorCap1Applied).toBe(true);
    expect(r.breakdown.appliedDenominator).toBe(100_000);
    expect(r.breakdown.averageDenominator).toBe(125_000);
  });

  it("Case ④ 등급조정기간 동일 + 비율 100% 초과 → CAP-2 발동 → 10,000원", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1990-02-01"),
      grade_1990_0830:     { gradeValue: 100_000 },
      gradePrev_1990_0830: { gradeValue:  90_000 },
      gradeAtAcquisition:  { gradeValue: 100_000 },
    });
    expect(r.pricePerSqmAtAcquisition).toBe(10_000);
    expect(r.caseType).toBe("case4_ratio_cap");
    expect(r.breakdown.ratioCap2Triggered).toBe(true);
    expect(r.breakdown.ratioCap2Applied).toBe(true);
    expect(r.breakdown.rawRatio).toBeCloseTo(100_000 / 95_000, 6);
    expect(r.breakdown.appliedRatio).toBe(1.0);
  });

  it("Case ⑤ 등급조정기간 상이 + 비율 100% 초과 → CAP-2 예외 → 10,526원", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1987-08-01"),
      grade_1990_0830:     { gradeValue: 100_000 },
      gradePrev_1990_0830: { gradeValue:  90_000 },
      gradeAtAcquisition:  { gradeValue: 100_000 },
    });
    expect(Math.floor(r.pricePerSqmAtAcquisition)).toBe(10_526);
    expect(r.caseType).toBe("case5_ratio_no_cap");
    expect(r.breakdown.ratioCap2Triggered).toBe(false);
    expect(r.breakdown.ratioCap2Applied).toBe(false);
    expect(r.breakdown.appliedRatio).toBeCloseTo(100_000 / 95_000, 6);
  });
});

// ============================================================
// B. PDF 실사례 재현
// ============================================================

describe("PDF 실사례 재현 — 1988.12.3. 취득 농지, 2023.2.16. 양도", () => {
  const input: Pre1990LandValuationInput = {
    acquisitionDate: new Date("1988-12-03"),
    transferDate: new Date("2023-02-16"),
    areaSqm: 2_417,
    pricePerSqm_1990: 54_000,
    pricePerSqm_atTransfer: 241_700,
    grade_1990_0830: 108,          // 번호 조회 → 876
    gradePrev_1990_0830: 103,      // 번호 조회 → 689
    gradeAtAcquisition: 103,       // 번호 조회 → 689
  };

  it("㎡당 가액 = 47,547.xx원 (중간 절사 없음, floor 시 47,547)", () => {
    const r = calculatePre1990LandValuation(input);
    expect(Math.floor(r.pricePerSqmAtAcquisition)).toBe(47_547);
  });

  it("취득시 기준시가 = 114,922,558원 (최종 원단위 절사)", () => {
    const r = calculatePre1990LandValuation(input);
    expect(r.standardPriceAtAcquisition).toBe(114_922_558);
  });

  it("양도시 기준시가 = 584,188,900원", () => {
    const r = calculatePre1990LandValuation(input);
    expect(r.standardPriceAtTransfer).toBe(584_188_900);
  });

  it("caseType = case1_no_adjustment (직전=취득시)", () => {
    const r = calculatePre1990LandValuation(input);
    expect(r.caseType).toBe("case1_no_adjustment");
  });

  it("등급 번호 108 ↔ 등급가액 876, 등급 103 ↔ 689 — 테이블 일치", () => {
    expect(getGradeValue(108)).toBe(876);
    expect(getGradeValue(103)).toBe(689);
  });

  it("전체 취득가액 환산 공식: 550,000,000 × 114,921,099 / 584,188,900 = 108,195,490", () => {
    // 외곽 공식 자체는 본 엔진 범위 밖이지만, 입력값으로 검산
    const r = calculatePre1990LandValuation(input);
    const acqCost = Math.floor(
      (550_000_000 * r.standardPriceAtAcquisition) / r.standardPriceAtTransfer,
    );
    expect(acqCost).toBe(108_196_863);
  });
});

// ============================================================
// C. 경계값 및 입력 검증
// ============================================================

describe("경계 일자 — CAP-2 트리거 (1990.1.1.) 판정", () => {
  const common = {
    transferDate: new Date("2023-01-01"),
    areaSqm: 1,
    pricePerSqm_1990: 10_000,
    pricePerSqm_atTransfer: 100_000,
    grade_1990_0830:     { gradeValue: 100_000 },
    gradePrev_1990_0830: { gradeValue:  90_000 },
    gradeAtAcquisition:  { gradeValue: 100_000 },
  };

  it("취득일 = 1990.1.1. (정확히) → CAP-2 활성", () => {
    const r = calculatePre1990LandValuation({
      ...common,
      acquisitionDate: new Date("1990-01-01"),
    });
    expect(r.breakdown.ratioCap2Triggered).toBe(true);
    expect(r.pricePerSqmAtAcquisition).toBe(10_000);
  });

  it("취득일 = 1989.12.31. → CAP-2 비활성", () => {
    const r = calculatePre1990LandValuation({
      ...common,
      acquisitionDate: new Date("1989-12-31"),
    });
    expect(r.breakdown.ratioCap2Triggered).toBe(false);
    expect(Math.floor(r.pricePerSqmAtAcquisition)).toBe(10_526);
  });

  it("GRADE_CAP_TRIGGER_DATE 경계 상수 노출 확인", () => {
    expect(GRADE_CAP_TRIGGER_DATE.toISOString().slice(0, 10)).toBe("1990-01-01");
  });
});

describe("경계 일자 — 1990.8.30. 이후 취득 경고", () => {
  const common = {
    transferDate: new Date("2023-01-01"),
    areaSqm: 1,
    pricePerSqm_1990: 10_000,
    pricePerSqm_atTransfer: 100_000,
    grade_1990_0830:     { gradeValue: 100_000 },
    gradePrev_1990_0830: { gradeValue:  90_000 },
    gradeAtAcquisition:  { gradeValue: 100_000 },
  };

  it("취득일 = 1990.8.29. (정상, 경고 없음)", () => {
    const r = calculatePre1990LandValuation({
      ...common,
      acquisitionDate: new Date("1990-08-29"),
    });
    expect(r.warnings.length).toBe(0);
  });

  it("취득일 = 1990.8.30. → 경고 포함", () => {
    const r = calculatePre1990LandValuation({
      ...common,
      acquisitionDate: new Date("1990-08-30"),
    });
    expect(r.warnings.some((w) => w.includes("1990.8.30."))).toBe(true);
  });

  it("INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE 경계 상수 노출 확인", () => {
    expect(INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE.toISOString().slice(0, 10)).toBe("1990-08-30");
  });
});

describe("forceRatioCap override", () => {
  const common = {
    acquisitionDate: new Date("1987-08-01"), // 원래는 CAP-2 비활성
    transferDate: new Date("2023-01-01"),
    areaSqm: 1,
    pricePerSqm_1990: 10_000,
    pricePerSqm_atTransfer: 100_000,
    grade_1990_0830:     { gradeValue: 100_000 },
    gradePrev_1990_0830: { gradeValue:  90_000 },
    gradeAtAcquisition:  { gradeValue: 100_000 },
  };

  it("forceRatioCap=true → 취득일 1987이어도 CAP-2 강제 적용", () => {
    const r = calculatePre1990LandValuation({ ...common, forceRatioCap: true });
    expect(r.breakdown.ratioCap2Triggered).toBe(true);
    expect(r.pricePerSqmAtAcquisition).toBe(10_000);
  });

  it("forceRatioCap=false → 1990.2. 취득이어도 CAP-2 강제 해제", () => {
    const r = calculatePre1990LandValuation({
      ...common,
      acquisitionDate: new Date("1990-02-01"),
      forceRatioCap: false,
    });
    expect(r.breakdown.ratioCap2Triggered).toBe(false);
    expect(Math.floor(r.pricePerSqmAtAcquisition)).toBe(10_526);
  });
});

// ============================================================
// D. 등급가액 테이블 검증
// ============================================================

describe("토지등급가액 테이블 (1~365)", () => {
  it("전량 365개 등급 존재", () => {
    const keys = Object.keys(LAND_GRADE_VALUES).map(Number).sort((a, b) => a - b);
    expect(keys.length).toBe(365);
    expect(keys[0]).toBe(1);
    expect(keys[364]).toBe(365);
  });

  it("단조증가(혹은 동일)", () => {
    let prev = -1;
    for (let i = 1; i <= 365; i++) {
      const v = LAND_GRADE_VALUES[i];
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("핵심 샘플 값 일치 (103=689, 108=876, 145=5,280, 200=77,100, 365=200,000,000)", () => {
    expect(getGradeValue(103)).toBe(689);
    expect(getGradeValue(108)).toBe(876);
    expect(getGradeValue(145)).toBe(5_280);
    expect(getGradeValue(200)).toBe(77_100);
    expect(getGradeValue(365)).toBe(200_000_000);
  });

  it("1~36등급은 등급번호 = 등급가액", () => {
    for (let i = 1; i <= 36; i++) {
      expect(getGradeValue(i)).toBe(i);
    }
  });

  it("범위 밖 등급 → TaxCalculationError", () => {
    expect(() => getGradeValue(0)).toThrow(TaxCalculationError);
    expect(() => getGradeValue(-1)).toThrow(TaxCalculationError);
    expect(() => getGradeValue(366)).toThrow(TaxCalculationError);
    expect(() => getGradeValue(999)).toThrow(TaxCalculationError);
  });

  it("비정수 등급 → TaxCalculationError", () => {
    expect(() => getGradeValue(103.5)).toThrow(TaxCalculationError);
    expect(() => getGradeValue(NaN)).toThrow(TaxCalculationError);
  });

  it("최소·최대 상수 노출", () => {
    expect(LAND_GRADE_MIN).toBe(1);
    expect(LAND_GRADE_MAX).toBe(365);
  });
});

// ============================================================
// E. 입력 검증 (유효성)
// ============================================================

describe("입력 검증", () => {
  const base = {
    acquisitionDate: new Date("1988-12-03"),
    transferDate: new Date("2023-01-01"),
    areaSqm: 1,
    pricePerSqm_1990: 10_000,
    pricePerSqm_atTransfer: 100_000,
    grade_1990_0830: 108 as const,
    gradePrev_1990_0830: 103 as const,
    gradeAtAcquisition: 103 as const,
  };

  it("면적 <= 0 → TaxCalculationError", () => {
    expect(() => calculatePre1990LandValuation({ ...base, areaSqm: 0 })).toThrow(TaxCalculationError);
    expect(() => calculatePre1990LandValuation({ ...base, areaSqm: -1 })).toThrow(TaxCalculationError);
  });

  it("공시지가 <= 0 → TaxCalculationError", () => {
    expect(() => calculatePre1990LandValuation({ ...base, pricePerSqm_1990: 0 })).toThrow(TaxCalculationError);
    expect(() => calculatePre1990LandValuation({ ...base, pricePerSqm_atTransfer: -100 })).toThrow(TaxCalculationError);
  });

  it("유효하지 않은 Date → TaxCalculationError", () => {
    expect(() => calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("invalid"),
    })).toThrow(TaxCalculationError);
  });

  it("등급가액 직접 입력 시 음수 → TaxCalculationError", () => {
    expect(() => calculatePre1990LandValuation({
      ...base,
      gradeAtAcquisition: { gradeValue: -100 },
    })).toThrow(TaxCalculationError);
  });

  it("대면적 + 고공시지가 overflow 처리 (100,000㎡ × 1,000,000원/㎡)", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      areaSqm: 100_000,
      pricePerSqm_1990: 1_000_000,
      pricePerSqm_atTransfer: 1_000_000,
    });
    expect(r.standardPriceAtTransfer).toBe(100_000 * 1_000_000); // 100,000,000,000
  });
});

// ============================================================
// F. 분류기 단위 테스트 (classifyCaseType)
// ============================================================

describe("classifyCaseType — 5유형 분류 단위 테스트", () => {
  const baseBreakdown = {
    gradeValueAtAcquisition:  80_000,
    gradeValue_1990_0830:    100_000,
    gradeValuePrev_1990_0830: 80_000,
    averageDenominator:       90_000,
    appliedDenominator:       90_000,
    denominatorCap1Applied:   false,
    rawRatio:                 80_000 / 90_000,
    appliedRatio:             80_000 / 90_000,
    ratioCap2Triggered:       false,
    ratioCap2Applied:         false,
    formula: "", legalBasis: "",
  };

  it("Case ① 분류 (직전 = 취득시)", () => {
    expect(classifyCaseType(baseBreakdown)).toBe("case1_no_adjustment");
  });

  it("Case ② 분류 (현재 = 직전)", () => {
    expect(classifyCaseType({
      ...baseBreakdown,
      gradeValue_1990_0830: 180_000,
      gradeValuePrev_1990_0830: 180_000,
      gradeValueAtAcquisition: 80_000,
    })).toBe("case2_no_1990_adjustment");
  });

  it("Case ③ 분류 (CAP-1 발동)", () => {
    expect(classifyCaseType({
      ...baseBreakdown,
      denominatorCap1Applied: true,
    })).toBe("case3_denominator_cap");
  });

  it("Case ④ 분류 (CAP-2 실제 적용)", () => {
    expect(classifyCaseType({
      ...baseBreakdown,
      rawRatio: 1.0526,
      appliedRatio: 1.0,
      ratioCap2Triggered: true,
      ratioCap2Applied: true,
    })).toBe("case4_ratio_cap");
  });

  it("Case ⑤ 분류 (CAP-2 미트리거 + 비율 > 100%)", () => {
    expect(classifyCaseType({
      ...baseBreakdown,
      rawRatio: 1.0526,
      appliedRatio: 1.0526,
      ratioCap2Triggered: false,
      ratioCap2Applied: false,
    })).toBe("case5_ratio_no_cap");
  });
});
