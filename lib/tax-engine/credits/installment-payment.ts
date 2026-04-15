/**
 * 연부연납 (상증법 §71)
 *
 * 상속세·증여세 결정세액이 2,000만원을 초과하는 경우
 * 납세자의 신청에 따라 분할 납부 가능.
 *
 * 연납기간:
 *   상속세 일반  : 허가일로부터 5년
 *   가업상속     : 허가일로부터 최대 20년 (10년 거치 후 10년 납부)
 *   증여세 일반  : 허가일로부터 5년
 *
 * 이자 상당액:
 *   국세환급가산금 이자율 기준 (시행령 §68 → 매년 고시)
 *   단순화: 연간 이자율은 Orchestrator가 DB에서 로드하여 전달
 *
 * 납부 계획:
 *   허가 시 1회분 납부 + 나머지를 연 1회씩 균등 납부
 */

import { TAX_CREDIT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";

// ============================================================
// 연부연납 기준 한도
// ============================================================

/** 연부연납 신청 가능 최소 세액: 2천만원 (§71 ①) */
const INSTALLMENT_MIN_TAX = 20_000_000;

/** 일반 최대 연납 기간: 5년 (§71 ①) */
const GENERAL_MAX_YEARS = 5;

/** 가업상속 최대 연납 기간: 20년 (§71 ① 단서) */
const FAMILY_BUSINESS_MAX_YEARS = 20;

// ============================================================
// 연부연납 계획 계산
// ============================================================

export interface InstallmentPaymentInput {
  /** 결정세액 */
  finalTax: number;
  /** 가업상속 여부 (최대 20년 적용) */
  isFamilyBusiness?: boolean;
  /** 납부자 선택 연납 기간 (년) — 미입력 시 최대 기간 적용 */
  requestedYears?: number;
  /**
   * 연납 이자율 (연간, e.g. 0.018 = 1.8%)
   * DB에서 로드하거나 별도 입력
   */
  annualInterestRate?: number;
}

export interface InstallmentScheduleItem {
  /** 납부 회차 (0 = 허가 즉시, 1부터 = 이후 연납 회차) */
  installmentNo: number;
  /** 납부 원금 */
  principal: number;
  /** 이자 상당액 */
  interest: number;
  /** 합계 납부액 */
  total: number;
}

export interface InstallmentPaymentResult {
  /** 연부연납 가능 여부 */
  eligible: boolean;
  /** 실제 적용 연납 기간 */
  appliedYears: number;
  /** 허가 즉시 납부액 (= 결정세액 / (연납기간+1), 첫 회) */
  initialPayment: number;
  /** 연납 회별 원금 */
  annualPrincipal: number;
  /** 연납 일정 (이자 포함) */
  schedule: InstallmentScheduleItem[];
  breakdown: CalculationStep[];
}

/**
 * 연부연납 계획 계산 (§71)
 *
 * @param input 연부연납 입력
 */
export function calcInstallmentPayment(
  input: InstallmentPaymentInput,
): InstallmentPaymentResult {
  const {
    finalTax,
    isFamilyBusiness = false,
    requestedYears,
    annualInterestRate = 0.018,
  } = input;

  // 연부연납 가능 여부 판단 (§71 ①)
  const eligible = finalTax > INSTALLMENT_MIN_TAX;

  if (!eligible) {
    return {
      eligible: false,
      appliedYears: 0,
      initialPayment: finalTax,
      annualPrincipal: 0,
      schedule: [],
      breakdown: [
        {
          label: "연부연납 불가 — 결정세액 2천만원 이하",
          amount: finalTax,
          lawRef: TAX_CREDIT.INSTALLMENT,
        },
      ],
    };
  }

  const maxYears = isFamilyBusiness
    ? FAMILY_BUSINESS_MAX_YEARS
    : GENERAL_MAX_YEARS;
  const appliedYears = Math.min(requestedYears ?? maxYears, maxYears);

  // 첫 회 납부: 총세액 / (연납 기간 + 1)
  const initialPayment = Math.floor(finalTax / (appliedYears + 1));
  // 나머지 연납 원금 (총세액 - 첫 회)
  const remainingTax = finalTax - initialPayment;

  // 연납 일정 생성 (간이 이자 계산)
  const schedule: InstallmentScheduleItem[] = [
    {
      installmentNo: 0,
      principal: initialPayment,
      interest: 0,
      total: initialPayment,
    },
  ];

  if (isFamilyBusiness && appliedYears > 10) {
    // 가업상속 특례: 최초 10년 거치(이자만 납부) + 이후 납부 기간 균등 분할 (§71 ① 단서)
    const deferralYears = 10;
    const paymentYears = appliedYears - deferralYears;
    const annualPrincipal = Math.floor(remainingTax / paymentYears);

    let outstandingBalance = remainingTax;

    // 거치 기간 (1~10년): 이자만 납부, 원금 0
    for (let year = 1; year <= deferralYears; year++) {
      const interest = Math.floor(outstandingBalance * annualInterestRate);
      schedule.push({
        installmentNo: year,
        principal: 0,
        interest,
        total: interest,
      });
    }

    // 납부 기간 (11~20년): 원금 + 이자 납부
    for (let year = deferralYears + 1; year <= appliedYears; year++) {
      const interest = Math.floor(outstandingBalance * annualInterestRate);
      const principal =
        year === appliedYears
          ? outstandingBalance
          : annualPrincipal;
      schedule.push({
        installmentNo: year,
        principal,
        interest,
        total: principal + interest,
      });
      outstandingBalance -= principal;
    }
  } else {
    // 일반 연납: 균등 분할
    const annualPrincipal = Math.floor(remainingTax / appliedYears);
    let outstandingBalance = remainingTax;

    for (let year = 1; year <= appliedYears; year++) {
      const interest = Math.floor(outstandingBalance * annualInterestRate);
      const principal =
        year === appliedYears
          ? outstandingBalance
          : annualPrincipal;
      schedule.push({
        installmentNo: year,
        principal,
        interest,
        total: principal + interest,
      });
      outstandingBalance -= principal;
    }
  }

  const annualPrincipal = isFamilyBusiness && appliedYears > 10
    ? Math.floor(remainingTax / (appliedYears - 10))
    : Math.floor(remainingTax / appliedYears);

  const breakdown: CalculationStep[] = [
    {
      label: `연부연납 적용 (${appliedYears}년 분할, 이자율 ${(annualInterestRate * 100).toFixed(1)}%)`,
      amount: finalTax,
      lawRef: TAX_CREDIT.INSTALLMENT,
    },
    {
      label: "허가 즉시 납부액",
      amount: initialPayment,
    },
    {
      label: `연납 회별 원금 (×${appliedYears}회)`,
      amount: annualPrincipal,
    },
  ];

  return {
    eligible,
    appliedYears,
    initialPayment,
    annualPrincipal,
    schedule,
    breakdown,
  };
}
