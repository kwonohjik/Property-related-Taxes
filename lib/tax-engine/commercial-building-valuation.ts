/**
 * 상업용건물·오피스텔 환산취득가 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 단방향 의존: transfer-tax.ts → 이 파일 (역방향 금지).
 *
 * 법령 근거:
 *   소득세법 §97②2호 — 개산공제
 *   소득세법 시행령 §163⑥ — 개산공제율 3% (토지·건물)
 *   소득세법 §99①1호 가목·나목 — §164⑥ 산식의 '기준시가합'(가목의 가액 + 나목의 가액)
 *   소득세법 시행령 §164⑥ — 호별고시 전 취득 시 환산기준시가 추정
 *   소득세법 시행령 §176조의2②2호 — 환산취득가액 산식
 *
 * P0-2 원칙: 세율 × 금액 곱셈은 applyRate() 사용.
 * 정수 연산: INT() = Math.floor(). 중간 오버플로우는 safeMultiplyThenDivide() 방어.
 */

import { applyRate, safeMultiplyThenDivide } from "./tax-utils";
import { TRANSFER, ESTIMATED_DEDUCTION_RATE } from "./legal-codes";
import { ACQ_BASE_RATE_MAX_ACQ_YEAR } from "./data/building-standard-price";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  CommercialBuildingValuationInput,
  CommercialBuildingValuationResult,
} from "./types/commercial-building.types";

// ── 재수출 (외부 소비자 편의) ──
export type {
  CommercialBuildingValuationInput,
  CommercialBuildingValuationResult,
} from "./types/commercial-building.types";

// ============================================================
// 공개 유틸 함수 (단위 테스트 직접 가능)
// ============================================================

/**
 * 기준시가합 계산 — §164⑥ 산식의 「법 §99①1호 **가목**의 가액과 **나목**의 가액의 합계액」
 *
 * 기준시가합 = 가목의 가액(개별공시지가 원/㎡ × 대지면적 ㎡) + 나목의 가액(건물 기준시가 총액 원)
 *
 * ⚠️ §164①이 아니다 — §164①은 개별공시지가가 **없는** 토지의 평가방법(가목 단서 위임)이다.
 *
 * 토지 분: ㎡당 단가 × 대지면적 (개별공시지가는 ㎡당 고시이므로 곱셈 필요)
 * 건물 분: 사용자가 외부에서 ㎡당 단가 × 연면적(보정계수 반영)을 미리 곱해 입력한 총액 사용.
 *         3시점 입력 일관성 확보 (호별 고시는 단가 입력하되 엔진에서 곱셈 수행, 토지·건물 기준시가는 총액 입력 패턴).
 *
 * @param landPricePerSqm    개별공시지가 (원/㎡)
 * @param landArea           대지면적 (㎡)
 * @param buildingStdPriceTotal  건물 기준시가 총액 (원) — 외부에서 면적·보정계수 반영
 * @returns 기준시가합 (원, 정수) — 토지분 `개공지 × 면적`은 INT 절사 후 합산.
 *
 * ⚠️ floor 정합: 토지·건물 각 기준시가를 원 단위로 정수화한 뒤 합산한다.
 *    소수 분모가 safeMultiplyThenDivide의 BigInt/비-BigInt 경로에서 달리 처리되는
 *    1원 불일치(고액 양도 시 분자 MAX_SAFE 초과)를 구조적으로 차단.
 */
export function calcStdPriceSum(
  landPricePerSqm: number,
  landArea: number,
  buildingStdPriceTotal: number,
): number {
  return Math.floor(landPricePerSqm * landArea) + Math.floor(buildingStdPriceTotal);
}

/**
 * 최초고시 역환산으로 취득시 환산기준시가(P_A) 추정 (소득세법 시행령 §164⑥)
 *
 * 산식: INT( 최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합 )
 *
 * 이 값이 §163⑥의 '취득당시의 기준시가' — 개산공제 기준으로 사용됨.
 *
 * @param unitTotalAtFirstDisclosure  최초고시(2005) 호별총액 = 최초고시 ㎡당 호별고시가 × 연면적
 * @param stdPriceSumAtAcq           취득시 기준시가합
 * @param stdPriceSumAtFirst         최초고시시 기준시가합
 * @returns 취득시 환산기준시가 (원, 정수 — INT 적용)
 */
export function calcEstimatedStdPriceAtAcq(
  unitTotalAtFirstDisclosure: number,
  stdPriceSumAtAcq: number,
  stdPriceSumAtFirst: number,
): number {
  if (stdPriceSumAtFirst === 0) return 0;
  // 중간 곱셈 overflow 방지: safeMultiplyThenDivide 사용
  return safeMultiplyThenDivide(unitTotalAtFirstDisclosure, stdPriceSumAtAcq, stdPriceSumAtFirst);
}

