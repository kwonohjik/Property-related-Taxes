/**
 * 재산세 별도합산과세대상 판정 및 계산 엔진 (P4-04~07, P4-13)
 *
 * 지방세법 §106①2호  — 별도합산과세대상 (영업용 건축물 부속토지)
 * 지방세법 시행령 §101 — 기준면적 산정 (바닥면적 × 용도지역 배율 or 공장입지기준면적)
 * 지방세법 시행령 §103의2 1호 — 철거·멸실 후 1년 이내 별도합산 유지 특례
 * 지방세법 §111①1호 나목 — 별도합산 누진세율 0.2%~0.4%
 * 지방세법 §113         — 인별 전국 합산
 * 지방세법 §122         — 세부담 상한 150%
 *
 * 판정 4단계 우선순위:
 *   1. 분리과세 제외 여부 (이미 상위에서 처리, 여기서는 수신 데이터가 분리과세 비해당이어야 함)
 *   2. 건축물 존재 여부 (없으면 → 종합합산)
 *   3. 철거·멸실 후 1년 이내 특례 확인
 *   4. 기준면적 내/초과 면적 분리
 *
 * 핵심 원칙:
 *   - 인별 전국 합산: 동일 납세자 전국 별도합산 토지 공시지가 합산
 *   - 초과분 → 종합합산 이관 (별도합산 세율 미적용)
 *   - 누진세율 1회 적용 후 지자체별 안분 (세율 재적용 금지)
 *   - DB 세율 맵 fallback: 상수(PROPERTY_SEPARATE_CONST) 사용 (P4-13)
 */

import { applyRate, truncateToThousand } from "./tax-utils";
import { applyFairMarketRatio } from "./tax-utils";
import { PROPERTY_SEPARATE, PROPERTY_SEPARATE_CONST } from "./legal-codes";
import { getZoneAreaMultiplier } from "./local-tax-zone-multiplier";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { getCurrentPropertyRateSet } from "./data/property-rate-history";
import type { PropertyRateSet } from "./data/property-rate-history";

// ============================================================
// 타입 정의
// ============================================================

/**
 * 용도지역 코드 — 「지방세법 시행령」 제101조 제2항 [표] 구분.
 *
 * 배율 정본은 `local-tax-zone-multiplier.ts`. 주거지역은 전용(5배)·일반(4배)·준주거(3배)가
 * 모두 달라 통합 `residential` 키로는 배율을 결정할 수 없으므로 **세분 값만 허용**한다.
 */
export type ZoningDistrict =
  | "exclusive_residential" // 전용주거지역 5배
  | "semi_residential"      // 준주거지역 3배
  | "commercial"            // 상업지역 3배
  | "general_residential"   // 일반주거지역 4배
  | "industrial"            // 공업지역 4배
  | "green"                 // 녹지지역 7배
  | "unplanned"             // 미계획지역 4배
  | "management"            // 관리지역 (도시지역 외) 7배
  | "agricultural"          // 농림지역 (도시지역 외) 7배
  | "nature_preserve";      // 자연환경보전지역 (도시지역 외) 7배

/** 단일 필지 입력 */
export interface SeparateAggregateLandItem {
  /** 필지 식별자 */
  id: string;
  /** 관할 지자체 코드 */
  jurisdictionCode: string;
  /** 토지 면적 (㎡) */
  landArea: number;
  /** 개별공시지가 (원/㎡) */
  officialLandPrice: number;
  /** 용도지역 */
  zoningDistrict: ZoningDistrict;
  /** 건축물 바닥면적 (㎡) — 기준면적 계산 기초 */
  buildingFloorArea?: number;
  /** 공장용지 여부 */
  isFactory?: boolean;
  /** 공장입지기준면적 (㎡) — 공장용지의 별도합산 한도 */
  factoryStandardArea?: number;
  /** 건축물 철거 여부 */
  demolished?: boolean;
  /** 철거일 (YYYY-MM-DD) */
  demolishedDate?: string;
  /** 과세기준일 (YYYY-MM-DD, 기본: 당해년도 6월 1일) */
  taxBaseDate?: string;
}

/** 별도합산 계산 입력 */
export interface SeparateAggregateInput {
  /** 납세자 식별자 */
  taxpayerId: string;
  /** 과세연도 */
  targetYear: number;
  /** 전국 보유 별도합산 대상 토지 목록 */
  landList: SeparateAggregateLandItem[];
  /** 전년도 세부담 상당세액 (세부담상한용, 없으면 상한 미적용) */
  previousYearTax?: number;
}

