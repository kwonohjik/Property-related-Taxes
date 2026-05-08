/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 단방향 의존: 이 파일은 transfer-tax-aggregate.ts에서 생성된 카드를 공급하며
 *             transfer-tax.ts 또는 aggregate를 import하지 않음 (역방향 금지).
 *
 * 법령 근거:
 *   소득세법 시행령 §166 ⑥ — 토지·건물 등 여러 자산 일괄 양도 시 기준시가 비율 안분
 *   소득세법 시행령 §176조의2 ④ — 환산취득가액 (취득시/양도시 기준시가 비율)
 *   소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 개산공제율 (등기 자산 3%, 미등기 0.3%)
 *   소득세법 §104조의3 + 시행령 §168의8 — 비사업용토지 판정 (건물 부수토지 배율)
 *
 * P0-2 원칙: 모든 금액 원(정수) 단위. Math.round() 금지 — Math.floor() 사용.
 * BigInt 원칙: 분자 ≈ 2.15×10¹⁷ 초과 시 safeMultiplyThenDivide() 자동 fallback.
 */

import { safeMultiplyThenDivide } from "./tax-utils";
import { TRANSFER } from "./legal-codes";

// ============================================================
// 개산공제율 상수 (시행령 §163 ⑥)
// ============================================================

/** 등기 자산(토지·일반건물·주택·오피스텔 등) 개산공제율 — 시행령 §163 ⑥ */
export const ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03 as const;

/** 미등기 자산 개산공제율 — 시행령 §163 ⑥ */
export const ESTIMATED_DEDUCTION_RATE_UNREGISTERED = 0.003 as const;

// ============================================================
// 공개 타입 (Task #3 — GeneralBuildingInput/Output)
// ============================================================

/** 일반건물(토지+건물 일괄) 환산취득가 계산 입력 */
export type GeneralBuildingInput = {
  // 양도 정보
  /** 총 양도가액 (원) — 토지+건물 합계 */
  totalTransferPrice: number;
  /** 양도일 */
  transferDate: Date;

  // 취득 정보
  /** 취득일 */
  acquisitionDate: Date;

  // 면적
  /** 토지 부수면적 (㎡) */
  landArea: number;
  /** 건물 연면적 (㎡) */
  buildingArea: number;
  /** 건물 층수 — 비사업용토지 판정 바닥면적 추정용 */
  buildingFloors: number;

  // 양도시점 기준시가 (안분 분모)
  /** 양도시 개별공시지가 (원/㎡) */
  transferLandPricePerSqm: number;
  /** 양도시 건물기준시가 총액 (원) */
  transferBuildingStdPrice: number;

  // 취득시점 기준시가 (환산 분자)
  /** 취득시 개별공시지가 (원/㎡) */
  acquisitionLandPricePerSqm: number;
  /** 취득시 건물기준시가 총액 (원) */
  acquisitionBuildingStdPrice: number;

  // 선택적
  /** 개산공제율 (기본 0.03 — ESTIMATED_DEDUCTION_RATE_LAND_BUILDING) */
  estimatedDeductionRate?: number;
  /** 비사업용토지 판정 배율 (기본 3 — 도시지역 주거·상업·공업) */
  floorAreaMultiplier?: number;
};

/** 양도가 안분 결과 */
export type GeneralBuildingAllocation = {
  /** 토지 양도가 (원) */
  land: number;
  /** 건물 양도가 (원) */
  building: number;
};

/** 환산취득가 결과 */
export type GeneralBuildingAcquisition = {
  /** 토지 환산취득가 (원) */
  land: number;
  /** 건물 환산취득가 (원) */
  building: number;
};

/** 개산공제 결과 */
export type GeneralBuildingEstimatedDeduction = {
  /** 토지 개산공제 (원) */
  land: number;
  /** 건물 개산공제 (원) */
  building: number;
};

/**
 * aggregate 엔진에 넘길 자산 카드 구조
 * TransferTaxItemInput과 호환 — 나머지 필드는 호출부에서 주입
 */
export type AssetCardForAggregate = {
  /** 자산 식별자 */
  propertyId: string;
  /** 자산 표시명 */
  propertyLabel: string;
  /** 자산 유형 */
  propertyType: "land" | "general_building_unit";
  /** 안분된 양도가 (원) */
  transferPrice: number;
  /** 환산취득가 (원) */
  acquisitionPrice: number;
  /** 개산공제 (원) */
  expenses: number;
  /** 환산취득가 사용 여부 (항상 true) */
  usedEstimatedAcquisition: true;
  /** 환산취득가액 (=acquisitionPrice) */
  estimatedBase: number;
  /** 개산공제액 */
  estimatedDeduction: number;
  /** 취득일 */
  acquisitionDate: Date;
  /** 양도일 */
  transferDate: Date;
  /** 비사업용토지 여부 */
  isNonBusinessLand: boolean;
};

