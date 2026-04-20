/**
 * 재산세 종합합산과세대상 판정 및 계산 엔진 (P3-03~11)
 *
 * 지방세법 §106①1호 (종합합산과세대상)
 * 지방세법 §111①1호 가목 (세율: 0.2%~0.5%)
 * 지방세법 §113 (인별 전국 합산)
 * 지방세법 §122 (세부담상한 150%)
 *
 * 판정 우선순위 (엄수):
 *   1. 분리과세(§106①3호) → 제외
 *   2. 별도합산(§106①2호) → 제외
 *   3. 나머지 → 종합합산 (기본값)
 *
 * 핵심 원칙:
 *   - 인별 전국 합산: 동일 납세자의 전국 종합합산 토지 공시지가 합산
 *   - 누진세율 1회 적용 후 지자체별 안분 (세율 재적용 금지)
 *   - 세부담상한 → 안분 순서 준수
 */

import { applyRate, truncateToThousand } from "./tax-utils";
import { PROPERTY_CAL, PROPERTY_CONST, PROPERTY_SEPARATE_CONST } from "./legal-codes";

// ============================================================
// P3-03: 타입 정의
// ============================================================

/** 지목 코드 (지방세법 시행령 §102 기준) */
export type LandCategoryCode =
  | "전"        // 밭
  | "답"        // 논
  | "과수원"    // 과수원
  | "목장용지"  // 목장
  | "임야"      // 산지
  | "대"        // 주거·상업·공업지역 건축부지
  | "공장용지"  // 공장
  | "잡종지"    // 기타
  | string;     // 기타 지목

/** 용도지역 코드 */
export type UseZone =
  | "residential"    // 주거지역
  | "commercial"     // 상업지역
  | "industrial"     // 공업지역
  | "green"          // 녹지지역
  | "management"     // 관리지역
  | "agricultural"   // 농림지역
  | "nature_preserve"; // 자연환경보전지역

/** 건축물 용도 */
export type BuildingUsage =
  | "commercial"   // 일반 영업용
  | "factory"      // 공장
  | "residential"  // 주거용
  | "warehouse"    // 창고
  | "other";       // 기타

/** 단일 필지 토지 정보 */
export interface LandInfo {
  /** 필지 식별자 */
  id: string;
  /** 소재지 주소 */
  address: string;
  /** 관할 지자체 코드 (예: "11110" 서울 종로구) */
  jurisdictionCode: string;
  /** 지목 */
  landCategory: LandCategoryCode;
  /** 용도지역 */
  useZone: UseZone;
  /** 면적 (㎡) */
  area: number;
  /** 개별공시지가 (원/㎡) */
  officialLandPrice: number;

  // ── 별도합산 판정 근거 ──
  /** 건축물 존재 여부 */
  hasBuilding: boolean;
  /** 건축물 바닥면적 (㎡) */
  buildingFloorArea?: number;
  /** 건축물 용도 */
  buildingUsage?: BuildingUsage;
  /** 공장용지 여부 */
  isFactory?: boolean;
  /** 공장입지기준면적 (㎡) — 공장용지의 별도합산 한도 */
  factoryStandardArea?: number;

  // ── 분리과세 판정 근거 ──
  /** 자경 여부 (농지 분리과세 0.07% 요건) */
  isSelfCultivated?: boolean;
  /** 등록 농지 여부 */
  isRegisteredFarmland?: boolean;
  /** 특수산림보호구역 (분리과세 0.07%) */
  isProtectedForest?: boolean;
  /** 회원제 골프장 (분리과세 4%) */
  isGolfCourse?: boolean;
  /** 고급오락장 (분리과세 4%) */
  isLuxuryEntertainment?: boolean;
  /** 목장용지 축산업용 여부 (분리과세 0.07%) */
  isCattleFarmland?: boolean;
  /** 산업단지 공장용지 (분리과세 0.2%) */
  isIndustrialComplexFactory?: boolean;
}

/** 토지 분류 결과 유형 */
export type LandTaxCategory =
  | "comprehensive_aggregate" // 종합합산
  | "separate_aggregate"      // 별도합산
  | "separated";              // 분리과세

/** 단일 필지 분류 결과 */
export interface LandClassificationDetail {
  landId: string;
  category: LandTaxCategory;
  /** 판정 근거 (PROPERTY_CAL.* 상수) */
  reason: string;
  /** 종합합산 대상 면적 (split 시 초과분, 전체는 area) */
  comprehensiveArea?: number;
  /** 별도합산 대상 면적 */
  separateAggregateArea?: number;
}