/** 단일 필지 별도합산 판정 결과 */
export interface LandSeparateCheckResult {
  landId: string;
  /** 별도합산 인정 여부 */
  isSeparateAggregate: boolean;
  /** 별도합산 인정 면적 (㎡) */
  recognizedArea: number;
  /** 종합합산 이관 초과 면적 (㎡) */
  excessArea: number;
  /** 적용 기준면적 (㎡) */
  baseArea: number;
  /** 적용 배율 (공장: 0 = 공장입지기준면적 직접 적용) */
  multiplier: number;
  /** 철거 특례 적용 여부 */
  demolishedGraceApplied: boolean;
  /** 판정 근거 법령 상수 */
  legalBasis: string;
  /** 경고 메시지 */
  warnings: string[];
}

/** 지자체별 안분 결과 */
export interface JurisdictionSeparateAllocation {
  jurisdictionCode: string;
  /** 해당 지자체 별도합산 인정분 공시지가 합계 */
  allocatedOfficialValue: number;
  /** 안분 비율 (0~1) */
  allocationRatio: number;
  /** 안분 세액 (원) */
  allocatedTax: number;
}

/** 면적·가액 분리 결과 */
export interface SplitResult {
  landId: string;
  /** 별도합산 인정분 공시지가 (원) */
  separateOfficialValue: number;
  /** 종합합산 이관분 공시지가 (원) */
  excessOfficialValue: number;
}

/** 별도합산과세 계산 최종 결과 */
export interface SeparateAggregateResult {
  // ── 필지별 판정 ──
  landChecks: LandSeparateCheckResult[];

  // ── 별도합산 집계 ──
  /** 별도합산 인정분 공시지가 합계 */
  totalSeparateOfficialValue: number;
  /** 종합합산 이관분 공시지가 합계 (초과분) */
  totalExcessOfficialValue: number;
  /** 공정시장가액비율 (0.70) */
  fairMarketValueRatio: number;
  /** 전국 합산 별도합산 과세표준 (원) */
  taxBase: number;

  // ── 세액 계산 ──
  /** 산출세액 (누진세율 적용) */
  grossTax: number;
  /** 세부담상한 적용 후 세액 */
  taxAfterCap: number;
  /** 적용 상한율 (1.50, 미적용 시 undefined) */
  appliedCapRate?: number;

  // ── 지자체별 안분 ──
  jurisdictionAllocation: JurisdictionSeparateAllocation[];

  // ── 메타 ──
  legalBasis: string[];
  warnings: string[];
}

// ============================================================
// P4-04: isSeparateAggregateLand — 4단계 판정
// ============================================================

/**
 * 단일 필지 별도합산 판정 (지방세법 §106①2호, 시행령 §101)
 *
 * 판정 4단계:
 * 1. 건축물 없음 → 종합합산 (별도합산 불가)
 * 2. 철거 후 과세기준일까지 경과월 계산 → 1년 이내: 별도합산 유지 (§103의2 1호 특례)
 * 3. 철거 후 1년 초과 → 나대지 처리 → 종합합산
 * 4. 기준면적 계산 → 이내: 별도합산 / 초과: split
 */
