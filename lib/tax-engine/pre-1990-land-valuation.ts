/**
 * 1990.8.30. 개별공시지가 고시 이전 취득 토지의 취득 당시 기준시가 환산
 *
 * ## 배경
 * 1990.8.30. 부터 「지가공시 및 토지 등의 평가에 관한 법률」에 따라 개별공시지가가
 * 최초로 고시되었다. 그 이전에 취득한 토지는 개별공시지가가 존재하지 않으므로
 * 토지대장에 기재된 토지등급(1~365)과 등급가액표를 이용해 기준시가를 환산한다.
 *
 * ## 공식 (소득세법 시행규칙 §80 ⑥ · 집행기준 97-176의2)
 * ```
 *   ㎡당 가액 = 1990.1.1. 개별공시지가 × 비율
 *
 *   분모평균  = (90.8.30. 현재 등급가액 + 90.8.30. 직전 등급가액) / 2
 *   분모      = min(분모평균, 90.8.30. 현재 등급가액)       ← [CAP-1]
 *   비율원값  = 취득시 등급가액 / 분모
 *   비율최종  = min(비율원값, 1.0)  if 취득일 ≥ 1990-01-01   ← [CAP-2]
 *              else 비율원값          (등급조정기간 상이 시 그대로)
 * ```
 *
 * ## 5가지 산정 유형 (집행기준 예시)
 * - Case ① 등급조정이 계속 없었던 경우 — 직전=취득시
 * - Case ② 1990.1.1. 등급조정이 없는 경우 — 현재=직전 (수시조정 동일 간주)
 * - Case ③ 분모가액이 90.8.30. 현재 등급가액을 초과 — CAP-1 발동
 * - Case ④ 등급조정기간 동일 + 비율 100% 초과 — CAP-2 발동
 * - Case ⑤ 등급조정기간 상이 + 비율 100% 초과 — CAP-2 예외 (그대로 적용)
 *
 * ## 연동
 * `transfer-tax.ts` 의 `TransferTaxInput.pre1990Land` 필드로 제공되면 본 모듈이
 * `standardPriceAtAcquisition` / `standardPriceAtTransfer` 를 자동 산출해 주입한다.
 *
 * 본 모듈은 DB 호출 없이 순수 함수로만 동작한다.
 */

import { getGradeValue } from "./data/land-grade-values";
import { TRANSFER } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { safeMultiply } from "./tax-utils";

// ============================================================
// 경계 상수
// ============================================================

/** 개별공시지가 최초 고시일 — 이날부터는 본 모듈 대신 개별공시지가 직접 사용 */
export const INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE = new Date("1990-08-30");
/** 1990.1.1. 정기조정 기준일 — CAP-2 트리거 경계 */
export const GRADE_CAP_TRIGGER_DATE = new Date("1990-01-01");

// ============================================================
// 타입 정의
// ============================================================

/**
 * 토지등급 입력 표현.
 * - 숫자: 등급 번호 (1~365) → 내부에서 `getGradeValue()` 조회
 * - 객체: 등급가액 직접 입력 (표에 없는 경우·365+ 외삽 등)
 */
export type LandGradeInput = number | { gradeValue: number };

export interface Pre1990LandValuationInput {
  /** 취득일 (< 1990-08-30 이어야 의미 있음). CAP-2 트리거 판정에도 사용. */
  acquisitionDate: Date;
  /** 면적 (㎡). 소수 허용. */
  areaSqm: number;
  /** 양도일 (양도시 기준시가 산출용 — 기록·경계 경고용, 계산엔 미사용) */
  transferDate: Date;

  /** 1990.1.1. 개별공시지가 (원/㎡) */
  pricePerSqm_1990: number;
  /** 양도당시 개별공시지가 (원/㎡) */
  pricePerSqm_atTransfer: number;

  /** 1990.8.30. 현재 토지등급 (또는 등급가액 직접 입력) */
  grade_1990_0830: LandGradeInput;
  /**
   * 1990.8.30. 직전 토지등급.
   * - 1990.1.1. 정기조정이 없었다면 현재 등급과 동일하게 입력 (Case ②).
   * - 1990.1.1. 이전의 마지막 수시조정 값 (Case ①③④⑤).
   */
  gradePrev_1990_0830: LandGradeInput;
  /** 취득시점 유효 토지등급 (취득일 직전에 결정된 등급) */
  gradeAtAcquisition: LandGradeInput;

  /**
   * 선택: CAP-2(비율 100% cap) override.
   * 기본 판정 규칙: `acquisitionDate >= 1990-01-01` ⇒ CAP-2 활성.
   * 수동 제어가 필요한 드문 예외 케이스에서만 사용.
   */
  forceRatioCap?: boolean;
}

