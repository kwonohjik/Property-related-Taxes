/**
 * 취득세 시가표준액 산정 모듈
 *
 * 지방세법 §4 — 시가표준액 정의 및 산정
 * - 주택: 주택공시가격
 * - 토지: 개별공시지가 × 면적
 * - 건물(비주거): 신축가격기준액 × 구조지수 × 용도지수 × 위치지수 × 잔가율 × 연면적
 */

import { ACQUISITION } from "./legal-codes";
import type { PropertyObjectType, StandardPriceInput } from "./types/acquisition.types";

// ============================================================
// 시가표준액 산정 결과 타입
// ============================================================

export interface StandardPriceResult {
  standardValue: number;      // 산정된 시가표준액 (원)
  calculationBasis: string;   // 산정 근거 설명
  legalBasis: string;
  warnings: string[];
}

// ============================================================
// 잔가율 테이블 (건물 경과연수별)
// ============================================================

/**
 * 건물 경과연수별 잔가율 (지방세법 시행령 §4조의2, 행안부 고시)
 *
 * 구간별 선형 보간 테이블:
 *   0~ 1년: 1.000
 *   1~ 5년: 1.000 → 0.870 (1년에 0.0325 감소)
 *   5~10년: 0.870 → 0.750 (1년에 0.024 감소)
 *  10~15년: 0.750 → 0.640 (1년에 0.022 감소)
 *  15~20년: 0.640 → 0.540 (1년에 0.020 감소)
 *  20~25년: 0.540 → 0.440 (1년에 0.020 감소)
 *  25~30년: 0.440 → 0.350 (1년에 0.018 감소)
 *  30년 이상: 0.350 (최저 잔가율)
 */
function calculateResidualRatio(elapsedYears: number): number {
  const y = Math.max(0, elapsedYears);
  if (y <= 1)  return 1.000;
  if (y <= 5)  return 1.000 - (y - 1)  * 0.0325;
  if (y <= 10) return 0.870 - (y - 5)  * 0.024;
  if (y <= 15) return 0.750 - (y - 10) * 0.022;
  if (y <= 20) return 0.640 - (y - 15) * 0.020;
  if (y <= 25) return 0.540 - (y - 20) * 0.020;
  if (y <= 30) return 0.440 - (y - 25) * 0.018;
  return 0.350; // 최저 잔가율 35%
}

// ============================================================
// 물건 유형별 시가표준액 산정
// ============================================================

/**
 * 주택 시가표준액
 * = 주택공시가격 (개별주택가격 또는 공동주택가격, 국토부 공시)
 */
function calcHousingStandardPrice(
  input: StandardPriceInput,
  warnings: string[]
): number {
  if (input.housingPublicPrice && input.housingPublicPrice > 0) {
    return input.housingPublicPrice;
  }
  warnings.push("주택공시가격 미입력 — 시가표준액 0으로 처리됩니다. 주택공시가격을 직접 입력하세요.");
  return 0;
}

/**
 * 토지 시가표준액
 * = 개별공시지가(원/㎡) × 면적(㎡)
 */
function calcLandStandardPrice(
  input: StandardPriceInput,
  warnings: string[]
): number {
  const price = input.individualLandPrice ?? 0;
  const area = input.landArea ?? 0;

  if (price <= 0) warnings.push("개별공시지가 미입력 — 시가표준액 0으로 처리됩니다.");
  if (area <= 0) warnings.push("토지 면적 미입력 — 시가표준액 0으로 처리됩니다.");

  return Math.floor(price * area);
}

/**
 * 건물(비주거) 시가표준액
 * = 신축가격기준액(원/㎡) × 구조지수 × 용도지수 × 위치지수 × 잔가율 × 연면적(㎡)
 *
 * 행정안전부장관이 정하는 기준 (지방세법 §4①3)
 */
function calcBuildingStandardPrice(
  input: StandardPriceInput,
  warnings: string[]
): number {
  const basePrice = input.newBuildingBasePrice ?? 0;
  const structureIndex = input.structureIndex ?? 1.0;
  const usageIndex = input.usageIndex ?? 1.0;
  const locationIndex = input.locationIndex ?? 1.0;
  const elapsedYears = input.elapsedYears ?? 0;
  const floorArea = input.floorArea ?? 0;

  if (basePrice <= 0) warnings.push("신축가격기준액 미입력 — 시가표준액 0으로 처리됩니다.");
  if (floorArea <= 0) warnings.push("연면적 미입력 — 시가표준액 0으로 처리됩니다.");

  const residualRatio = calculateResidualRatio(elapsedYears);
  const combined = basePrice * structureIndex * usageIndex * locationIndex * residualRatio * floorArea;
  return Math.floor(combined);
}