export function isSeparateAggregateLand(
  land: SeparateAggregateLandItem,
): LandSeparateCheckResult {
  const warnings: string[] = [];
  const taxBaseDate = land.taxBaseDate ?? deriveDefaultTaxBaseDate(land);

  // ── 1단계: 건축물 존재 여부 ──
  const hasBuilding =
    (land.buildingFloorArea !== undefined && land.buildingFloorArea > 0) ||
    (land.isFactory && land.factoryStandardArea !== undefined && land.factoryStandardArea > 0) ||
    land.demolished === true; // 철거 중인 경우도 건축물 존재로 처리 (특례 판단 대상)

  if (!hasBuilding) {
    return {
      landId: land.id,
      isSeparateAggregate: false,
      recognizedArea: 0,
      excessArea: land.landArea,
      baseArea: 0,
      multiplier: 0,
      demolishedGraceApplied: false,
      legalBasis: PROPERTY_SEPARATE.SUBJECT,
      warnings: ["건축물이 없는 토지는 종합합산과세대상입니다."],
    };
  }

  // ── 2~3단계: 철거 특례 판정 ──
  if (land.demolished === true) {
    const graceMonths = PROPERTY_SEPARATE_CONST.DEMOLISHED_GRACE_MONTHS;
    // 표시용: 완성된 월 수 (floor)
    const elapsedMonths = calcElapsedMonths(land.demolishedDate ?? "", taxBaseDate);

    if (elapsedMonths < 0) {
      // demolishedDate 미입력 또는 파싱 오류 → 보수적으로 종합합산
      warnings.push(
        "철거일(demolishedDate)을 확인할 수 없어 종합합산으로 처리합니다.",
      );
      return {
        landId: land.id,
        isSeparateAggregate: false,
        recognizedArea: 0,
        excessArea: land.landArea,
        baseArea: 0,
        multiplier: 0,
        demolishedGraceApplied: false,
        legalBasis: PROPERTY_SEPARATE.SUBJECT,
        warnings,
      };
    }

    // H-05: 일(day) 수준 정밀 판정 — 철거일 + 유예기간(1년) 경계를 날짜 직접 비교
    // (완성 월 수만으로는 1년+1일 케이스가 초과 판정 안 되는 버그 수정)
    const demolishDateObj = new Date(land.demolishedDate ?? "");
    const gracePeriodEnd = new Date(demolishDateObj);
    gracePeriodEnd.setMonth(gracePeriodEnd.getMonth() + graceMonths);
    const baseDateObj = new Date(taxBaseDate);
    const isGraceExceeded = !isNaN(gracePeriodEnd.getTime()) && baseDateObj > gracePeriodEnd;

    if (isGraceExceeded) {
      // 유예기간 초과 → 나대지 → 종합합산
      return {
        landId: land.id,
        isSeparateAggregate: false,
        recognizedArea: 0,
        excessArea: land.landArea,
        baseArea: 0,
        multiplier: 0,
        demolishedGraceApplied: false,
        legalBasis: PROPERTY_SEPARATE.DEMOLISHED_GRACE,
        warnings: [
          `건축물 철거 후 ${elapsedMonths}개월 경과 — 유예기간(${graceMonths}개월) 초과로 종합합산 처리됩니다.`,
        ],
      };
    }

    // 유예기간 이내 → 철거 전 기준면적 유지 (§103의2 1호)
    warnings.push(
      `건축물 철거 후 ${elapsedMonths}개월 경과 — 유예기간(${graceMonths}개월) 이내이므로 별도합산 특례가 적용됩니다.`,
    );
  }

  // ── 4단계: 기준면적 계산 및 면적 분리 ──
  const { baseArea, multiplier, legalBasis: areaLegal } =
    calculateBaseArea(land);

  if (baseArea <= 0) {
    return {
      landId: land.id,
      isSeparateAggregate: false,
      recognizedArea: 0,
      excessArea: land.landArea,
      baseArea: 0,
      multiplier,
      demolishedGraceApplied: land.demolished === true,
      legalBasis: areaLegal,
      warnings: [...warnings, "기준면적을 산정할 수 없어 종합합산으로 처리합니다."],
    };
  }

  const recognizedArea = Math.min(land.landArea, baseArea);
  const excessArea = Math.max(0, land.landArea - baseArea);

  if (excessArea > 0) {
    warnings.push(
      `토지 ${land.landArea}㎡ 중 ${recognizedArea}㎡는 별도합산, ` +
      `${excessArea}㎡는 기준면적 초과로 종합합산에 이관됩니다.`,
    );
  }

  return {
    landId: land.id,
    isSeparateAggregate: recognizedArea > 0,
    recognizedArea,
    excessArea,
    baseArea,
    multiplier,
    demolishedGraceApplied: land.demolished === true,
    legalBasis: areaLegal,
    warnings,
  };
}

// ============================================================
// P4-05: calculateBaseArea — 용도지역 7종 배율 기준면적 계산
// ============================================================

/** 기준면적 계산 결과 */
interface BaseAreaResult {
  baseArea: number;
  multiplier: number;
  legalBasis: string;
}

/**
 * 기준면적 계산 (지방세법 시행령 §101②)
 *
 * 공장용지(§101①1호): 공장입지기준면적 입력 시 그 면적, 미입력 시 바닥면적 × 용도지역 배율
 * 공장용 외(§101①2호): buildingFloorArea × 용도지역 배율
 *
 * 배율은 `local-tax-zone-multiplier.ts`(§101② 표)가 단일 정본 — 여기서 재선언 금지.
 *
 * @throws 표에 없는 용도지역(세분 전 `residential` 등)은 배율 결정 불가 → 차단.
 *   추정 배율로 대체하면 기준면적이 과대·과소 산정되어 종합합산 이관 면적이 조용히 틀어진다.
 */