/** 종합합산과세 계산 입력 */
export interface ComprehensiveAggregateInput {
  /** 납세자 식별자 */
  taxpayerId: string;
  /** 과세연도 */
  targetYear: number;
  /** 전국 보유 토지 목록 */
  landList: LandInfo[];
  /** 전년도 상당세액 (세부담상한 계산용, 없으면 상한 미적용) */
  previousYearTax?: number;
  /** 공정시장가액비율 (기본 0.70) */
  fairMarketValueRatio?: number;
}

/** 지자체별 안분 결과 */
export interface JurisdictionAllocation {
  jurisdictionCode: string;
  /** 해당 지자체 관할 종합합산 토지 공시지가 합계 */
  allocatedOfficialValue: number;
  /** 안분 비율 (0~1) */
  allocationRatio: number;
  /** 안분 세액 (원) */
  allocatedTax: number;
}

/** 종합합산과세 계산 결과 */
export interface ComprehensiveAggregateResult {
  // ── 과세대상 구분 결과 ──
  classification: LandClassificationDetail[];

  // ── 종합합산 집계 ──
  /** 종합합산과세대상 토지 목록 */
  comprehensiveLands: LandInfo[];
  /** 공시지가 합계 (원) — 면적 × 단가 합산 */
  totalOfficialValue: number;
  /** 적용 공정시장가액비율 */
  fairMarketValueRatio: number;
  /** 전국 합산 과세표준 (원) */
  taxBase: number;

  // ── 세액 계산 ──
  /** 산출세액 (누진세율 적용) */
  grossTax: number;
  /** 세부담상한 적용 후 세액 */
  taxAfterCap: number;
  /** 적용 상한율 (150% = 1.50, 미적용 시 undefined) */
  appliedCapRate?: number;

  // ── 지자체별 안분 ──
  jurisdictionAllocation: JurisdictionAllocation[];

  // ── 종부세 연동 데이터 ──
  /**
   * 종합부동산세 종합합산 토지분 과세표준
   * (property-tax.ts → comprehensive-tax.ts 경유)
   */
  comprehensiveTaxBase: number;

  legalBasis: string[];
  warnings: string[];
}

// ============================================================
// P3-04: isSeparatedTaxation — 분리과세 판정
// ============================================================

/**
 * 분리과세대상 여부 판정 (지방세법 §106①3호, 시행령 §102)
 *
 * 우선순위: 고율(4%) → 저율(0.07%) → 일반(0.2%)
 */
export function isSeparatedTaxation(land: LandInfo): boolean {
  // ── 고율 4% ──
  if (land.isGolfCourse) return true;
  if (land.isLuxuryEntertainment) return true;

  // ── 저율 0.07% ──
  // 자경 농지: 전·답·과수원 + 자경 요건
  const isFarmlandCategory =
    land.landCategory === "전" ||
    land.landCategory === "답" ||
    land.landCategory === "과수원";
  if (isFarmlandCategory && land.isSelfCultivated) return true;

  // 목장용지 축산업용 기준면적 이내
  if (land.landCategory === "목장용지" && land.isCattleFarmland) return true;

  // 특수산림보호구역·임업용 임야
  if (land.landCategory === "임야" && land.isProtectedForest) return true;

  // ── 일반 0.2% ──
  // 산업단지 공장용지 (주거·상업·녹지지역 외)
  if (
    land.isFactory &&
    land.isIndustrialComplexFactory &&
    land.useZone !== "residential" &&
    land.useZone !== "commercial" &&
    land.useZone !== "green"
  ) {
    return true;
  }

  return false;
}

// ============================================================
// P3-05: isSeparateAggregate — 별도합산 기준면적 판정
// ============================================================

/** 별도합산 판정 결과 */
export interface SeparateAggregateCheckResult {
  isSeparate: boolean;
  /** 별도합산 인정 면적 (㎡) */
  separateArea: number;
  /** 종합합산 전환 초과 면적 (㎡) */
  comprehensiveArea: number;
}

/**
 * 별도합산과세대상 여부 및 기준면적 판정 (지방세법 §106①2호, 시행령 §101)
 *
 * 조건: 영업용 건축물의 부속토지로서 기준면적 이내
 * - 일반 영업용: 건축물 바닥면적 × 10배
 * - 공장용지: factoryStandardArea 이내
 *
 * 초과 면적 → 종합합산 전환
 */
