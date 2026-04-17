/**
 * 양도소득세 가산세 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음, 순수 함수.
 *
 * 적용 법령:
 *   신고불성실가산세: 국세기본법 §47의2 (무신고), §47의3 (과소신고·초과환급)
 *   지연납부가산세:   국세기본법 §47의4
 *   납부세액 기준:    부칙 §12848호 제10조② (2015.7.1 이후 양도분)
 */

import { differenceInCalendarDays } from "date-fns";
import { PENALTY, PENALTY_CONST } from "./legal-codes";
import { applyRate, truncateToWon } from "./tax-utils";

// ============================================================
// 타입 정의
// ============================================================

/** 신고 유형 */
export type FilingType =
  | "none"          // 무신고
  | "under"         // 과소신고 (신고했으나 납부세액 과소)
  | "excess_refund" // 초과환급신고 (환급세액 과다 신고)
  | "correct";      // 정상 신고

/** 부정행위 유형 */
export type PenaltyReason =
  | "normal"         // 일반 (단순 착오·실수)
  | "fraudulent"     // 부정행위 (이중장부·허위증빙·재산은닉 등 — 국세기본법 §26의2 ⑪)
  | "offshore_fraud"; // 역외거래 부정행위 (2015.7.1 이후 양도분 60%)

/** 신고불성실가산세 입력 */
export interface FilingPenaltyInput {
  /** 결정세액 (세액공제·감면 적용 후, §114조의2 가산세 가산 전) */
  determinedTax: number;
  /** 세액공제·감면액 합계 */
  reductionAmount: number;
  /** 기납부세액 (예정신고 납부액 포함) */
  priorPaidTax: number;
  /** 당초 신고세액 (과소신고 시 최초 신고한 납부세액; 무신고는 0) */
  originalFiledTax: number;
  /** 초과환급신고 환급세액 (환급 과다 수령액; 해당 없으면 0) */
  excessRefundAmount: number;
  /** 세법에 따른 이자상당액 가산액 (납부세액 산정에서 제외 — §47의3 ①) */
  interestSurcharge: number;
  /** 신고 유형 */
  filingType: FilingType;
  /** 부정행위 유형 */
  penaltyReason: PenaltyReason;
}

/** 지연납부가산세 입력 */
export interface DelayedPaymentInput {
  /** 미납·미달납부세액 */
  unpaidTax: number;
  /** 납부기한 (이 날까지 납부해야 함) */
  paymentDeadline: Date;
  /** 실제 납부일 (미제공 시 계산 기준일 사용) */
  actualPaymentDate?: Date;
  /** 계산 기준일 (actualPaymentDate 미제공 시 사용; 기본: 오늘) */
  calculationDate?: Date;
}

/** 계산 단계 */
export interface PenaltyStep {
  label: string;
  formula: string;
  amount: number;
  legalBasis?: string;
}

/** 신고불성실가산세 결과 */
export interface FilingPenaltyResult {
  /** 무신고·과소신고 납부세액 (가산세 산정 기준금액) */
  penaltyBase: number;
  /** 적용 가산세율 */
  penaltyRate: number;
  /** 신고불성실가산세액 */
  filingPenalty: number;
  /** 적용 법령 */
  legalBasis: string;
  steps: PenaltyStep[];
}

/** 지연납부가산세 결과 */
export interface DelayedPaymentResult {
  /** 미납세액 */
  unpaidTax: number;
  /** 경과일수 (납부기한 다음날 ~ 납부일) */
  elapsedDays: number;
  /** 적용 일 이자율 */
  dailyRate: number;
  /** 지연납부가산세액 */
  delayedPaymentPenalty: number;
  /** 납부기한 */
  paymentDeadline: Date;
  /** 계산기준일 */
  calculationDate: Date;
  steps: PenaltyStep[];
}

/** 통합 가산세 입력 */
export interface TransferTaxPenaltyInput {
  filing?: FilingPenaltyInput;
  delayedPayment?: DelayedPaymentInput;
}

/** 통합 가산세 결과 */
export interface TransferTaxPenaltyResult {
  filingPenalty: FilingPenaltyResult | null;
  delayedPaymentPenalty: DelayedPaymentResult | null;
  /** 가산세 합계 */
  totalPenalty: number;
}