// ============================================================
// 메인 시가표준액 산정 함수
// ============================================================

/**
 * 물건 유형별 시가표준액 산정 (지방세법 §4)
 *
 * 직접 입력(standardValue)이 있으면 우선 사용.
 * 없으면 standardPriceInput으로 계산.
 */
export function calcStandardPrice(
  propertyType: PropertyObjectType,
  standardValue: number | undefined,
  standardPriceInput: StandardPriceInput | undefined
): StandardPriceResult {
  const warnings: string[] = [];

  // 직접 입력된 시가표준액 우선 사용
  if (standardValue !== undefined && standardValue > 0) {
    return {
      standardValue,
      calculationBasis: "직접 입력한 시가표준액(주택공시가격·개별공시지가 등)",
      legalBasis: ACQUISITION.STANDARD_VALUE,
      warnings,
    };
  }

  // 산정 입력이 없는 경우
  if (!standardPriceInput) {
    warnings.push("시가표준액 미입력 — 0으로 처리됩니다. 주택공시가격 또는 개별공시지가를 입력하세요.");
    return {
      standardValue: 0,
      calculationBasis: "시가표준액 미입력",
      legalBasis: ACQUISITION.STANDARD_VALUE,
      warnings,
    };
  }

  // 물건 유형별 시가표준액 산정
  let computed = 0;
  let basis = "";

  switch (propertyType) {
    case "housing":
      computed = calcHousingStandardPrice(standardPriceInput, warnings);
      basis = "주택공시가격 (지방세법 §4①2)";
      break;

    case "land":
    case "land_farmland":
      computed = calcLandStandardPrice(standardPriceInput, warnings);
      basis = "개별공시지가 × 면적 (지방세법 §4①1)";
      break;

    case "building":
      computed = calcBuildingStandardPrice(standardPriceInput, warnings);
      basis = "신축가격기준액 × 지수 × 잔가율 × 연면적 (지방세법 §4①3)";
      break;

    default:
      // 차량·기계·항공기·선박·광업권·어업권·회원권·입목
      // → 지방세법 §4①4: 지방자치단체장이 결정·고시
      // 여기서는 직접 입력값(standardValue) 필수
      warnings.push(
        `${propertyType} 유형의 시가표준액은 지방자치단체장 고시 기준입니다. 직접 입력(standardValue)이 필요합니다.`
      );
      computed = 0;
      basis = "지방자치단체장 결정·고시 (지방세법 §4①4)";
      break;
  }

  return {
    standardValue: computed,
    calculationBasis: basis,
    legalBasis: ACQUISITION.STANDARD_VALUE,
    warnings,
  };
}

// ============================================================
// 과세표준 결정 시 시가표준액 vs 실거래가 비교 유틸
// ============================================================

/**
 * 무상취득(상속·증여)에서 시가인정액/실거래가가 없을 때
 * 시가표준액을 과세표준으로 적용해야 하는지 판단
 */
export function shouldUseStandardPrice(
  acquisitionCause: string,
  reportedPrice: number,
  marketValue: number | undefined,
  standardValue: number
): { useStandardPrice: boolean; reason: string } {
  // 무상취득(상속·증여·기부) → 시가 없으면 시가표준액
  const isGratuitous = ["inheritance", "inheritance_farmland", "gift", "burdened_gift", "donation"].includes(
    acquisitionCause
  );

  if (isGratuitous) {
    if (marketValue && marketValue > 0) {
      return { useStandardPrice: false, reason: "무상취득 — 시가인정액 사용" };
    }
    return { useStandardPrice: true, reason: "무상취득 — 시가표준액 사용 (시가인정액 없음)" };
  }

  // 유상취득 → 신고가 없으면 시가표준액
  if (!reportedPrice || reportedPrice <= 0) {
    return { useStandardPrice: true, reason: "유상취득 — 시가표준액 사용 (실거래가 미신고)" };
  }

  return { useStandardPrice: false, reason: "유상취득 — 실거래가(사실상취득가격) 사용" };
}