/**
 * 환산취득가 합계 계산 (소득세법 시행령 §176조의2②2호)
 *
 * 산식: INT( 양도가액 × 취득당시기준시가 / 양도시호별총액 )
 *
 * 주의: 540M × 119M → 약 6.4×10^16 > MAX_SAFE_INTEGER(9×10^15) → safeMultiplyThenDivide 필수.
 *
 * @param transferPrice        양도가액 (원, 정수)
 * @param acquisitionStdPrice  취득당시기준시가 (C-01: P_A, C-02: 취득시 호별총액)
 * @param transferUnitTotal    양도시 호별총액 = 양도시 ㎡당 호별고시가 × 연면적
 * @returns 환산취득가 합계 (원, 정수 — INT 적용)
 */
export function calcEstimatedAcquisitionTotal(
  transferPrice: number,
  acquisitionStdPrice: number,
  transferUnitTotal: number,
): number {
  if (transferUnitTotal === 0) return 0;
  // 오버플로우 방지 — safeMultiplyThenDivide가 내부에서 BigInt fallback 처리
  return safeMultiplyThenDivide(transferPrice, acquisitionStdPrice, transferUnitTotal);
}

/**
 * 환산취득가 토지/건물 분리 (기준시가합의 가목:나목 비율)
 *
 * 토지분 = INT( 합계 × 취득시토지기준시가 / 취득시기준시가합 )
 * 건물분 = 합계 − 토지분
 *
 * @param totalEstimated   환산취득가 합계
 * @param landStdAtAcq     취득시 토지 기준시가합 = 개공지 × 대지면적
 * @param combinedStdAtAcq 취득시 기준시가합 (토지+건물)
 */