// ============================================================
// 내부 유틸
// ============================================================

/** 납부기한 기준 일 이자율 결정 (국세기본법 시행령 §27의4 이력 적용) */
function resolveDailyRate(referenceDate: Date): number {
  const d = referenceDate;
  if (d >= new Date("2022-02-15")) return PENALTY_CONST.DAILY_PENALTY_RATE;
  if (d >= new Date("2019-02-12")) return PENALTY_CONST.DAILY_PENALTY_RATE_2019;
  return PENALTY_CONST.DAILY_PENALTY_RATE_2016;
}

/** 가산세율 결정 */
function resolveFilingRate(
  filingType: FilingType,
  penaltyReason: PenaltyReason,
): number {
  if (penaltyReason === "offshore_fraud") return PENALTY_CONST.OFFSHORE_FRAUD_RATE;
  if (penaltyReason === "fraudulent")     return PENALTY_CONST.FRAUDULENT_RATE;
  if (filingType === "none")              return PENALTY_CONST.NON_FILING_RATE;
  return PENALTY_CONST.UNDER_FILING_RATE; // "under" | "excess_refund"
}

// ============================================================
// 신고불성실가산세 계산 (국세기본법 §47의2·§47의3)
// ============================================================

/**
 * 신고불성실가산세 계산
 *
 * 납부세액 = 결정세액 − 세액공제·감면 − 기납부세액 − 당초 신고세액
 *           − 이자상당액 가산액 + 초과환급세액
 * 가산세 = 납부세액 × 가산세율
 *
 * 부칙 §12848호 §10② 기준 (2015.7.1 이후 양도분)
 */
export function calculateFilingPenalty(
  input: FilingPenaltyInput,
): FilingPenaltyResult {
  const steps: PenaltyStep[] = [];

  if (input.filingType === "correct") {
    return {
      penaltyBase: 0,
      penaltyRate: 0,
      filingPenalty: 0,
      legalBasis: PENALTY.NON_FILING,
      steps: [{ label: "정상신고", formula: "가산세 없음", amount: 0 }],
    };
  }

  // ① 납부세액 산정 (가산세 기준금액)
  const penaltyBase = Math.max(
    0,
    input.determinedTax
      - input.reductionAmount
      - input.priorPaidTax
      - input.originalFiledTax
      - input.interestSurcharge
      + input.excessRefundAmount,
  );

  steps.push({
    label: "납부세액 (가산세 기준)",
    formula: [
      `결정세액 ${input.determinedTax.toLocaleString()}원`,
      input.reductionAmount   > 0 ? `− 감면 ${input.reductionAmount.toLocaleString()}원` : null,
      input.priorPaidTax      > 0 ? `− 기납부 ${input.priorPaidTax.toLocaleString()}원` : null,
      input.originalFiledTax  > 0 ? `− 당초신고 ${input.originalFiledTax.toLocaleString()}원` : null,
      input.interestSurcharge > 0 ? `− 이자상당액 ${input.interestSurcharge.toLocaleString()}원` : null,
      input.excessRefundAmount > 0 ? `+ 초과환급 ${input.excessRefundAmount.toLocaleString()}원` : null,
    ].filter(Boolean).join(" "),
    amount: penaltyBase,
    legalBasis: PENALTY.ADDENDUM_2015,
  });

  if (penaltyBase <= 0) {
    return {
      penaltyBase: 0,
      penaltyRate: 0,
      filingPenalty: 0,
      legalBasis: PENALTY.NON_FILING,
      steps: [...steps, { label: "가산세", formula: "납부세액 없음 — 가산세 0", amount: 0 }],
    };
  }

  // ② 가산세율 결정
  const penaltyRate = resolveFilingRate(input.filingType, input.penaltyReason);
  const rateLabel = (penaltyRate * 100).toFixed(0) + "%";

  const legalBasis =
    input.filingType === "none" ? PENALTY.NON_FILING : PENALTY.UNDER_FILING;

  if (input.penaltyReason === "fraudulent" || input.penaltyReason === "offshore_fraud") {
    steps.push({
      label: "부정행위 가산세율",
      formula: input.penaltyReason === "offshore_fraud"
        ? `역외거래 부정행위 → ${rateLabel}`
        : `부정행위 → ${rateLabel}`,
      amount: 0,
      legalBasis: PENALTY.FRAUDULENT_DEF,
    });
  }

  // ③ 가산세 계산
  const filingPenalty = truncateToWon(applyRate(penaltyBase, penaltyRate));

  steps.push({
    label: "신고불성실가산세",
    formula: `납부세액 ${penaltyBase.toLocaleString()}원 × ${rateLabel}`,
    amount: filingPenalty,
    legalBasis,
  });

  return { penaltyBase, penaltyRate, filingPenalty, legalBasis, steps };
}