/** 일반건물(토지+건물 일괄) 환산취득가 계산 출력 */
export type GeneralBuildingOutput = {
  // 중간 계산값 (테스트·UI 노출용)
  /** 양도가 안분 결과 */
  allocation: GeneralBuildingAllocation;
  /** 환산취득가 결과 */
  acquisition: GeneralBuildingAcquisition;
  /** 개산공제 결과 */
  estimatedDeduction: GeneralBuildingEstimatedDeduction;

  // 비사업용토지 판정
  /** 연면적 ÷ 층수 추정 바닥면적 (㎡) */
  estimatedFloorArea: number;
  /** 인정 한도 = 바닥면적 × 배율 (㎡) */
  allowedLandArea: number;
  /** true = 사업용 (배율 내, 중과 미발동) */
  isWithinNblRatio: boolean;

  // aggregate 엔진에 넘길 자산 카드 2장
  assetCards: AssetCardForAggregate[];
};

// ============================================================
// 내부 계산 함수
// ============================================================

/**
 * Step 1: 양도가 안분 (소득세법 시행령 §166 ⑥)
 *
 * 양도일 기준시가 비율로 토지·건물 양도가를 안분한다.
 *
 * 산식:
 *   토지 기준시가 = 양도시 공시지가(원/㎡) × 토지면적
 *   합계 기준시가 = 토지 기준시가 + 양도시 건물기준시가
 *   토지 양도가 = INT(총양도가 × 토지기준시가 / 합계기준시가)  ← BigInt 연산 필수
 *   건물 양도가 = 총양도가 − 토지양도가  (잔액 보정, 이중 floor 오차 방지)
 *
 * ⚠️ BigInt 필수: 분자 ≈ 925,000,000 × 920,550,000 ≈ 8.5×10¹⁷ > MAX_SAFE_INTEGER(9.0×10¹⁵)
 */
function allocateBundledTransferPrice(
  input: GeneralBuildingInput,
): GeneralBuildingAllocation {
  // 토지 기준시가 총액
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const totalStd = landStdTotal + input.transferBuildingStdPrice;

  // BigInt fallback 자동 적용 — 분자 ≈ 8.5×10¹⁷
  const landTransferPrice = Math.floor(
    safeMultiplyThenDivide(input.totalTransferPrice, landStdTotal, totalStd),
  );
  // 잔액 보정: 건물 = 총양도가 − 토지 (이중 floor 오차 제거)
  const buildingTransferPrice = input.totalTransferPrice - landTransferPrice;

  return { land: landTransferPrice, building: buildingTransferPrice };
}

/**
 * Step 2: 환산취득가 (소득세법 시행령 §176조의2 ④)
 *
 * 자산별로 취득시/양도시 기준시가 비율을 이용해 환산취득가를 산정한다.
 *
 * 토지 산식:
 *   acqLandStdTotal = INT(취득시 공시지가(원/㎡) × 면적)
 *   landAcq = INT(토지양도가 × acqLandStdTotal / landStdTotal)
 *
 * 건물 산식:
 *   buildingAcq = INT(건물양도가 × 취득시 건물기준시가 / 양도시 건물기준시가)
 *
 * ⚠️ BigInt 필수: 토지 분자 ≈ 904,725,192 × 238,000,000 ≈ 2.15×10¹⁷ > MAX_SAFE_INTEGER
 */
function calculateConvertedAcquisition(
  input: GeneralBuildingInput,
  allocation: GeneralBuildingAllocation,
): GeneralBuildingAcquisition {
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  // 토지 환산취득가 — BigInt fallback 자동 적용 (분자 ≈ 2.15×10¹⁷)
  const landAcq = Math.floor(
    safeMultiplyThenDivide(allocation.land, acqLandStdTotal, landStdTotal),
  );

  // 건물 환산취득가 — 분자 ≈ 2.0×10¹⁴ (MAX_SAFE_INTEGER 이내지만 safeMultiplyThenDivide로 통일)
  const buildingAcq = Math.floor(
    safeMultiplyThenDivide(
      allocation.building,
      input.acquisitionBuildingStdPrice,
      input.transferBuildingStdPrice,
    ),
  );

  return { land: landAcq, building: buildingAcq };
}

/**
 * Step 3: 개산공제 (소득세법 §97 ② 2호 + 시행령 §163 ⑥)
 *
 * 취득시 기준시가에 개산공제율을 곱해 필요경비를 산정한다.
 *
 * 토지 산식: INT(취득시 공시지가(원/㎡) × 면적 × 율)
 * 건물 산식: INT(취득시 건물기준시가 총액 × 율)
 *
 * 법정 기본율: 등기 자산 3%, 미등기 0.3%
 */