export function splitEstimatedAcquisitionByLandBuilding(
  totalEstimated: number,
  landStdAtAcq: number,
  combinedStdAtAcq: number,
): { land: number; building: number } {
  if (combinedStdAtAcq === 0) {
    return { land: 0, building: totalEstimated };
  }
  const land = safeMultiplyThenDivide(totalEstimated, landStdAtAcq, combinedStdAtAcq);
  return { land, building: totalEstimated - land };
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 상업용건물·오피스텔 환산취득가 계산 (소령 §164⑥ + §176조의2②2호)
 *
 * C-01 경로 (isPreDisclosure=true): 최초고시 역환산 → 취득시 환산기준시가 → 환산취득가
 * C-02 경로 (isPreDisclosure=false): 취득시 호별고시가 → 호별총액 비율 → 환산취득가
 *
 * @param input         CommercialBuildingValuationInput
 * @param transferPrice 양도가액 (원, 정수) — TransferTaxInput.transferPrice
 * @returns CommercialBuildingValuationResult
 * @throws Error  필수 입력값 누락 시 (validation은 UI/API에서 1차 차단하므로 여기서는 Error)
 */
export function calculateCommercialBuildingValuation(
  input: CommercialBuildingValuationInput,
  transferPrice: number,
): CommercialBuildingValuationResult {
  // ── 공통: 연면적 ──
  const floorAreaTotal = input.exclusiveArea + input.commonArea;

  // ── 공통: 양도시 호별총액 (floor 정합 — 원 단위 정수) ──
  const unitPriceTotalAtTransfer = Math.floor(input.unitPriceAtTransfer * floorAreaTotal);

  if (input.isPreDisclosure) {
    return _calcPreDisclosure(input, transferPrice, floorAreaTotal, unitPriceTotalAtTransfer);
  } else {
    return _calcPostDisclosure(input, transferPrice, floorAreaTotal, unitPriceTotalAtTransfer);
  }
}

// ============================================================
// 내부 경로 구현
// ============================================================

/**
 * C-01 경로: 호별고시 전 취득 (소령 §164⑥)
 * 최초고시 역환산으로 취득시 환산기준시가(P_A)를 추정한 후 환산취득가 계산.
 */
function _calcPreDisclosure(
  input: CommercialBuildingValuationInput,
  transferPrice: number,
  floorAreaTotal: number,
  unitPriceTotalAtTransfer: number,
): CommercialBuildingValuationResult {
  // 필수 입력 확인
  if (
    input.unitPriceAtFirstDisclosure === undefined ||
    input.buildingStdPriceAtAcquisition === undefined ||
    input.buildingStdPriceAtFirstDisclosure === undefined ||
    input.landPriceAtAcquisition === undefined ||
    input.landPriceAtFirstDisclosure === undefined
  ) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `[commercial-building] C-01 경로: 필수 입력값 누락. ` +
      `unitPriceAtFirstDisclosure·buildingStdPriceAtAcquisition·buildingStdPriceAtFirstDisclosure·` +
      `landPriceAtAcquisition·landPriceAtFirstDisclosure 모두 필수. ` +
      `법령: ${TRANSFER.COMMERCIAL_BUILDING_PRE_DISCLOSURE}`,
    );
  }

  // ── Step 1: 최초고시 호별총액 (floor 정합 — 원 단위 정수) ──
  const unitPriceTotalAtFirst = Math.floor(input.unitPriceAtFirstDisclosure * floorAreaTotal);

  // ── Step 2: 3시점 기준시가합 (법 §99①1호 가목의 가액 + 나목의 가액 — §164⑥ 산식) ──
  // 토지: ㎡당 개별공시지가 × 대지면적 (INT 절사) / 건물: 외부에서 면적 곱한 총액 (INT)
  // floor 정합: 각 기준시가를 원 단위 정수화 → 합·안분 분모의 BigInt 경로 일치 보장.
  const landStdAtAcq    = Math.floor(input.landPriceAtAcquisition * input.landArea);
  const buildingStdAtAcq = Math.floor(input.buildingStdPriceAtAcquisition);
  const combinedStdAtAcq = landStdAtAcq + buildingStdAtAcq;

  const landStdAtFirst    = Math.floor(input.landPriceAtFirstDisclosure * input.landArea);
  const buildingStdAtFirst = Math.floor(input.buildingStdPriceAtFirstDisclosure);
  const combinedStdAtFirst = landStdAtFirst + buildingStdAtFirst;

  // 양도시 기준시가합 (선택 입력 — 신고서 표시용)
  let landStdAtTransfer: number | undefined;
  let buildingStdAtTransfer: number | undefined;
  let combinedStdAtTransfer: number | undefined;
  if (input.landPriceAtTransfer !== undefined && input.buildingStdPriceAtTransfer !== undefined) {
    landStdAtTransfer    = Math.floor(input.landPriceAtTransfer * input.landArea);
    buildingStdAtTransfer = Math.floor(input.buildingStdPriceAtTransfer);
    combinedStdAtTransfer = landStdAtTransfer + buildingStdAtTransfer;
  }

  // ── Step 3: 취득시 환산기준시가(P_A) — 소령 §164⑥ ──
  // P_A = INT( 최초고시 호별총액 × 취득시 기준시가합 / 최초고시시 기준시가합 )
  const estimatedBasisAtAcq = calcEstimatedStdPriceAtAcq(
    unitPriceTotalAtFirst,
    combinedStdAtAcq,
    combinedStdAtFirst,
  );

  // ── Step 4: 환산취득가 합계 — 소령 §176조의2②2호 ──
  // INT( 양도가액 × P_A / 양도시호별총액 )
  const estimatedAcquisitionTotal = calcEstimatedAcquisitionTotal(
    transferPrice,
    estimatedBasisAtAcq,
    unitPriceTotalAtTransfer,
  );

  // ── Step 5: 환산취득가 토지/건물 분리 ──
  const { land: estimatedAcquisitionLand, building: estimatedAcquisitionBuilding } =
    splitEstimatedAcquisitionByLandBuilding(
      estimatedAcquisitionTotal,
      landStdAtAcq,
      combinedStdAtAcq,
    );

  // ── Step 6: 개산공제 — §97②2호 + §163⑥ ──
  // 취득당시의 기준시가(P_A) × 3%
  // 개산공제 총액 = INT(P_A × 0.03)
  const estimatedDeductionTotal = applyRate(estimatedBasisAtAcq, ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);

  // 토지/건물 분리 (내부 표시용 — 합계와 1원 차이 허용)
  const landDeductionRaw = combinedStdAtAcq > 0
    ? safeMultiplyThenDivide(estimatedDeductionTotal, landStdAtAcq, combinedStdAtAcq)
    : 0;
  const estimatedDeductionLand = landDeductionRaw;
  const estimatedDeductionBuilding = estimatedDeductionTotal - estimatedDeductionLand;

  return {
    floorAreaTotal,
    unitPriceTotalAtTransfer,
    unitPriceTotalAtFirst,
    combinedStdAtAcq,
    combinedStdAtFirst,
    combinedStdAtTransfer,
    landStdAtAcq,
    buildingStdAtAcq,
    landStdAtFirst,
    buildingStdAtFirst,
    landStdAtTransfer,
    buildingStdAtTransfer,
    estimatedBasisAtAcq,
    estimatedAcquisitionTotal,
    estimatedAcquisitionLand,
    estimatedAcquisitionBuilding,
    estimatedDeductionTotal,
    estimatedDeductionLand,
    estimatedDeductionBuilding,
    // §164⑥ 단서 — 취득연도가 나목(건물 기준시가) 고시 전 구간이면 §164⑤ 준용 대상이다.
    // 경계는 국세청 「취득당시 건물기준시가 산정기준율표」의 취득연도 축 상한(2000).
    ...(input.acquisitionYear !== undefined && {
      sec164_5ProvisoApplicable: input.acquisitionYear <= ACQ_BASE_RATE_MAX_ACQ_YEAR,
    }),
  };
}

