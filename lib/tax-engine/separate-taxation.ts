/**
 * 재산세 분리과세대상 판정 및 세액 계산 엔진 (P5-02~08)
 *
 * 지방세법 §106①3호    — 분리과세대상 (종합합산·별도합산 배제)
 * 지방세법 시행령 §102  — 분리과세 대상 범위 (저율·일반·중과)
 * 지방세법 §111①1호 다목 — 분리과세 세율 0.07%/0.2%/4%
 * 지방세법 §113①2호   — 과세표준: 시가표준액 × 70%, 천원 절사
 *
 * 분리과세 법적 성격:
 *   - 종합합산·별도합산과 배제: 소유자별 합산 없이 건별 단일세율 과세
 *   - 종합부동산세 배제: 분리과세 토지는 종부세 과세대상 아님 (종부세법 §11)
 *   - 누진세율 미적용: 단일세율 과세
 *
 * 판정 우선순위: 중과(4%) → 저율(0.07%) → 일반(0.2%) → 비해당
 */

import { applyRate, truncateToThousand } from "./tax-utils";
import { PROPERTY } from "./legal-codes";

// ============================================================
// P5-02: 타입 정의
// ============================================================

/**
 * 분리과세 세율 구간
 * - low_rate : 0.07% — 자경 농지·목장용지·보전산지
 * - standard : 0.2%  — 공장용지·염전·터미널·공영주차장
 * - heavy    : 4%    — 회원제 골프장·고급오락장
 */
export type SeparateTaxationCategory = "low_rate" | "standard" | "heavy";

/**
 * 골프장 유형
 * - member : 회원제 → 중과(4%)
 * - public : 대중제 → 중과 배제
 * - simple : 간이   → 중과 배제
 */
export type GolfCourseType = "member" | "public" | "simple";

/**
 * 분리과세 판정 입력
 */
export interface SeparateTaxationInput {
  // ── 기본 정보 ──
  /** 시가표준액 (원) — 과세표준 계산 기초 */
  assessedValue: number;
  /** 지목 코드 (예: "전", "답", "과수원", "임야", "잡종지") */
  landCategory?: string;
  /** 실제 사용 현황 (판정 근거 기록용) */
  actualUsage?: string;

  // ── 저율(0.07%) 판정용 ──
  /** 농지 자경 요건 충족 (농지원부 등재 + 사실상 자경) */
  isFarmland?: boolean;
  /** 목장용지 + 축산업 등록 + 기준면적 이내 */
  isLivestockFarm?: boolean;
  /** 공익용 보전산지·임업후계림 */
  isProtectedForest?: boolean;

  // ── 일반(0.2%) 판정용 ──
  /** 공장용지 (산업단지·지정 공업지역 내, 기준면적 이내) */
  isFactoryLand?: boolean;
  /** 공장 입지 유형 */
  factoryLocation?: "industrial_zone" | "urban" | "other";
  /** 염전 (염화나트륨 생산에 직접 사용) */
  isSaltField?: boolean;
  /** 여객·화물터미널 또는 공영주차장 부속토지 */
  isTerminalOrParking?: boolean;

  // ── 중과(4%) 판정용 ──
  /** 골프장 부속토지 여부 */
  isGolfCourse?: boolean;
  /**
   * 골프장 유형 — 미입력 시 경고 후 보수적으로 중과 미적용
   * member: 회원제(중과) / public: 대중제(배제) / simple: 간이(배제)
   */
  golfCourseType?: GolfCourseType;
  /** 고급오락장 (카지노·유흥주점 등) 부속토지 */
  isHighClassEntertainment?: boolean;

  // ── 공통 ──
  /** 토지 면적 (㎡) — 기준면적 초과 여부 참고 */
  area?: number;
  /** 소유자 유형 */
  ownerType?: "individual" | "corporation";
}

/**
 * 분리과세 판정 결과
 */
export interface SeparateTaxationResult {
  /** 분리과세 대상 여부 */
  isApplicable: boolean;
  /** 분리과세 구간 */
  category?: SeparateTaxationCategory;
  /** 적용 세율 (0.0007 / 0.002 / 0.04) */
  appliedRate?: number;