export type CaseType =
  | "case1_no_adjustment"
  | "case2_no_1990_adjustment"
  | "case3_denominator_cap"
  | "case4_ratio_cap"
  | "case5_ratio_no_cap"
  | "standard";

export interface Pre1990LandValuationBreakdown {
  gradeValueAtAcquisition: number;
  gradeValue_1990_0830: number;
  gradeValuePrev_1990_0830: number;

  /** (현재 + 직전) / 2 */
  averageDenominator: number;
  /** min(평균, 현재) — 실제 사용된 분모 */
  appliedDenominator: number;
  /** CAP-1 발동 여부 (평균이 현재를 초과해 현재로 cap됨) */
  denominatorCap1Applied: boolean;

  /** 취득시 / appliedDenominator */
  rawRatio: number;
  /** 실제 사용된 비율 (CAP-2 적용 시 1.0, 아니면 rawRatio) */
  appliedRatio: number;
  /** CAP-2 트리거 (취득일 >= 1990-01-01 또는 forceRatioCap=true) */
  ratioCap2Triggered: boolean;
  /** CAP-2가 실제로 비율을 낮췄는지 (triggered + rawRatio>1.0) */
  ratioCap2Applied: boolean;

  /** 사람이 읽는 계산 공식 */
  formula: string;
  /** 법적 근거 */
  legalBasis: string;
}

export interface Pre1990LandValuationResult {
  /** ㎡당 가액 (원, 정수 — 원단위 절사) */
  pricePerSqmAtAcquisition: number;
  /** 취득시 기준시가 = ㎡당 가액 × 면적 (원, 정수) */
  standardPriceAtAcquisition: number;
  /** 양도시 기준시가 = 양도당시 개별공시지가 × 면적 (원, 정수) */
  standardPriceAtTransfer: number;

  /** 5유형 분류 결과 (UI 설명용) */
  caseType: CaseType;
  caseLabel: string;

  breakdown: Pre1990LandValuationBreakdown;

  /** 입력 경계 경고 */
  warnings: string[];
}

// ============================================================
// 내부 헬퍼
// ============================================================

/** 등급 입력을 등급가액(숫자)으로 해석 */
function resolveGradeValue(input: LandGradeInput, fieldLabel: string): number {
  if (typeof input === "number") {
    return getGradeValue(input);
  }
  const v = input.gradeValue;
  if (!Number.isFinite(v) || v <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `${fieldLabel} 등급가액은 양수여야 합니다 (입력: ${v})`,
    );
  }
  return v;
}

function validateInput(input: Pre1990LandValuationInput): void {
  if (!(input.acquisitionDate instanceof Date) || Number.isNaN(input.acquisitionDate.getTime())) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_DATE, "acquisitionDate가 유효한 Date가 아닙니다");
  }
  if (!(input.transferDate instanceof Date) || Number.isNaN(input.transferDate.getTime())) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_DATE, "transferDate가 유효한 Date가 아닙니다");
  }
  if (!Number.isFinite(input.areaSqm) || input.areaSqm <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `면적(areaSqm)은 양수여야 합니다 (입력: ${input.areaSqm})`);
  }
  if (!Number.isFinite(input.pricePerSqm_1990) || input.pricePerSqm_1990 <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `1990.1.1. 개별공시지가는 양수여야 합니다 (입력: ${input.pricePerSqm_1990})`);
  }
  if (!Number.isFinite(input.pricePerSqm_atTransfer) || input.pricePerSqm_atTransfer <= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `양도당시 개별공시지가는 양수여야 합니다 (입력: ${input.pricePerSqm_atTransfer})`);
  }
}

// ============================================================
// 5유형 분류기
// ============================================================

export function classifyCaseType(
  breakdown: Pre1990LandValuationBreakdown,
): CaseType {
  const { gradeValueAtAcquisition, gradeValue_1990_0830, gradeValuePrev_1990_0830,
          denominatorCap1Applied, rawRatio, ratioCap2Triggered, ratioCap2Applied } = breakdown;

  // Case ④: CAP-2가 실제로 비율을 낮춘 경우
  if (ratioCap2Applied) return "case4_ratio_cap";

  // Case ⑤: CAP-2 미트리거 + 비율 > 100%
  if (!ratioCap2Triggered && rawRatio > 1.0) return "case5_ratio_no_cap";

  // Case ③: 분모가 현재로 capping 된 경우
  if (denominatorCap1Applied) return "case3_denominator_cap";

  // Case ②: 1990.1.1. 정기조정이 없었던 경우 (현재 = 직전)
  if (gradeValue_1990_0830 === gradeValuePrev_1990_0830) return "case2_no_1990_adjustment";

  // Case ①: 등급조정이 없었던 경우 (직전 = 취득시)
  if (gradeValuePrev_1990_0830 === gradeValueAtAcquisition) return "case1_no_adjustment";

  return "standard";
}