export function isSeparateAggregate(
  land: LandInfo,
): SeparateAggregateCheckResult {
  if (!land.hasBuilding || !land.buildingFloorArea || land.buildingFloorArea <= 0) {
    return { isSeparate: false, separateArea: 0, comprehensiveArea: land.area };
  }

  // 주거용 건축물 부속토지는 별도합산 아님 (주택분 재산세 처리)
  if (land.buildingUsage === "residential") {
    return { isSeparate: false, separateArea: 0, comprehensiveArea: land.area };
  }

  let baseArea: number;

  if (land.isFactory && land.factoryStandardArea && land.factoryStandardArea > 0) {
    // 공장용지: 공장입지기준면적 기준
    baseArea = land.factoryStandardArea;
  } else {
    // 일반 영업용: 바닥면적 × 용도지역별 배율 (지방세법 시행령 §101②1호)
    // separate-aggregate-land.ts의 PROPERTY_SEPARATE_CONST.ZONING_MULTIPLIER와 동일 기준 적용
    const multiplierMap = PROPERTY_SEPARATE_CONST.ZONING_MULTIPLIER;
    const multiplier: number =
      (multiplierMap as Record<string, number>)[land.useZone] ?? 5;
    baseArea = land.buildingFloorArea * multiplier;
  }

  const separateArea = Math.min(land.area, baseArea);
  const comprehensiveArea = Math.max(0, land.area - baseArea);

  return {
    isSeparate: separateArea > 0,
    separateArea,
    comprehensiveArea,
  };
}

// ============================================================
// P3-06: classifyLandForComprehensive — 3분류 오케스트레이터
// ============================================================

/**
 * 토지 3분류 오케스트레이터 (지방세법 §106)
 *
 * 판정 순서: 분리과세 → 별도합산 → 종합합산(기본값)
 * split(면적 초과) 시 초과분을 종합합산으로 처리
 */
export function classifyLandForComprehensive(
  land: LandInfo,
): LandClassificationDetail {
  // 1단계: 분리과세 우선
  if (isSeparatedTaxation(land)) {
    return {
      landId: land.id,
      category: "separated",
      reason: PROPERTY_CAL.SEPARATED_TAXATION,
    };
  }

  // 2단계: 별도합산 확인
  const aggregateCheck = isSeparateAggregate(land);
  if (aggregateCheck.isSeparate) {
    if (aggregateCheck.comprehensiveArea > 0) {
      // split: 일부는 별도합산, 초과분은 종합합산
      return {
        landId: land.id,
        category: "comprehensive_aggregate",
        reason: PROPERTY_CAL.COMPREHENSIVE_AGGREGATE,
        comprehensiveArea: aggregateCheck.comprehensiveArea,
        separateAggregateArea: aggregateCheck.separateArea,
      };
    }
    return {
      landId: land.id,
      category: "separate_aggregate",
      reason: PROPERTY_CAL.SEPARATE_AGGREGATE,
      separateAggregateArea: aggregateCheck.separateArea,
    };
  }

  // 3단계: 종합합산 (기본값)
  return {
    landId: land.id,
    category: "comprehensive_aggregate",
    reason: PROPERTY_CAL.COMPREHENSIVE_AGGREGATE,
    comprehensiveArea: land.area,
  };
}

// ============================================================
// P3-07: calculateComprehensiveAggregateTaxBase — 인별 합산 과세표준
// ============================================================

/**
 * 종합합산 인별 전국 합산 과세표준 산정 (지방세법 §113)
 *
 * Step 1. 분류된 토지 중 종합합산 대상 필터링
 * Step 2. 공시지가 × 면적 합산 (BigInt overflow guard)
 * Step 3. 공정시장가액비율(70%) 적용
 *
 * @param lands 종합합산 대상 토지 목록 (분류 완료)
 * @param classification 분류 결과 (초과분 면적 반영용)
 * @param fairMarketValueRatio 공정시장가액비율 (기본 0.70)
 */
export function calculateComprehensiveAggregateTaxBase(
  lands: LandInfo[],
  classification: LandClassificationDetail[],
  fairMarketValueRatio: number = PROPERTY_CONST.FAIR_MARKET_RATIO_LAND_BUILDING,
): { totalOfficialValue: number; taxBase: number } {
  const classMap = new Map(classification.map((c) => [c.landId, c]));

  let totalOfficialValue = 0;

  for (const land of lands) {
    const cls = classMap.get(land.id);
    if (!cls) continue;

    // 종합합산 해당 면적 결정 (split 시 초과분만)
    const area = cls.comprehensiveArea !== undefined
      ? cls.comprehensiveArea
      : land.area;

    if (area <= 0) continue;

    // BigInt overflow guard: 공시지가 × 면적
    const value = safeMultiplyLand(land.officialLandPrice, area);
    totalOfficialValue += value;
  }

  // 지방세법 §110 — 과세표준 절사 규정 없음, 원 단위
  const taxBase = applyRate(totalOfficialValue, fairMarketValueRatio);

  return { totalOfficialValue, taxBase };
}