export function calculateBaseArea(land: SeparateAggregateLandItem): BaseAreaResult {
  const floorArea = land.buildingFloorArea ?? 0;

  // 공장용지: 공장입지기준면적 우선 적용
  if (land.isFactory) {
    if (land.factoryStandardArea && land.factoryStandardArea > 0) {
      return {
        baseArea: land.factoryStandardArea,
        multiplier: 0, // 직접 면적 적용이므로 배율 개념 없음
        legalBasis: PROPERTY_SEPARATE.BASE_AREA_FACTORY,
      };
    }
    // 미입력 → §101①1호 본칙(바닥면적 × 제2항 적용배율)으로 산정.
    // 종전에는 용도지역과 무관하게 공업지역 4배를 고정 적용했다.
    if (floorArea > 0) {
      const multiplier = resolveZoneMultiplier(land.zoningDistrict);
      return {
        baseArea: floorArea * multiplier,
        multiplier,
        legalBasis: PROPERTY_SEPARATE.BASE_AREA_FACTORY,
      };
    }
    return { baseArea: 0, multiplier: 0, legalBasis: PROPERTY_SEPARATE.BASE_AREA_FACTORY };
  }

  // 공장용 외 건축물: 바닥면적 × 용도지역 배율
  if (floorArea <= 0) {
    return { baseArea: 0, multiplier: 0, legalBasis: PROPERTY_SEPARATE.BASE_AREA_GENERAL };
  }

  const multiplier = resolveZoneMultiplier(land.zoningDistrict);
  return {
    baseArea: floorArea * multiplier,
    multiplier,
    legalBasis: PROPERTY_SEPARATE.BASE_AREA_GENERAL,
  };
}

/** §101② 표에서 적용배율을 조회한다. 미등재 용도지역은 추정하지 않고 차단한다. */
function resolveZoneMultiplier(zoningDistrict: string): number {
  const resolved = getZoneAreaMultiplier(zoningDistrict);
  if (!resolved) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `별도합산 기준면적 산정: 용도지역 "${zoningDistrict}"은 「지방세법 시행령」 제101조 제2항 ` +
        `적용배율표에 대응 항목이 없습니다. 세분된 용도지역(전용주거·일반주거·준주거 등)을 선택하세요.`,
    );
  }
  return resolved.multiplier;
}

// ============================================================
// P4-06: splitByBaseArea — 면적·가액 안분
// ============================================================

/**
 * 면적·가액 안분 (기준면적 이내 / 초과분)
 *
 * 공시지가 = 개별공시지가(원/㎡) × 면적(㎡)
 * 정수 연산 원칙: BigInt overflow guard 적용
 */
export function splitByBaseArea(
  land: SeparateAggregateLandItem,
  check: LandSeparateCheckResult,
): SplitResult {
  if (!check.isSeparateAggregate) {
    const totalValue = safeMultiplyArea(land.officialLandPrice, land.landArea);
    return {
      landId: land.id,
      separateOfficialValue: 0,
      excessOfficialValue: totalValue,
    };
  }

  const separateOfficialValue = safeMultiplyArea(
    land.officialLandPrice,
    check.recognizedArea,
  );
  const excessOfficialValue = safeMultiplyArea(
    land.officialLandPrice,
    check.excessArea,
  );

  return {
    landId: land.id,
    separateOfficialValue,
    excessOfficialValue,
  };
}

/** 면적(소수 허용, ㎡) × 단가(정수, 원/㎡) → 정수 변환 (overflow guard) */
function safeMultiplyArea(pricePerSqm: number, area: number): number {
  // 면적 소수점 2자리까지 허용 → ×100으로 정수화
  const areaInt = Math.round(area * 100);
  const result = BigInt(Math.round(pricePerSqm)) * BigInt(areaInt);
  return Number(result / BigInt(100));
}

// ============================================================
// P4-07: calculateSeparateAggregateTax — 누진세율 3구간
// ============================================================

