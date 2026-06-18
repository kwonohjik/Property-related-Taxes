/**
 * 저가·고가 양도에 따른 이익의 증여 판정 (상증법 §35)
 *
 * 본칙 §35①·시행령 §26②③④ 정합:
 *   특수관계인 §35①: 적용요건 차액 ≥ MIN(시가30%, 3억)[§26②]
 *                    → 증여재산가액 = 차액 − MIN(시가30%, 3억)
 *   비특수관계인 §35②: 적용요건 차액 ≥ 시가30%[§26③]
 *                    → 증여재산가액 = 차액 − 3억[§26④, 고정]
 *                    (거래관행상 정당한 사유 없는 경우에 한정 — §35②)
 *   §35③: 법인세 §52② 시가 해당 등 과세제외 (부정행위 시 배제는 상위 판단)
 *
 *   차액 = 저가양수 시 (시가 − 대가), 고가양도 시 (대가 − 시가).
 *   증여재산가액 > 0 일 때만 과세 대상(isSubjectToGiftTax).
 */

import { GIFT } from "./legal-codes";
import { applyRate } from "./tax-utils";
import type { CalculationStep } from "./types/inheritance-gift.types";

// ============================================================
// 상수
// ============================================================

/** 시가 대비 기준율 (30%) — §26②③ */
const RATE_THRESHOLD = 0.3;
/** 절대 기준금액 (3억원) — §26②④ */
const ABSOLUTE_THRESHOLD = 300_000_000;

// ============================================================
// 타입
// ============================================================

export interface BargainTransferInput {
  /** 거래 시 실제 대가 */
  transactionPrice: number;
  /** 시가 (평가기준일 기준) */
  marketValue: number;
  /** 특수관계인 여부 (§35①·②의 구분 기준) */
  isRelatedParty: boolean;
  /** 저가 양수(purchase) vs 고가 양도(sale) */
  transactionType: "purchase" | "sale";
  /** 비특수관계인 §35② — 거래관행상 정당한 사유 (true → 미적용) */
  hasJustifiableReason?: boolean;
  /** §35③ 과세제외 (법인세 §52② 시가 해당·거래소 상장 시가거래 등) */
  isExcludedTransaction?: boolean;
}

export interface BargainTransferResult {
  /** 증여의제 과세 대상 여부 (증여재산가액 > 0) */
  isSubjectToGiftTax: boolean;
  /** 증여재산가액 (원, 정수) */
  deemedGiftAmount: number;
  /** 차액 (방향 적용 후) */
  priceDifference: number;
  /** 임계 판정 상세 */
  thresholdCheck: {
    rateThresholdMet: boolean; // 차액 ≥ 시가30%
    absoluteThresholdMet: boolean; // 차액 ≥ 3억
  };
  breakdown: CalculationStep[];
  appliedLaws: string[];
  /** 미적용 사유 */
  exclusionReason?: string;
}

// ============================================================
// 핵심 판정 함수
// ============================================================

export function detectBargainTransfer(
  input: BargainTransferInput,
): BargainTransferResult {
  const {
    transactionPrice,
    marketValue,
    isRelatedParty,
    transactionType,
    hasJustifiableReason,
    isExcludedTransaction,
  } = input;

  if (marketValue <= 0) return _notSubject("시가가 0 이하 — 판정 불가");
  if (isExcludedTransaction)
    return _notSubject("상증법 §35③ 과세제외 (법인세 §52② 시가 해당 등)");
  if (!isRelatedParty && hasJustifiableReason)
    return _notSubject("상증법 §35② — 거래관행상 정당한 사유 (비특수관계인)");

  // 차액 (저가양수: 시가−대가 / 고가양도: 대가−시가)
  const diff =
    transactionType === "purchase"
      ? marketValue - transactionPrice
      : transactionPrice - marketValue;

  const rateThreshold = applyRate(marketValue, RATE_THRESHOLD); // floor(시가×30%)
  const rateThresholdMet = diff >= rateThreshold;
  const absoluteThresholdMet = diff >= ABSOLUTE_THRESHOLD;

  if (diff <= 0) {
    return {
      isSubjectToGiftTax: false,
      deemedGiftAmount: 0,
      priceDifference: 0,
      thresholdCheck: { rateThresholdMet: false, absoluteThresholdMet: false },
      breakdown: [
        { label: "시가", amount: marketValue },
        { label: "거래대가", amount: transactionPrice },
        { label: "차액 없음 (대가 ≥ 시가)", amount: 0, lawRef: GIFT.BARGAIN_TRANSFER },
      ],
      appliedLaws: [GIFT.BARGAIN_TRANSFER],
      exclusionReason: "차액 없음 (대가 ≥ 시가)",
    };
  }

  // 적용요건·공제 (본칙 정합)
  let applyThreshold: number;
  let deduction: number;
  if (isRelatedParty) {
    // §35①: 적용요건·공제 모두 MIN(시가30%, 3억)
    const base = Math.min(rateThreshold, ABSOLUTE_THRESHOLD);
    applyThreshold = base;
    deduction = base;
  } else {
    // §35②: 적용요건 시가30%, 공제 3억(고정 §26④)
    applyThreshold = rateThreshold;
    deduction = ABSOLUTE_THRESHOLD;
  }

  const applyEligible = diff >= applyThreshold;
  const deemedGiftAmount = applyEligible ? Math.max(0, diff - deduction) : 0;
  const isSubjectToGiftTax = deemedGiftAmount > 0;

  const breakdown: CalculationStep[] = [
    { label: "시가", amount: marketValue, lawRef: GIFT.BARGAIN_TRANSFER },
    { label: "거래대가", amount: transactionPrice },
    {
      label: transactionType === "purchase" ? "차액 (시가 − 대가)" : "차액 (대가 − 시가)",
      amount: diff,
    },
    {
      label: isRelatedParty
        ? "공제 — 시가의 30%와 3억 중 적은 금액"
        : "공제 — 3억 (특수관계인 외)",
      amount: -deduction,
      lawRef: GIFT.BARGAIN_TRANSFER,
    },
    {
      label: "증여재산가액",
      amount: deemedGiftAmount,
      lawRef: GIFT.BARGAIN_TRANSFER,
      note: `${isRelatedParty ? "특수관계인 §35①" : "특수관계인 외 §35②"} · ${transactionType === "purchase" ? "저가양수" : "고가양도"}`,
    },
  ];

  return {
    isSubjectToGiftTax,
    deemedGiftAmount,
    priceDifference: diff,
    thresholdCheck: { rateThresholdMet, absoluteThresholdMet },
    breakdown,
    appliedLaws: [GIFT.BARGAIN_TRANSFER],
    exclusionReason: isSubjectToGiftTax
      ? undefined
      : applyEligible
        ? "공제 후 증여재산가액 0"
        : "차액이 기준금액 미만",
  };
}

// ============================================================
// 내부 헬퍼
// ============================================================

function _notSubject(note: string): BargainTransferResult {
  return {
    isSubjectToGiftTax: false,
    deemedGiftAmount: 0,
    priceDifference: 0,
    thresholdCheck: { rateThresholdMet: false, absoluteThresholdMet: false },
    breakdown: [{ label: note, amount: 0 }],
    appliedLaws: [GIFT.BARGAIN_TRANSFER],
    exclusionReason: note,
  };
}