/**
 * C-02 경로: 호별고시 후 취득 (소령 §176조의2②2호 단순 비율)
 * 취득시 호별고시가와 양도시 호별고시가의 비율로 환산취득가 계산.
 */
function _calcPostDisclosure(
  input: CommercialBuildingValuationInput,
  transferPrice: number,
  floorAreaTotal: number,
  unitPriceTotalAtTransfer: number,
): CommercialBuildingValuationResult {
  // C-02: 취득시 호별고시가 필수
  if (input.unitPriceAtAcquisition === undefined) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `[commercial-building] C-02 경로: unitPriceAtAcquisition (취득시 ㎡당 호별고시가) 필수. ` +
      `법령: ${TRANSFER.COMMERCIAL_BUILDING_ESTIMATED_ACQ}`,
    );
  }

  // 취득시 호별총액 (floor 정합 — 원 단위 정수)
  const unitTotalAtAcq = Math.floor(input.unitPriceAtAcquisition * floorAreaTotal);

  // ── 환산취득가 합계 ──
  // INT( 양도가액 × 취득시호별총액 / 양도시호별총액 )
  const estimatedAcquisitionTotal = calcEstimatedAcquisitionTotal(
    transferPrice,
    unitTotalAtAcq,
    unitPriceTotalAtTransfer,
  );

  // ── 토지/건물 분리 (C-02: 취득시 기준시가합 입력 있을 때만) ──
  let estimatedAcquisitionLand = 0;
  let estimatedAcquisitionBuilding = estimatedAcquisitionTotal;
  let landStdAtAcq: number | undefined;
  let buildingStdAtAcq: number | undefined;
  let combinedStdAtAcq: number | undefined;

  if (
    input.landPriceAtAcquisition !== undefined &&
    input.buildingStdPriceAtAcquisition !== undefined
  ) {
    landStdAtAcq    = Math.floor(input.landPriceAtAcquisition * input.landArea);
    buildingStdAtAcq = Math.floor(input.buildingStdPriceAtAcquisition);
    combinedStdAtAcq = landStdAtAcq + buildingStdAtAcq;
    const split = splitEstimatedAcquisitionByLandBuilding(
      estimatedAcquisitionTotal,
      landStdAtAcq,
      combinedStdAtAcq,
    );
    estimatedAcquisitionLand     = split.land;
    estimatedAcquisitionBuilding = split.building;
  }

  // ── 개산공제: 취득시 호별총액 × 3% ──
  const estimatedDeductionTotal = applyRate(unitTotalAtAcq, ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);

  // 토지/건물 분리 (기준시가합 있을 때만)
  let estimatedDeductionLand = 0;
  let estimatedDeductionBuilding = estimatedDeductionTotal;
  if (combinedStdAtAcq !== undefined && landStdAtAcq !== undefined) {
    const landDed = safeMultiplyThenDivide(estimatedDeductionTotal, landStdAtAcq, combinedStdAtAcq);
    estimatedDeductionLand     = landDed;
    estimatedDeductionBuilding = estimatedDeductionTotal - landDed;
  }

  // 양도시 기준시가합 (선택 입력)
  let landStdAtTransfer: number | undefined;
  let buildingStdAtTransfer: number | undefined;
  let combinedStdAtTransfer: number | undefined;
  if (input.landPriceAtTransfer !== undefined && input.buildingStdPriceAtTransfer !== undefined) {
    landStdAtTransfer    = Math.floor(input.landPriceAtTransfer * input.landArea);
    buildingStdAtTransfer = Math.floor(input.buildingStdPriceAtTransfer);
    combinedStdAtTransfer = landStdAtTransfer + buildingStdAtTransfer;
  }

  return {
    floorAreaTotal,
    unitPriceTotalAtTransfer,
    // C-02: 최초고시 관련 필드 없음
    unitPriceTotalAtFirst: undefined,
    combinedStdAtAcq,
    combinedStdAtFirst: undefined,
    combinedStdAtTransfer,
    landStdAtAcq,
    buildingStdAtAcq,
    landStdAtFirst: undefined,
    buildingStdAtFirst: undefined,
    landStdAtTransfer,
    buildingStdAtTransfer,
    estimatedBasisAtAcq: undefined,
    estimatedAcquisitionTotal,
    estimatedAcquisitionLand,
    estimatedAcquisitionBuilding,
    estimatedDeductionTotal,
    estimatedDeductionLand,
    estimatedDeductionBuilding,
  };
}
