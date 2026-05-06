/**
 * 직전거주주택보유주택(PHRP) 양도소득금액 안분 계산
 *
 * §161① (B1 — 12억 이하):
 *   taxableGain = gain95(표1) × (P_prior − P_acq) / (P_transfer − P_acq)
 *
 * §161② (B2 — 12억 초과):
 *   part1 = gain95(표1) × (P_prior − P_acq) / (P_transfer − P_acq)           (1호)
 *   part2 = gain95(표2) × (P_transfer − P_prior) / (P_transfer − P_acq)
 *           × (S − 12억) / S                                                   (2호)
 *   taxableGain = part1 + part2
 *
 * §161③ 캡 (Design 결정 (a) — 호별 분리 비교):
 *   B1: taxableGain ≤ gain95(표1)
 *   B2: part1 ≤ gain95(표1), part2 ≤ gain95(표2)
 *
 * 정수 연산 원칙:
 *   - 비율 = (분자 / 분모) → safeMultiplyThenDivide(gain, 분자, 분모)로 단번에 계산
 *   - Math.round() 절대 금지, Math.floor() 직접 호출 금지 → safeMultiplyThenDivide 위임
 *
 * 법령 근거: 소득세법 시행령 §161①②③④
 */

import { safeMultiplyThenDivide } from "../../tax-utils";
import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";

/** 기준시가 3-시점 검증 — 미입력(0) 또는 논리 오류 시 오류 코드 반환 */
export type PriceValidationError =
  | "P_ACQ_MISSING"        // P_acq 미입력
  | "P_PRIOR_MISSING"      // P_prior 미입력
  | "P_TRANSFER_MISSING"   // P_transfer 미입력
  | "DENOMINATOR_ZERO"     // P_transfer === P_acq (분모 0)
  | "P_PRIOR_OUT_OF_RANGE"; // P_prior < P_acq 또는 P_prior > P_transfer

export type PriceValidationResult =
  | { valid: true }
  | { valid: false; error: PriceValidationError; message: string };

/**
 * 기준시가 3-시점 입력값 검증
 *
 * 자동 안분 fallback 금지 정책: 미입력 시 validation 오류로 차단.
 */
export function validatePrices(
  P_acq: number | undefined,
  P_prior: number | undefined,
  P_transfer: number | undefined,
): PriceValidationResult {
  if (!P_acq || P_acq <= 0) {
    return {
      valid: false,
      error: "P_ACQ_MISSING",
      message: "PHRP 취득 당시 기준시가(P_acq)가 입력되지 않았습니다.",
    };
  }
  if (!P_prior || P_prior <= 0) {
    return {
      valid: false,
      error: "P_PRIOR_MISSING",
      message: "직전거주주택 양도 당시 PHRP 기준시가(P_prior)가 입력되지 않았습니다.",
    };
  }
  if (!P_transfer || P_transfer <= 0) {
    return {
      valid: false,
      error: "P_TRANSFER_MISSING",
      message: "PHRP 양도 당시 기준시가(P_transfer)가 입력되지 않았습니다.",
    };
  }
  if (P_transfer === P_acq) {
    return {
      valid: false,
      error: "DENOMINATOR_ZERO",
      message: `기준시가 분모(P_transfer − P_acq)가 0입니다. P_transfer(${P_transfer})와 P_acq(${P_acq})가 동일합니다.`,
    };
  }
  // P_prior는 P_acq ~ P_transfer 범위 내여야 논리적 (상승장 가정)
  // 단, 하락장에서 P_prior > P_transfer 가능하므로 경고 수준으로만 처리
  // 여기서는 P_prior < 0 만 차단
  if (P_prior < 0) {
    return {
      valid: false,
      error: "P_PRIOR_OUT_OF_RANGE",
      message: `직전거주주택 양도 당시 기준시가(P_prior)가 음수입니다.`,
    };
  }
  return { valid: true };
}

// ============================================================
// 안분 계산 결과
// ============================================================

export type AllocationResult = {
  /** 과세대상 양도소득금액 (원) */
  taxableGain: number;
  /** §161③ 캡 발동 여부 */
  capApplied: boolean;
  /** B2 1호 과세 양도소득금액 (B1은 undefined) */
  part1?: number;
  /** B2 2호 과세 양도소득금액 (B1은 undefined) */
  part2?: number;
  /** r161_1 = (P_prior − P_acq) / (P_transfer − P_acq) */
  ratio161_1: number;
  /** r161_2_2 = (P_transfer − P_prior) / (P_transfer − P_acq) (B2 전용) */
  ratio161_2_2?: number;
  /** r_high = (S − 12억) / S (B2 전용) */
  ratioHighValue?: number;
  /** 인용된 법령 조문 */
  appliedLaw: string;
};

