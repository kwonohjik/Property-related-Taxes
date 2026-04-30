/**
 * 취득세 중과 배제 판정 모듈
 *
 * [P1-0] 입력 일관성 검증 (validateInputConsistency)
 * [P1-4] 시가표준액 1억(수도권)/2억(비수도권) 이중 기준 중과 배제
 * [P1-6.5] §13의2④ 조정대상지역 지정 전 매매계약 보호
 *
 * 지방세법 §13의2④ — 지정 전 계약·계약금 증빙 시 비조정지역 취득 간주
 * 지방세법 시행령 §28의2 1호 — 시가표준액 한도 충족 시 중과 배제
 */

import { ACQUISITION, ACQUISITION_CONST } from "../legal-codes";

// ============================================================
// P1-0: 입력 일관성 검증
// ============================================================

/** 입력 일관성 검증 결과 */
export interface InputValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * [P1-0] 취득세 중과 입력 일관성 검증 헬퍼
 *
 * 비논리 조합 차단:
 * 1. 법인 + 가족증여 관계 → 불가 (법인에 가족 개념 없음)
 * 2. 법인 + 생애최초 → 불가 (법인은 생애최초 해당 없음)
 * 3. 부담부증여 + 채무 0 → 불가 (부담이 없으면 부담부증여 아님)
 * 4. 별장 + 2023-03-14 이후 잔금 → 별장 중과 폐지 안내
 */