/** 면적(소수 허용) × 단가(정수) → 정수 변환 */
function safeMultiplyLand(pricePerSqm: number, area: number): number {
  // 면적은 소수점 2자리 허용 → ×100으로 정수 변환 후 나눔
  const areaInt = Math.round(area * 100);
  const result = BigInt(Math.round(pricePerSqm)) * BigInt(areaInt);
  return Number(result / BigInt(100));
}

// ============================================================
// P3-08: calculateComprehensiveAggregateTax — 3단계 누진세율
// ============================================================

/**
 * 종합합산 토지 세액 계산 (지방세법 §111①1호 가목)
 *
 * 세율표:
 * ┌──────────────┬────────┬─────────────┐
 * │ 과세표준      │ 세율   │ 누진공제     │
 * ├──────────────┼────────┼─────────────┤
 * │ ≤ 5천만원    │ 0.2%  │ -           │
 * │ ≤ 1억원      │ 0.3%  │ 50,000원    │
 * │ > 1억원      │ 0.5%  │ 250,000원   │
 * └──────────────┴────────┴─────────────┘
 */
export function calculateComprehensiveAggregateTax(taxBase: number): number {
  if (taxBase <= 0) return 0;

  const B1 = PROPERTY_CONST.COMPREHENSIVE_BRACKET_1; // 5천만원
  const B2 = PROPERTY_CONST.COMPREHENSIVE_BRACKET_2; // 1억원
  const R1 = PROPERTY_CONST.COMPREHENSIVE_RATE_1;    // 0.002
  const R2 = PROPERTY_CONST.COMPREHENSIVE_RATE_2;    // 0.003
  const R3 = PROPERTY_CONST.COMPREHENSIVE_RATE_3;    // 0.005
  const D2 = PROPERTY_CONST.COMPREHENSIVE_DEDUCTION_2; // 50,000
  const D3 = PROPERTY_CONST.COMPREHENSIVE_DEDUCTION_3; // 2,550,000

  if (taxBase <= B1) {
    return applyRate(taxBase, R1);
  } else if (taxBase <= B2) {
    return applyRate(taxBase, R2) - D2;
  } else {
    return applyRate(taxBase, R3) - D3;
  }
}

// ============================================================
// P3-09: applyBurdenCap — 세부담상한 150%
// ============================================================

/**
 * 토지 세부담상한 적용 (지방세법 §122)
 *
 * 당년도 산출세액 > 전년도 상당세액 × 150% → 상한 적용
 * 전년도 세액 미제공 시 상한 미적용
 */
export function applyBurdenCap(
  grossTax: number,
  previousYearTax?: number,
): { taxAfterCap: number; appliedCapRate?: number } {
  if (previousYearTax === undefined || previousYearTax <= 0) {
    return { taxAfterCap: grossTax };
  }

  const capRate = PROPERTY_CONST.TAX_CAP_RATE_LAND; // 1.50
  const capAmount = Math.floor(previousYearTax * capRate);

  if (grossTax > capAmount) {
    return { taxAfterCap: capAmount, appliedCapRate: capRate };
  }

  return { taxAfterCap: grossTax };
}

// ============================================================
// P3-10: allocateByJurisdiction — 지자체 안분
// ============================================================

/**
 * 지자체별 세액 안분 (지방세법 §113)
 *
 * 전국 합산 세액을 각 지자체 관할 토지 공시지가 비율로 안분.
 * 세율 재적용 금지 — 비율 안분만 수행.
 * 잔여 원 단위(절사 오차)는 마지막 지자체에 귀속.
 *
 * @param totalTax 세부담상한 적용 후 세액
 * @param lands 종합합산 대상 토지 목록
 * @param classification 분류 결과
 */