  /** 과세표준 = 시가표준액 × 70%, 천원 절사 (calculateSeparateTaxationTax 호출 후 채워짐) */
  taxBase?: number;
  /** 공정시장가액비율 (0.70) */
  fairMarketRatio?: number;
  /** 산출세액 = 과세표준 × 단일세율, 원 미만 절사 */
  calculatedTax?: number;

  /** 판정 근거 */
  reasoning: {
    /** PROPERTY.SEPARATE.* 법령 상수 */
    legalBasis: string;
    /** 판정된 구체 조건 설명 */
    matchedCondition: string;
    /**
     * 배제된 합산 유형
     * - comprehensive      : 종합합산에서 배제
     * - special_aggregated : 별도합산에서 배제
     */
    excludedFrom: ("comprehensive" | "special_aggregated")[];
  };

  /** 감면 특례 (해당 시) */
  reduction?: {
    reductionRate: number;
    reducedTaxAmount: number;
    legalBasis: string;
  };

  warnings: string[];
}

// ============================================================
// 내부 상수
// ============================================================

/** 분리과세 공정시장가액비율 (70%) */
const FAIR_MARKET_RATIO = 0.70;
/** 저율 세율 (0.07%) */
const RATE_LOW   = 0.0007;
/** 일반 세율 (0.2%) */
const RATE_STD   = 0.002;
/** 중과 세율 (4%) */
const RATE_HEAVY = 0.04;

// ============================================================
// P5-03: 저율(0.07%) 판정 — 농지·목장·보전산지
// ============================================================

type ClassifyPartial = {
  isApplicable: true;
  category: SeparateTaxationCategory;
  appliedRate: number;
  reasoning: SeparateTaxationResult["reasoning"];
} | null;

/**
 * 저율(0.07%) 분리과세 판정 (지방세법 §111①1호 다목(1), 시행령 §102①)
 *
 * 판정 순서:
 * 1. 농지 자경 (isFarmland)
 * 2. 목장용지 (isLivestockFarm)
 * 3. 보전산지 (isProtectedForest)
 */