/**
 * 별도합산 토지 세액 계산 (지방세법 §111①1호 나목)
 *
 * 세율표:
 * ┌─────────────┬────────┬───────────────┐
 * │ 과세표준    │ 세율   │ 누진공제       │
 * ├─────────────┼────────┼───────────────┤
 * │ ≤ 2억원     │ 0.2%  │ -             │
 * │ ≤ 10억원    │ 0.3%  │ 200,000원     │
 * │ > 10억원    │ 0.4%  │ 1,200,000원   │
 * └─────────────┴────────┴───────────────┘
 *
 * 계산 순서:
 * 1. 인별 전국 합산 별도합산 공시지가 합산
 * 2. × 공정시장가액비율(70%) → 천원 절사 → 과세표준
 * 3. 누진세율 적용 → 산출세액
 * 4. 세부담상한(150%) 적용
 * 5. 지자체별 안분 (세율 재적용 금지)
 *
 * DB 세율 맵 fallback (P4-13): rates 파라미터 미전달 시 상수 사용
 */
export function calculateSeparateAggregateTax(
  input: SeparateAggregateInput,
  _rates?: Record<string, unknown>, // DB 세율 맵 (현재 상수 fallback)
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateAggregateResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [
    PROPERTY_SEPARATE.SUBJECT,
    PROPERTY_SEPARATE.RATE,
    PROPERTY_SEPARATE.PERSONAL_AGGREGATION,
  ];

  // ── Step 1: 필지별 판정 및 면적·가액 분리 ──
  const landChecks: LandSeparateCheckResult[] = [];
  const splitResults: SplitResult[] = [];

  // H-04: targetYear로 과세기준일 사전 설정 (deriveDefaultTaxBaseDate의 연도 오류 방지)
  const defaultTaxBaseDate = `${input.targetYear}-06-01`;
  const normalizedLandList = input.landList.map(land => ({
    ...land,
    taxBaseDate: land.taxBaseDate ?? defaultTaxBaseDate,
  }));

  for (const land of normalizedLandList) {
    const check = isSeparateAggregateLand(land);
    landChecks.push(check);
    splitResults.push(splitByBaseArea(land, check));

    if (check.warnings.length > 0) {
      warnings.push(...check.warnings);
    }
  }

  // ── Step 2: 인별 전국 합산 ──
  let totalSeparateOfficialValue = 0;
  let totalExcessOfficialValue = 0;

  for (const split of splitResults) {
    totalSeparateOfficialValue += split.separateOfficialValue;
    totalExcessOfficialValue += split.excessOfficialValue;
  }

  if (totalExcessOfficialValue > 0) {
    legalBasis.push(PROPERTY_SEPARATE.SUBJECT + " (초과분 → 종합합산 이관)");
  }

  // ── Step 3: 과세표준 계산 (공정시장가액비율 70%, 지방세법상 절사 규정 없음) ──
  const fairMarketValueRatio = PROPERTY_SEPARATE_CONST.FAIR_MARKET_RATIO;
  const taxBase = applyFairMarketRatio(totalSeparateOfficialValue, fairMarketValueRatio);
  legalBasis.push(PROPERTY_SEPARATE.FAIR_MARKET_RATIO);

  // ── Step 4: 누진세율 적용 ──
  const grossTax = calcProgressiveSeparateTax(taxBase, rateSet);

  // ── Step 5: 세부담상한 적용 ──
  const { taxAfterCap, appliedCapRate } = applySeparateBurdenCap(
    grossTax,
    input.previousYearTax,
  );

  if (appliedCapRate !== undefined) {
    legalBasis.push(PROPERTY_SEPARATE.BURDEN_CAP);
    warnings.push(
      `세부담상한(150%) 적용: 산출세액 ${grossTax.toLocaleString()} → 상한 세액 ${taxAfterCap.toLocaleString()}`,
    );
  }

  if (input.previousYearTax === undefined) {
    warnings.push("전년도 세부담 상당세액이 입력되지 않아 세부담상한(150%)을 적용하지 않습니다.");
  }

  // ── Step 6: 지자체별 안분 ──
  const jurisdictionAllocation = allocateSeparateByJurisdiction(
    input.landList,
    landChecks,
    splitResults,
    taxAfterCap,
    totalSeparateOfficialValue,
  );

  return {
    landChecks,
    totalSeparateOfficialValue,
    totalExcessOfficialValue,
    fairMarketValueRatio,
    taxBase,
    grossTax,
    taxAfterCap,
    appliedCapRate,
    jurisdictionAllocation,
    legalBasis,
    warnings,
  };
}

// ============================================================
// 내부 함수
// ============================================================