// ============================================================
// 지연납부가산세 계산 (국세기본법 §47의4)
// ============================================================

/**
 * 지연납부가산세 계산
 *
 * 가산세 = 미납세액 × 경과일수 × 일 이자율
 * 경과일수: 납부기한 다음날 ~ 실제 납부일(또는 계산기준일)
 */
export function calculateDelayedPaymentPenalty(
  input: DelayedPaymentInput,
): DelayedPaymentResult {
  const steps: PenaltyStep[] = [];
  const calcDate = input.actualPaymentDate ?? input.calculationDate ?? new Date();

  // 경과일수: 납부기한 다음날부터 기산 (납부기한 당일 납부 → 0일)
  const elapsedDays = Math.max(
    0,
    differenceInCalendarDays(calcDate, input.paymentDeadline),
  );

  if (input.unpaidTax <= 0 || elapsedDays <= 0) {
    return {
      unpaidTax: input.unpaidTax,
      elapsedDays: 0,
      dailyRate: PENALTY_CONST.DAILY_PENALTY_RATE,
      delayedPaymentPenalty: 0,
      paymentDeadline: input.paymentDeadline,
      calculationDate: calcDate,
      steps: [{ label: "지연납부가산세", formula: "경과일 없음 — 가산세 0", amount: 0 }],
    };
  }

  const dailyRate = resolveDailyRate(calcDate);
  const rateLabel = (dailyRate * 100).toFixed(4) + "%";

  steps.push({
    label: "경과일수",
    formula: `납부기한(${input.paymentDeadline.toLocaleDateString("ko-KR")}) 다음날 ~ 납부일(${calcDate.toLocaleDateString("ko-KR")})`,
    amount: elapsedDays,
    legalBasis: PENALTY.DELAYED_PAYMENT,
  });

  // 가산세 = 미납세액 × 경과일수 × 일 이자율 (원 미만 절사)
  const raw = input.unpaidTax * elapsedDays * dailyRate;
  const delayedPaymentPenalty = truncateToWon(raw);

  steps.push({
    label: "지연납부가산세",
    formula: `미납세액 ${input.unpaidTax.toLocaleString()}원 × ${elapsedDays}일 × ${rateLabel}`,
    amount: delayedPaymentPenalty,
    legalBasis: PENALTY.DAILY_RATE,
  });

  return {
    unpaidTax: input.unpaidTax,
    elapsedDays,
    dailyRate,
    delayedPaymentPenalty,
    paymentDeadline: input.paymentDeadline,
    calculationDate: calcDate,
    steps,
  };
}

// ============================================================
// 통합 가산세 계산
// ============================================================

/** 신고불성실가산세 + 지연납부가산세 통합 계산 */
export function calculateTransferTaxPenalty(
  input: TransferTaxPenaltyInput,
): TransferTaxPenaltyResult {
  const filingPenalty = input.filing
    ? calculateFilingPenalty(input.filing)
    : null;

  const delayedPaymentPenalty = input.delayedPayment
    ? calculateDelayedPaymentPenalty(input.delayedPayment)
    : null;

  const totalPenalty =
    (filingPenalty?.filingPenalty ?? 0) +
    (delayedPaymentPenalty?.delayedPaymentPenalty ?? 0);

  return { filingPenalty, delayedPaymentPenalty, totalPenalty };
}