function classifyLowRate(input: SeparateTaxationInput): ClassifyPartial {
  if (input.isFarmland) {
    return {
      isApplicable: true,
      category: "low_rate",
      appliedRate: RATE_LOW,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.LOW_RATE_FARMLAND,
        matchedCondition: "농지원부 등재 + 사실상 자경 농지 (전·답·과수원)",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  if (input.isLivestockFarm) {
    return {
      isApplicable: true,
      category: "low_rate",
      appliedRate: RATE_LOW,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.LOW_RATE_LIVESTOCK,
        matchedCondition: "축산업 등록 목장용지 (기준면적 이내)",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  if (input.isProtectedForest) {
    return {
      isApplicable: true,
      category: "low_rate",
      appliedRate: RATE_LOW,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.LOW_RATE_FOREST,
        matchedCondition: "공익용 보전산지 또는 임업후계림",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  return null;
}

// ============================================================
// P5-04: 일반(0.2%) 판정 — 공장·염전·터미널·주차장
// ============================================================

/**
 * 일반(0.2%) 분리과세 판정 (지방세법 시행령 §102②)
 *
 * 판정 순서:
 * 1. 공장용지 (isFactoryLand) — 도시지역 공장 기준면적 초과 경고
 * 2. 염전 (isSaltField)
 * 3. 터미널·공영주차장 (isTerminalOrParking)
 */
function classifyStandard(
  input: SeparateTaxationInput,
  warnings: string[],
): ClassifyPartial {
  if (input.isFactoryLand) {
    if (input.factoryLocation === "urban") {
      warnings.push(
        "도시지역 내 공장용지는 기준면적 초과 시 별도합산과세 대상으로 전환될 수 있습니다. " +
        "기준면적 이내 여부를 확인하세요.",
      );
    }
    return {
      isApplicable: true,
      category: "standard",
      appliedRate: RATE_STD,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.STANDARD_FACTORY,
        matchedCondition: "산업단지·지정 공업지역 내 공장용지 (기준면적 이내)",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  if (input.isSaltField) {
    return {
      isApplicable: true,
      category: "standard",
      appliedRate: RATE_STD,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.STANDARD_SALT_FIELD,
        matchedCondition: "염화나트륨 생산에 직접 사용되는 염전",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  if (input.isTerminalOrParking) {
    return {
      isApplicable: true,
      category: "standard",
      appliedRate: RATE_STD,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.STANDARD_TERMINAL,
        matchedCondition: "여객·화물터미널 또는 공영주차장 부속토지",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  return null;
}

// ============================================================
// P5-05: 중과(4%) 판정 — 회원제 골프장·고급오락장
// ============================================================

/**
 * 중과(4%) 분리과세 판정 (지방세법 §111①1호 다목(3))
 *
 * - 회원제 골프장: golfCourseType === "member" 시 중과 적용
 * - 대중제·간이 골프장: 중과 배제 + 경고
 * - golfCourseType 미입력: 경고 후 보수적으로 중과 미적용
 * - 고급오락장: isHighClassEntertainment === true 시 중과 적용
 */
function classifyHeavy(
  input: SeparateTaxationInput,
  warnings: string[],
): ClassifyPartial {
  if (input.isGolfCourse) {
    if (!input.golfCourseType) {
      warnings.push(
        "골프장 유형(golfCourseType)이 입력되지 않았습니다. " +
        "회원제(4% 중과)·대중제(배제)·간이(배제)를 확인하여 입력하세요. " +
        "현재는 중과를 적용하지 않습니다.",
      );
      return null;
    }

    if (input.golfCourseType === "member") {
      return {
        isApplicable: true,
        category: "heavy",
        appliedRate: RATE_HEAVY,
        reasoning: {
          legalBasis: PROPERTY.SEPARATE.HEAVY_GOLF_MEMBER,
          matchedCondition: "회원제 골프장 부속토지 (체육시설법상 회원제)",
          excludedFrom: ["comprehensive", "special_aggregated"],
        },
      };
    }

    // 대중제 또는 간이 → 중과 배제
    warnings.push(
      `${input.golfCourseType === "public" ? "대중제" : "간이"} 골프장은 중과(4%) 대상이 아닙니다. ` +
      "별도합산 또는 일반 분리과세(0.2%) 적용 여부를 별도 검토하세요.",
    );
    return null;
  }

  if (input.isHighClassEntertainment) {
    return {
      isApplicable: true,
      category: "heavy",
      appliedRate: RATE_HEAVY,
      reasoning: {
        legalBasis: PROPERTY.SEPARATE.HEAVY_ENTERTAINMENT,
        matchedCondition: "고급오락장(카지노·유흥주점 등) 부속토지",
        excludedFrom: ["comprehensive", "special_aggregated"],
      },
    };
  }

  return null;
}

// ============================================================
// P5-06: classifySeparateTaxation — 통합 판정
// ============================================================

/**
 * 분리과세 통합 판정 (지방세법 §106①3호)
 *
 * 판정 우선순위 (엄수): 중과(4%) → 저율(0.07%) → 일반(0.2%) → 비해당
 *
 * 분리과세 해당 시 reasoning.excludedFrom에
 * ['comprehensive', 'special_aggregated'] 포함.
 *
 * @param input SeparateTaxationInput
 * @returns SeparateTaxationResult (taxBase·calculatedTax 미포함 — 세액 계산은 calculateSeparateTaxationTax)
 */
export function classifySeparateTaxation(
  input: SeparateTaxationInput,
): SeparateTaxationResult {
  const warnings: string[] = [];

  // 1. 중과(4%) 우선
  const heavyResult = classifyHeavy(input, warnings);
  if (heavyResult) return { ...heavyResult, warnings };

  // 2. 저율(0.07%)
  const lowRateResult = classifyLowRate(input);
  if (lowRateResult) return { ...lowRateResult, warnings };

  // 3. 일반(0.2%)
  const standardResult = classifyStandard(input, warnings);
  if (standardResult) return { ...standardResult, warnings };

  // 4. 분리과세 비해당
  return {
    isApplicable: false,
    reasoning: {
      legalBasis: "",
      matchedCondition: "분리과세 조건 미충족 — 종합합산 또는 별도합산 판정 필요",
      excludedFrom: [],
    },
    warnings,
  };
}

// ============================================================
// P5-07: calculateSeparateTaxationTax — 세액 계산
// ============================================================

/**
 * 분리과세 토지 세액 계산 (지방세법 §113①2호)
 *
 * 계산 순서:
 * 1. 과세표준 = 시가표준액(assessedValue) × 공정시장가액비율(70%)
 * 2. 과세표준 → 천원 절사
 * 3. 산출세액 = 과세표준 × 단일세율, 원 미만 절사
 *
 * 오차 보증:
 * - 천원 절사: Math.floor(x / 1000) × 1000
 * - 세액 절사: Math.floor(taxBase × rate)
 *
 * @param classification classifySeparateTaxation(input) 결과
 * @param assessedValue  시가표준액 (원) — input.assessedValue
 * @returns SeparateTaxationResult (taxBase·calculatedTax 포함)
 */
export function calculateSeparateTaxationTax(
  classification: SeparateTaxationResult,
  assessedValue: number,
): SeparateTaxationResult {
  if (!classification.isApplicable || classification.appliedRate === undefined) {
    return classification;
  }

  const fairMarketRatio = FAIR_MARKET_RATIO;

  // Step 1: 시가표준액 × 70%
  const rawTaxBase = applyRate(assessedValue, fairMarketRatio);

  // Step 2: 천원 절사
  const taxBase = truncateToThousand(rawTaxBase);

  // Step 3: 세액 = 과세표준 × 단일세율, 원 미만 절사 (P0-2: applyRate 사용)
  const calculatedTax = applyRate(taxBase, classification.appliedRate);

  return {
    ...classification,
    taxBase,
    fairMarketRatio,
    calculatedTax,
  };
}

// ============================================================
// P5-08: 종부세 배제 플래그
// ============================================================

/**
 * 분리과세 토지의 종합부동산세 배제 여부 판정
 *
 * 지방세법상 분리과세 토지(§106①3호)는 종합부동산세 과세대상 아님.
 * (종합부동산세법 §11 — 분리과세 토지는 합산 대상에서 제외)
 *
 * 호출자(comprehensive-tax.ts)에서 이 플래그를 확인하여
 * 분리과세 토지를 종부세 집계에서 제외해야 합니다.
 *
 * @param result classifySeparateTaxation() 또는 calculateSeparateTaxationTax() 결과
 * @returns true이면 종부세 과세 제외 대상
 *
 * @example
 * ```typescript
 * import { classifySeparateTaxation, isExcludedFromComprehensiveTax } from './separate-taxation';
 *
 * const classification = classifySeparateTaxation(input);
 * if (isExcludedFromComprehensiveTax(classification)) {
 *   // 이 토지는 종부세 합산에서 제외
 * }
 * ```
 */
export function isExcludedFromComprehensiveTax(
  result: SeparateTaxationResult,
): boolean {
  return (
    result.isApplicable &&
    result.reasoning.excludedFrom.includes("comprehensive")
  );
}

// ============================================================
// 편의 함수
// ============================================================

/**
 * 분리과세 판정 + 세액 계산 통합
 *
 * classifySeparateTaxation() + calculateSeparateTaxationTax() 순차 실행.
 * 단계 분리 불필요 시 사용.
 *
 * @param input SeparateTaxationInput
 * @returns SeparateTaxationResult (taxBase·calculatedTax 포함)
 */
export function calculateSeparateTax(
  input: SeparateTaxationInput,
): SeparateTaxationResult {
  const classification = classifySeparateTaxation(input);
  return calculateSeparateTaxationTax(classification, input.assessedValue);
}