/**
 * 별도합산 누진세율 계산 (지방세법 §111①1호 나목)
 */
function calcProgressiveSeparateTax(
  taxBase: number,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): number {
  if (taxBase <= 0) return 0;

  const {
    bracket1: B1,
    bracket2: B2,
    rate1: R1,
    rate2: R2,
    rate3: R3,
    deduction2: D2,
    deduction3: D3,
  } = rateSet.landSeparateAggregate;

  // P0-2: 세액 계산 시 applyRate() 사용 (Math.floor 직접 사용 금지)
  if (taxBase <= B1) {
    return applyRate(taxBase, R1);
  } else if (taxBase <= B2) {
    return applyRate(taxBase, R2) - D2;
  } else {
    return applyRate(taxBase, R3) - D3;
  }
}

/**
 * 세부담상한 적용 (지방세법 §122, 토지 150%)
 */
function applySeparateBurdenCap(
  grossTax: number,
  previousYearTax?: number,
): { taxAfterCap: number; appliedCapRate?: number } {
  if (previousYearTax === undefined || previousYearTax <= 0) {
    return { taxAfterCap: grossTax };
  }

  const capRate = PROPERTY_SEPARATE_CONST.TAX_CAP_RATE; // 1.50
  const capAmount = applyRate(previousYearTax, capRate);

  if (grossTax > capAmount) {
    return { taxAfterCap: capAmount, appliedCapRate: capRate };
  }

  return { taxAfterCap: grossTax };
}

/**
 * 지자체별 세액 안분 (지방세법 §113)
 *
 * 전국 합산 세액을 각 지자체 별도합산 인정분 공시지가 비율로 안분.
 * 세율 재적용 금지 — 비율 안분만 수행.
 */
function allocateSeparateByJurisdiction(
  landList: SeparateAggregateLandItem[],
  checks: LandSeparateCheckResult[],
  splits: SplitResult[],
  totalTax: number,
  totalSeparateValue: number,
): JurisdictionSeparateAllocation[] {
  // 지자체별 별도합산 인정분 공시지가 합산
  const jurisdictionMap = new Map<string, number>();
  const checkMap = new Map(checks.map((c) => [c.landId, c]));
  const splitMap = new Map(splits.map((s) => [s.landId, s]));

  for (const land of landList) {
    const check = checkMap.get(land.id);
    const split = splitMap.get(land.id);
    if (!check?.isSeparateAggregate || !split) continue;

    const current = jurisdictionMap.get(land.jurisdictionCode) ?? 0;
    jurisdictionMap.set(
      land.jurisdictionCode,
      current + split.separateOfficialValue,
    );
  }

  if (totalSeparateValue <= 0) return [];

  const entries = [...jurisdictionMap.entries()];
  let distributed = 0;
  const result: JurisdictionSeparateAllocation[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [jurisdictionCode, allocatedOfficialValue] = entries[i];
    const allocationRatio = allocatedOfficialValue / totalSeparateValue;
    const isLast = i === entries.length - 1;
    // M-07: 절사 잔여분은 마지막 지자체에 귀속 (공유재산 안분과 동일 원칙)
    const allocatedTax = isLast
      ? totalTax - distributed
      : applyRate(totalTax, allocationRatio);
    if (!isLast) distributed += allocatedTax;
    result.push({ jurisdictionCode, allocatedOfficialValue, allocationRatio, allocatedTax });
  }

  return result;
}

/**
 * 과세기준일 기본값 도출 (당해 연도 6월 1일)
 */
function deriveDefaultTaxBaseDate(land: SeparateAggregateLandItem): string {
  // landArea를 이용해 연도 추정 — 실제론 input.targetYear 사용 권장
  const year = new Date().getFullYear();
  return `${year}-06-01`;
}

/**
 * 두 날짜 사이 경과 개월 수 계산 (일 수 기반, 30일 = 1개월)
 * @returns 경과 개월 수 (음수이면 파싱 오류)
 */
export function calcElapsedMonths(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) return -1;
  if (from > to) return 0; // 철거일이 과세기준일 이후 → 0개월

  // 연·월 기반 계산 (일 수 차이는 고려하지 않고 월 단위로 판정)
  const yearDiff = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  const totalMonths = yearDiff * 12 + monthDiff;

  // 동일 월 내 일 수 차이 (절상)
  const dayAdjust = to.getDate() >= from.getDate() ? 0 : -1;
  return totalMonths + dayAdjust;
}