export function validateInputConsistency(input: {
  acquiredBy?: string;
  giftRelation?: string;
  isFirstHome?: boolean;
  acquisitionCause?: string;
  encumbrance?: number;
  isLuxuryProperty?: boolean;
  luxuryType?: string;
  balancePaymentDate?: string;
}): InputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 규칙 1: 법인 + 가족증여 (giftRelation) — 법인에게 가족 관계는 존재하지 않음
  if (input.acquiredBy === "corporation" && input.giftRelation === "spouse_or_lineal") {
    errors.push(
      "법인(corporation)에는 배우자·직계존비속 관계가 적용되지 않습니다. " +
      "giftRelation을 'other'로 변경하거나 acquiredBy를 'individual'로 수정하세요."
    );
  }

  // 규칙 2: 법인 + 생애최초 — 법인은 생애최초 감면 대상 아님
  if (input.acquiredBy === "corporation" && input.isFirstHome === true) {
    errors.push(
      "법인(corporation)은 생애최초 주택 감면(지방세특례제한법 §36의3) 대상이 아닙니다. " +
      "isFirstHome을 false로 수정하세요."
    );
  }

  // 규칙 3: 부담부증여 + 채무 0 — 부담이 없으면 부담부증여 성립 불가
  if (input.acquisitionCause === "burdened_gift" && input.encumbrance === 0) {
    errors.push(
      "부담부증여(burdened_gift)는 승계 채무가 0원이면 성립하지 않습니다. " +
      "encumbrance를 실제 채무액으로 입력하거나 acquisitionCause를 'gift'로 변경하세요."
    );
  }

  // 규칙 4: 별장 타입 + 2023-03-14 이후 잔금 → 별장 중과 폐지 안내
  // (지방세법 §13⑤ 별장 중과: 2023.3.14부로 폐지)
  if (
    input.isLuxuryProperty === true &&
    input.luxuryType === "villa" &&
    input.balancePaymentDate &&
    input.balancePaymentDate >= "2023-03-14"
  ) {
    warnings.push(
      "별장 중과세율은 2023년 3월 14일 이후 잔금일부터 폐지되었습니다 (지방세법 §13⑤ 개정). " +
      "isLuxuryProperty=true 설정이 별장(villa) 유형에 한해 중과 배제됩니다."
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================
// P1-4: 시가표준액 1억(수도권)/2억(비수도권) 이중 기준 중과 배제
// ============================================================

/**
 * [P1-4] 시가표준액 저가 주택 중과 배제 여부 판정
 *
 * 지방세법 시행령 §28의2 1호:
 * - 가목: 수도권 소재 — 시가표준액(전체 주택 기준) 1억원 이하
 * - 나목: 수도권 외 소재 — 시가표준액(전체 주택 기준) 2억원 이하
 * - 단서: 정비구역(재개발·재건축조합·소규모주택정비) 소재 주택은 배제 불가
 *
 * @param wholeStdValue 전체 주택 시가표준액 (지분/부속토지 취득 시 전체 주택 기준)
 * @param isMetropolitanRegion 수도권 여부 (true: 1억 한도, false: 2억 한도)
 * @param isUrbanRegenerationArea 정비구역(재개발·재건축·소규모주택정비) 소재 여부
 *
 * 주의: 지분 50% 취득 + 전체 시가 2억 → 중과 배제 불가 (전체 기준이므로)
 */
export function isExemptFromSurcharge_LowValue(
  wholeStdValue: number,
  isMetropolitanRegion = true,
  isUrbanRegenerationArea = false
): boolean {
  // 정비구역은 단서에 의해 배제 불가
  if (isUrbanRegenerationArea) return false;

  // 수도권 1억 / 비수도권 2억 이중 기준
  const limit = isMetropolitanRegion
    ? ACQUISITION_CONST.LOW_VALUE_SURCHARGE_EXEMPT_METRO    // 1억
    : ACQUISITION_CONST.LOW_VALUE_SURCHARGE_EXEMPT_NON_METRO; // 2억

  return wholeStdValue <= limit;
}

// ============================================================
// P1-6.5: §13의2④ 조정대상지역 지정 전 계약 보호
// ============================================================

/**
 * [P1-6.5] 조정대상지역 지정고시일 이전 계약 여부 판정
 *
 * 지방세법 §13의2④:
 * "조정대상지역 지정고시일 이전에 주택에 대한 매매계약(공동주택 분양계약 포함)을
 * 체결한 경우(계약금을 지급한 사실 등이 증빙서류에 의하여 확인되는 경우에 한함)에는
 * 조정대상지역으로 지정되기 전에 주택을 취득한 것으로 본다."
 *
 * 조건 만족 시 assessSurcharge 진입부에서 isRegulatedArea = false 강제 적용.
 *
 * @param contractDateBeforeRegulation 계약일이 조정지역 지정고시일 이전인지
 * @param hasContractDepositProof 계약금 지급 증빙 보유 여부
 */
export function isPreRegulationContractProtected(
  contractDateBeforeRegulation: boolean | undefined,
  hasContractDepositProof: boolean | undefined
): boolean {
  // 두 조건 모두 충족해야 보호 적용 (§13의2④ 단서)
  if (!contractDateBeforeRegulation) return false;
  if (!hasContractDepositProof) return false;
  return true;
}

/**
 * [P1-6.5] §13의2④ 보호 적용 시 isRegulatedArea 재정의
 *
 * 계약금 증빙과 계약일이 지정 전임이 확인되면 비조정지역 취득 간주.
 *
 * @param isRegulatedArea 현재 잔금일 기준 조정대상지역 여부
 * @param input §13의2④ 관련 입력
 */
export function resolveRegulatedAreaStatus(
  isRegulatedArea: boolean | undefined,
  input: {
    contractDateBeforeRegulation?: boolean;
    hasContractDepositProof?: boolean;
  }
): boolean {
  const isProtected = isPreRegulationContractProtected(
    input.contractDateBeforeRegulation,
    input.hasContractDepositProof
  );

  // 보호 적용 시 비조정지역 취득으로 간주
  if (isProtected && isRegulatedArea) {
    return false; // 비조정으로 강제
  }

  return isRegulatedArea ?? false;
}

export const EXCLUSION_LEGAL_BASIS = [
  ACQUISITION.SURCHARGE_EXCLUSION,
  ACQUISITION.PRE_REGULATION_CONTRACT,
] as const;