export function allocateByJurisdiction(
  totalTax: number,
  lands: LandInfo[],
  classification: LandClassificationDetail[],
): JurisdictionAllocation[] {
  if (totalTax <= 0 || lands.length === 0) return [];

  const classMap = new Map(classification.map((c) => [c.landId, c]));

  // 지자체별 공시지가 합계 집계
  const jurisdictionMap = new Map<string, number>();
  let grandTotal = 0;

  for (const land of lands) {
    const cls = classMap.get(land.id);
    if (!cls) continue;
    const area = cls.comprehensiveArea !== undefined ? cls.comprehensiveArea : land.area;
    if (area <= 0) continue;

    const value = safeMultiplyLand(land.officialLandPrice, area);
    const prev = jurisdictionMap.get(land.jurisdictionCode) ?? 0;
    jurisdictionMap.set(land.jurisdictionCode, prev + value);
    grandTotal += value;
  }

  if (grandTotal <= 0) return [];

  const codes = [...jurisdictionMap.keys()];
  let distributed = 0;
  const result: JurisdictionAllocation[] = [];

  codes.forEach((code, idx) => {
    const officialValue = jurisdictionMap.get(code) ?? 0;
    const ratio = officialValue / grandTotal;
    const isLast = idx === codes.length - 1;
    const allocatedTax = isLast
      ? totalTax - distributed
      : Math.floor(totalTax * ratio);
    distributed += isLast ? 0 : allocatedTax;

    result.push({
      jurisdictionCode: code,
      allocatedOfficialValue: officialValue,
      allocationRatio: ratio,
      allocatedTax,
    });
  });

  return result;
}

// ============================================================
// P3-11: calculateComprehensiveAggregate — 메인 엔트리
// ============================================================

/**
 * 재산세 종합합산과세 메인 엔트리 (지방세법 §106①1호 ~ §122)
 *
 * 처리 순서:
 *   1. 각 토지 3분류 판정 (classifyLandForComprehensive)
 *   2. 종합합산 해당 필지 추출
 *   3. 인별 전국 합산 과세표준 산정
 *   4. 누진세율 적용 → 산출세액
 *   5. 세부담상한(150%) 적용
 *   6. 지자체별 안분
 *
 * ※ 종부세 연동: comprehensiveTaxBase를 property-tax.ts → comprehensive-tax.ts로 전달
 *
 * @param input ComprehensiveAggregateInput
 * @returns ComprehensiveAggregateResult
 */
export function calculateComprehensiveAggregate(
  input: ComprehensiveAggregateInput,
): ComprehensiveAggregateResult {
  const warnings: string[] = [];
  const legalBasis: string[] = [
    PROPERTY_CAL.CATEGORY_DIVISION,
    PROPERTY_CAL.PERSONAL_AGGREGATION,
    PROPERTY_CAL.RATE_COMPREHENSIVE,
  ];

  const fairMarketValueRatio =
    input.fairMarketValueRatio ?? PROPERTY_CONST.FAIR_MARKET_RATIO_LAND_BUILDING;

  // Step 1: 3분류 판정
  const classification = input.landList.map(classifyLandForComprehensive);

  // Step 2: 종합합산 해당 필지 추출
  const comprehensiveLands = input.landList.filter((land) => {
    const cls = classification.find((c) => c.landId === land.id);
    return cls?.category === "comprehensive_aggregate";
  });

  if (comprehensiveLands.length === 0) {
    warnings.push("종합합산과세대상 토지가 없습니다. 전체 토지가 분리과세 또는 별도합산 대상입니다.");
    return {
      classification,
      comprehensiveLands: [],
      totalOfficialValue: 0,
      fairMarketValueRatio,
      taxBase: 0,
      grossTax: 0,
      taxAfterCap: 0,
      jurisdictionAllocation: [],
      comprehensiveTaxBase: 0,
      legalBasis,
      warnings,
    };
  }

  // Step 3: 과세표준 산정
  const { totalOfficialValue, taxBase } = calculateComprehensiveAggregateTaxBase(
    comprehensiveLands,
    classification,
    fairMarketValueRatio,
  );
  legalBasis.push(PROPERTY_CAL.FAIR_MARKET_VALUE_RATIO);

  // Step 4: 누진세율 적용
  const grossTax = calculateComprehensiveAggregateTax(taxBase);

  // Step 5: 세부담상한
  const { taxAfterCap, appliedCapRate } = applyBurdenCap(
    grossTax,
    input.previousYearTax,
  );
  if (appliedCapRate !== undefined) {
    legalBasis.push(PROPERTY_CAL.BURDEN_CAP);
    warnings.push(
      `세부담상한(150%) 적용: 산출세액 ${grossTax.toLocaleString()}원 → ` +
      `${taxAfterCap.toLocaleString()}원`,
    );
  }

  // Step 6: 지자체별 안분
  const jurisdictionAllocation = allocateByJurisdiction(
    taxAfterCap,
    comprehensiveLands,
    classification,
  );

  return {
    classification,
    comprehensiveLands,
    totalOfficialValue,
    fairMarketValueRatio,
    taxBase,
    grossTax,
    taxAfterCap,
    appliedCapRate,
    jurisdictionAllocation,
    comprehensiveTaxBase: taxBase, // 종부세 연동
    legalBasis: [...new Set(legalBasis)],
    warnings,
  };
}