function caseLabelOf(type: CaseType): string {
  switch (type) {
    case "case1_no_adjustment":       return "Case ① — 등급조정이 계속 없었던 경우";
    case "case2_no_1990_adjustment":  return "Case ② — 1990.1.1. 등급조정이 없는 경우";
    case "case3_denominator_cap":     return "Case ③ — 분모가액이 90.8.30. 현재를 초과 (분모 capping)";
    case "case4_ratio_cap":           return "Case ④ — 등급조정기간 동일 + 비율 100% 초과 (비율 capping)";
    case "case5_ratio_no_cap":        return "Case ⑤ — 등급조정기간 상이 + 비율 100% 초과 (그대로 적용)";
    case "standard":                  return "표준 경로";
  }
}

// ============================================================
// 메인 계산
// ============================================================

export function calculatePre1990LandValuation(
  input: Pre1990LandValuationInput,
): Pre1990LandValuationResult {
  validateInput(input);

  const warnings: string[] = [];
  if (input.acquisitionDate.getTime() >= INDIVIDUAL_LAND_PRICE_FIRST_NOTICE_DATE.getTime()) {
    warnings.push(
      "취득일이 1990.8.30. 이후입니다. 개별공시지가가 존재하므로 본 환산 대신 직접 사용을 권고합니다.",
    );
  }

  const gradeValueAtAcquisition   = resolveGradeValue(input.gradeAtAcquisition,   "취득시");
  const gradeValue_1990_0830      = resolveGradeValue(input.grade_1990_0830,      "90.8.30. 현재");
  const gradeValuePrev_1990_0830  = resolveGradeValue(input.gradePrev_1990_0830,  "90.8.30. 직전");

  // [CAP-1] 분모 capping
  const averageDenominator = (gradeValue_1990_0830 + gradeValuePrev_1990_0830) / 2;
  const appliedDenominator = Math.min(averageDenominator, gradeValue_1990_0830);
  const denominatorCap1Applied = averageDenominator > gradeValue_1990_0830;

  if (appliedDenominator <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "분모가 0 이하입니다. 등급가액 입력을 확인하세요",
    );
  }

  // [CAP-2] 비율 capping
  const rawRatio = gradeValueAtAcquisition / appliedDenominator;
  const ratioCap2Triggered =
    input.forceRatioCap !== undefined
      ? input.forceRatioCap
      : input.acquisitionDate.getTime() >= GRADE_CAP_TRIGGER_DATE.getTime();
  const appliedRatio = ratioCap2Triggered && rawRatio > 1.0 ? 1.0 : rawRatio;
  const ratioCap2Applied = ratioCap2Triggered && rawRatio > 1.0;

  // ㎡당 가액 = 1990.1.1. 개별공시지가 × 비율 (원단위 절사)
  const pricePerSqmAtAcquisition = Math.floor(input.pricePerSqm_1990 * appliedRatio);

  // 기준시가 = ㎡당 가액 × 면적 (원단위 절사)
  const standardPriceAtAcquisition = Math.floor(
    safeMultiply(pricePerSqmAtAcquisition, input.areaSqm),
  );
  const standardPriceAtTransfer = Math.floor(
    safeMultiply(input.pricePerSqm_atTransfer, input.areaSqm),
  );

  const formula =
    `㎡당 가액 = ${input.pricePerSqm_1990.toLocaleString()} × ` +
    `${gradeValueAtAcquisition.toLocaleString()} / ` +
    `${appliedDenominator.toLocaleString()}` +
    (denominatorCap1Applied ? " [분모 capping: min(평균, 현재)]" : "") +
    (ratioCap2Applied ? " [비율 100% capping]" : "") +
    ` = ${pricePerSqmAtAcquisition.toLocaleString()}원/㎡`;

  const breakdown: Pre1990LandValuationBreakdown = {
    gradeValueAtAcquisition,
    gradeValue_1990_0830,
    gradeValuePrev_1990_0830,
    averageDenominator,
    appliedDenominator,
    denominatorCap1Applied,
    rawRatio,
    appliedRatio,
    ratioCap2Triggered,
    ratioCap2Applied,
    formula,
    legalBasis: `${TRANSFER.PRE1990_STD_PRICE_CONVERSION}, ${TRANSFER.PRE1990_CAP_RULE}, ${TRANSFER.PRE1990_GUIDELINE}`,
  };

  const caseType = classifyCaseType(breakdown);

  return {
    pricePerSqmAtAcquisition,
    standardPriceAtAcquisition,
    standardPriceAtTransfer,
    caseType,
    caseLabel: caseLabelOf(caseType),
    breakdown,
    warnings,
  };
}

export { getGradeValue };
