/**
 * 분납 (分納) — 상증법 §70② · 시행령 §66②
 *
 * 상속세·증여세 납부할 세액(결정세액)이 1천만원을 초과하는 경우,
 * 납세자의 신청에 따라 그 일부를 납부기한 경과 후 2개월 이내에 분할납부할 수 있다.
 *
 * 분납 가능액 (시행령 §66②):
 *   1. 납부할 세액이 2천만원 이하인 때: 1천만원을 초과하는 금액
 *   2. 납부할 세액이 2천만원을 초과하는 때: 그 세액의 100분의 50 이하의 금액
 *
 * 연부연납(§71)과 배타: §71 연부연납을 허가받은 경우 분납 불가 (§70② 단서).
 *
 * ⚠️ 순환 의존 주의: 분납액 산출에는 finalTax(엔진 계산 결과)가 필요하므로
 *    분납액(splitAmount)을 엔진 input으로 받을 수 없다. 이 함수는 finalTax를
 *    payableTax로 주입받아 산출하며, 증여 엔진은 finalTax 산출 후 내부에서 호출한다.
 */

import { applyRate } from "../tax-utils";
import { TAX_CREDIT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";

const SPLIT_PAYMENT = TAX_CREDIT.SPLIT_PAYMENT;

// ============================================================
// 분납 기준 한도 (§70② · §66②)
// ============================================================

/** 분납 신청 가능 최소 세액: 1천만원 초과 (§70②) */
const SPLIT_MIN_TAX = 10_000_000;

/** 구간1/구간2 경계: 2천만원 (§66②) */
const SPLIT_TIER_BOUNDARY = 20_000_000;

// ============================================================
// 분납 계산
// ============================================================

export interface InstallmentSplitInput {
  /** 납부할 세액 (= finalTax, 결정세액). 원 단위 정수. */
  payableTax: number;
  /** 분납 신청 의사 */
  applyInstallmentSplit: boolean;
  /** 분납 희망액 (미입력 시 최대 분납액). "이하" 범위 내 납세자 선택. */
  requestedSplitAmount?: number;
  /** 연부연납(§71) 허가 여부 — true면 분납 불가 (§70② 단서) */
  applyLongTermInstallment?: boolean;
}

export interface InstallmentSplitResult {
  /** 분납 가능 여부 (payableTax > 1천만 && 연부연납 아님) */
  eligible: boolean;
  /** 분납 적용 여부 (eligible && applyInstallmentSplit) */
  applied: boolean;
  /** 구간별 최대 분납 가능액 */
  maxSplitAmount: number;
  /** 실제 분납액 (2차 납부) */
  splitAmount: number;
  /** 1차 납부액 (= payableTax - splitAmount, 신고기한 이내) ≡ 신고서 신고납부칸 */
  firstPayment: number;
  /** 2차 분납액 (= splitAmount, 분납기한 이내) */
  secondPayment: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

/**
 * 분납 적격 여부 단일 판정 (§70② 임계).
 * 결과뷰 카드·availablePrintIds 공용 — dual-truth 방지.
 */
export function isInstallmentSplitEligible(finalTax: number): boolean {
  return finalTax > SPLIT_MIN_TAX;
}

/**
 * 분납 계산 (§70② · §66②) — 상속·증여 공용 순수 함수.
 */
export function calcInstallmentSplit(
  input: InstallmentSplitInput,
): InstallmentSplitResult {
  const {
    payableTax,
    applyInstallmentSplit,
    requestedSplitAmount,
    applyLongTermInstallment = false,
  } = input;

  const breakdown: CalculationStep[] = [];
  const warnings: string[] = [];

  const notApplied = (
    eligible: boolean,
  ): InstallmentSplitResult => ({
    eligible,
    applied: false,
    maxSplitAmount: 0,
    splitAmount: 0,
    firstPayment: payableTax,
    secondPayment: 0,
    breakdown,
    warnings,
  });

  // 1. 연부연납 배타 (§70② 단서)
  if (applyLongTermInstallment) {
    warnings.push(`${SPLIT_PAYMENT} 단서: §71 연부연납 허가 시 분납할 수 없습니다.`);
    return notApplied(false);
  }

  // 2. 임계 판정 (§70② "1천만원을 초과")
  if (payableTax <= SPLIT_MIN_TAX) {
    return notApplied(false);
  }

  // 3. 구간별 최대 분납액 (§66②)
  let maxSplitAmount: number;
  if (payableTax <= SPLIT_TIER_BOUNDARY) {
    // 구간1: 2천만 이하 → 1천만원을 초과하는 금액
    maxSplitAmount = payableTax - SPLIT_MIN_TAX;
    breakdown.push({
      label: "최대 분납액 (2천만 이하)",
      amount: maxSplitAmount,
      lawRef: SPLIT_PAYMENT,
      note: `${payableTax.toLocaleString()} − 10,000,000 = ${maxSplitAmount.toLocaleString()}`,
    });
  } else {
    // 구간2: 2천만 초과 → 세액의 50% 이하
    maxSplitAmount = applyRate(payableTax, 0.5);
    breakdown.push({
      label: "최대 분납액 (2천만 초과)",
      amount: maxSplitAmount,
      lawRef: SPLIT_PAYMENT,
      note: `${payableTax.toLocaleString()} × 50% = ${maxSplitAmount.toLocaleString()}`,
    });
  }

  // 4. 미신청 — 적격이나 적용 안 함
  if (!applyInstallmentSplit) {
    return { ...notApplied(true), maxSplitAmount };
  }

  // 5. 희망액 clamp ("이하" 범위)
  let desired = requestedSplitAmount ?? maxSplitAmount;
  if (desired > maxSplitAmount) {
    warnings.push(
      `입력하신 분납 희망액(${desired.toLocaleString()})이 최대 분납액(${maxSplitAmount.toLocaleString()})을 초과하여 최대 분납액으로 조정합니다.`,
    );
    desired = maxSplitAmount;
  }
  if (desired <= 0) {
    desired = maxSplitAmount;
  }

  // 6. 확정 — 1차는 나머지 흡수 (항등식 firstPayment + secondPayment = payableTax)
  const splitAmount = desired;
  const firstPayment = payableTax - splitAmount;
  const secondPayment = splitAmount;

  breakdown.push({
    label: "1차 납부액 (신고기한 이내)",
    amount: firstPayment,
    lawRef: SPLIT_PAYMENT,
    note: `${payableTax.toLocaleString()} − ${splitAmount.toLocaleString()} = ${firstPayment.toLocaleString()}`,
  });
  breakdown.push({
    label: "2차 분납액 (분납기한 이내)",
    amount: secondPayment,
    lawRef: SPLIT_PAYMENT,
  });

  return {
    eligible: true,
    applied: true,
    maxSplitAmount,
    splitAmount,
    firstPayment,
    secondPayment,
    breakdown,
    warnings,
  };
}