function calculateEstimatedDeduction(
  input: GeneralBuildingInput,
  rate: number,
): GeneralBuildingEstimatedDeduction {
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  const landDed = Math.floor(acqLandStdTotal * rate);
  const buildingDed = Math.floor(input.acquisitionBuildingStdPrice * rate);

  return { land: landDed, building: buildingDed };
}

// ============================================================
// 공개 메인 함수
// ============================================================

/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 — 자산 카드 2장 생성
 *
 * 5단 파이프라인:
 *   1. 양도가 안분 (§166⑥ 기준시가 비율)
 *   2. 환산취득가 (§176의2④)
 *   3. 개산공제 (§163⑥ 3%)
 *   4. 비사업용토지 판정 (배율 내 여부)
 *   5. 자산 카드 2장 (토지·건물) 생성 → aggregate 엔진에 위임
 *
 * @param input 일반건물 환산 입력
 * @returns 중간 계산값 + 비사업용 판정 + 자산 카드 2장
 *
 * 법령 근거:
 *   TRANSFER.GENERAL_BUILDING_APPORTIONMENT — §166⑥
 *   TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ — §176의2④
 *   TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION — §97②2호 + §163⑥
 *   NBL.BUILDING_SITE — §168의8 (건물 부수토지 배율)
 */
export function buildGeneralBuildingAssetCards(
  input: GeneralBuildingInput,
): GeneralBuildingOutput {
  // 개산공제율 결정 (기본 3%)
  const rate =
    input.estimatedDeductionRate ?? ESTIMATED_DEDUCTION_RATE_LAND_BUILDING;

  // Step 1: 양도가 안분 (§166⑥)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_APPORTIONMENT
  const allocation = allocateBundledTransferPrice(input);

  // Step 2: 환산취득가 (§176의2④)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ
  const acquisition = calculateConvertedAcquisition(input, allocation);

  // Step 3: 개산공제 (§163⑥)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION
  const estimatedDeduction = calculateEstimatedDeduction(input, rate);

  /**
   * 비사업용토지 판정 (MVP — 연면적÷층수 추정)
   *
   * ⚠️ 사각지대: 실제 1층 바닥면적이 더 작은 케이스(필로티·점포+주거)에서
   *    한도 미달임에도 사업용 판정될 수 있음.
   *    정밀 판정 필요 시 judgeNonBusinessLand() 연동으로 전환.
   *
   * 사례 31은 부수토지 85㎡로 어떤 추정값에서도 사업용 → MVP 충분.
   */
  // 법령 참조: NBL.BUILDING_SITE (시행령 §168의8)
  const multiplier = input.floorAreaMultiplier ?? 3;
  const estimatedFloorArea = input.buildingArea / input.buildingFloors;
  const allowedLandArea = estimatedFloorArea * multiplier;
  const isWithinNblRatio = input.landArea <= allowedLandArea;

  // Step 5: 자산 카드 2장 생성 (aggregate 엔진 위임용)
  const assetCards: AssetCardForAggregate[] = [
    {
      propertyId: "land",
      propertyLabel: "토지(1001)",
      propertyType: "land",
      transferPrice: allocation.land,
      acquisitionPrice: acquisition.land,
      expenses: estimatedDeduction.land,
      usedEstimatedAcquisition: true,
      estimatedBase: acquisition.land,
      estimatedDeduction: estimatedDeduction.land,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: !isWithinNblRatio,
    },
    {
      propertyId: "building",
      propertyLabel: "건물(3001)",
      propertyType: "general_building_unit",
      transferPrice: allocation.building,
      acquisitionPrice: acquisition.building,
      expenses: estimatedDeduction.building,
      usedEstimatedAcquisition: true,
      estimatedBase: acquisition.building,
      estimatedDeduction: estimatedDeduction.building,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false, // 건물 자체는 비사업용토지 판정 해당 없음
    },
  ];

  return {
    allocation,
    acquisition,
    estimatedDeduction,
    estimatedFloorArea,
    allowedLandArea,
    isWithinNblRatio,
    assetCards,
  };
}

// ============================================================
// 내부 계산값 노출 (단위 테스트 직접 접근용)
// ============================================================

/**
 * 토지 양도차익 계산 (단위 테스트용)
 * transferGain = 양도가 − 환산취득가 − 개산공제
 */
export function calcLandGain(output: GeneralBuildingOutput): number {
  return (
    output.allocation.land -
    output.acquisition.land -
    output.estimatedDeduction.land
  );
}

/**
 * 건물 양도차익 계산 (단위 테스트용)
 * transferGain = 양도가 − 환산취득가 − 개산공제 (차손 가능)
 */
export function calcBuildingGain(output: GeneralBuildingOutput): number {
  return (
    output.allocation.building -
    output.acquisition.building -
    output.estimatedDeduction.building
  );
}

// ── 법령 참조 재수출 (import 편의) ──
export { TRANSFER };