/**
 * §161①·②·③ 기준시가 안분 계산
 *
 * @param gain95T1 gain95(표1) — §95① 양도소득금액 (표1 장기보유공제 적용)
 * @param gain95T2 gain95(표2) — §95① 양도소득금액 (표2 장기보유공제 적용)
 * @param S 양도가액 (원)
 * @param P_acq PHRP 취득 당시 기준시가 (원)
 * @param P_prior 직전거주주택 양도 당시 PHRP 기준시가 (원)
 * @param P_transfer PHRP 양도 당시 기준시가 (원)
 */
export function calculatePrhpAllocation(
  gain95T1: number,
  gain95T2: number,
  S: number,
  P_acq: number,
  P_prior: number,
  P_transfer: number,
): AllocationResult {
  const HIGH_VALUE_THRESHOLD = 1_200_000_000; // 12억

  // 공통 분자·분모
  const numerator1 = P_prior - P_acq;          // (P_prior − P_acq)
  const denominator = P_transfer - P_acq;      // (P_transfer − P_acq)

  // r161_1 = numerator1 / denominator (비율, 0~1 범위)
  // 소수 표현은 추적용으로만, 실제 계산은 safeMultiplyThenDivide 사용
  const ratio161_1 = denominator > 0 ? numerator1 / denominator : 0;

  // ─── B1: 12억 이하 ─────────────────────────────────────────
  if (S <= HIGH_VALUE_THRESHOLD) {
    // §161① 산식
    // taxableGain = gain95T1 × (P_prior − P_acq) / (P_transfer − P_acq)
    // safeMultiplyThenDivide(a, b, c) = Math.floor(a × b / c) (BigInt fallback 포함)
    let taxableGain = safeMultiplyThenDivide(gain95T1, numerator1, denominator);

    // §161③ 캡: taxableGain ≤ gain95(표1)
    let capApplied = false;
    if (taxableGain > gain95T1) {
      taxableGain = gain95T1;
      capApplied = true;
    }

    return {
      taxableGain,
      capApplied,
      ratio161_1,
      appliedLaw: TRANSFER_RENTAL_HOUSING.PIT_RD_161_1,
    };
  }

  // ─── B2: 12억 초과 ─────────────────────────────────────────
  const numerator2 = P_transfer - P_prior;     // (P_transfer − P_prior)

  const ratio161_2_2 = denominator > 0 ? numerator2 / denominator : 0;
  const ratioHighValue = S > 0 ? (S - HIGH_VALUE_THRESHOLD) / S : 0;

  // §161②1호: part1 = gain95T1 × (P_prior − P_acq) / (P_transfer − P_acq)
  let part1 = safeMultiplyThenDivide(gain95T1, numerator1, denominator);

  // §161②2호: part2 = gain95T2 × (P_transfer − P_prior) / (P_transfer − P_acq)
  //                           × (S − 12억) / S
  // 두 비율의 곱을 정수 연산으로: gain95T2 × numerator2 × (S−12억) / denominator / S
  // = safeMultiplyThenDivide(safeMultiplyThenDivide(gain95T2, numerator2, denominator), S - 12억, S)
  const highNumerator = S - HIGH_VALUE_THRESHOLD;
  const part2_before_high = safeMultiplyThenDivide(gain95T2, numerator2, denominator);
  let part2 = safeMultiplyThenDivide(part2_before_high, highNumerator, S);

  // §161③ 캡 — Design 결정 (a) 호별 분리 비교
  let capApplied = false;
  if (part1 > gain95T1) {
    part1 = gain95T1;
    capApplied = true;
  }
  if (part2 > gain95T2) {
    part2 = gain95T2;
    capApplied = true;
  }

  const taxableGain = part1 + part2;

  return {
    taxableGain,
    capApplied,
    part1,
    part2,
    ratio161_1,
    ratio161_2_2,
    ratioHighValue,
    appliedLaw: TRANSFER_RENTAL_HOUSING.PIT_RD_161_2_1,
  };
}
