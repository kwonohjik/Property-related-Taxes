/**
 * 저가·고가 양도에 따른 이익의 증여 판정 (상증법 §35)
 *
 * 과세 요건:
 *   특수관계인 간 거래:
 *     시가 대비 차액이 시가의 30% 이상 OR 3억원 이상인 경우
 *   특수관계인 外 거래:
 *     시가 대비 차액이 시가의 30% 이상 AND 3억원 이상인 경우
 *
 * 증여의제 이익 = 거래가액 - 시가 (저가 취득 시: 시가 - 취득가액 - min(기준, 30%*시가))
 */

import { GIFT } from "./legal-codes";
import type { CalculationStep } from "./types/inheritance-gift.types";

// ============================================================
// 상수
// ============================================================

/** 특수관계인 간 거래 과세 기준율 (30%) */
const RELATED_RATE_THRESHOLD = 0.30;
/** 거래가액 기준 절대금액 (3억원) */
const ABSOLUTE_THRESHOLD = 300_000_000;

// ============================================================
// 타입
// ============================================================

export interface BargainTransferInput {
  /** 거래 시 실제 대가 */
  transactionPrice: number;
  /** 시가 (평가기준일 기준) */
  marketValue: number;
  /** 특수관계인 여부 (상증법 §35 ①·②의 구분 기준) */
  isRelatedParty: boolean;
  /** 저가 취득(low purchase) vs 고가 양도(high sale) 구분 */
  transactionType: "purchase" | "sale";
}

export interface BargainTransferResult {
  /** 증여의제 과세 대상 여부 */
  isSubjectToGiftTax: boolean;
  /** 증여의제 이익액 */
  deemedGiftAmount: number;
  /** 차액 (시가 - 거래가) */
  priceDifference: number;
  /** 과세 기준 충족 여부 상세 */
  thresholdCheck: {
    rateThresholdMet: boolean;   // 30% 이상
    absoluteThresholdMet: boolean; // 3억 이상
  };
  breakdown: CalculationStep[];
  appliedLaws: string[];
}

// ============================================================
// 핵심 판정 함수
// ============================================================

/**
 * 저가·고가 양도 증여의제 판정 (상증법 §35)
 *
 * - 저가 취득: 수증인이 시가보다 낮게 취득한 경우 (시가 - 거래가액이 이익)
 * - 고가 양도: 수증인이 시가보다 높게 양도한 경우 (거래가액 - 시가가 이익)
 */
export function detectBargainTransfer(
  input: BargainTransferInput,
): BargainTransferResult {
  const { transactionPrice, marketValue, isRelatedParty, transactionType } = input;

  if (marketValue <= 0) {
    return _notSubject("시가가 0 이하 — 판정 불가");
  }

  // 차액 계산 (절대값)
  const diff = Math.abs(marketValue - transactionPrice);

  // 과세 기준 충족 여부
  const rateThresholdMet = diff >= marketValue * RELATED_RATE_THRESHOLD;
  const absoluteThresholdMet = diff >= ABSOLUTE_THRESHOLD;

  // 과세 요건 판단
  // 특수관계인: 30% 이상 OR 3억 이상
  // 非특수관계인: 30% 이상 AND 3억 이상
  const isSubjectToGiftTax = isRelatedParty
    ? rateThresholdMet || absoluteThresholdMet
    : rateThresholdMet && absoluteThresholdMet;

  if (!isSubjectToGiftTax) {
    return {
      isSubjectToGiftTax: false,
      deemedGiftAmount: 0,
      priceDifference: diff,
      thresholdCheck: { rateThresholdMet, absoluteThresholdMet },
      breakdown: [
        { label: "시가", amount: marketValue },
        { label: "거래가액", amount: transactionPrice },
        { label: "차액", amount: diff },
        {
          label: "과세 기준 미충족 — 증여세 비과세",
          amount: 0,
          lawRef: GIFT.BARGAIN_TRANSFER,
          note: isRelatedParty
            ? "특수관계인: 차액 < 30%·3억 모두 해당 없음"
            : "非특수관계인: 차액 < 30%·3억 중 하나 미충족",
        },
      ],
      appliedLaws: [GIFT.BARGAIN_TRANSFER],
    };
  }

  // 증여의제 이익 계산 (§35)
  // 특수관계인 (§35 ①): 이익 = |시가 - 거래가액| — 공제 없음
  // 비특수관계인 (§35 ②): 이익 = |시가 - 거래가액| - min(시가×30%, 3억)
  const rawDiff =
    transactionType === "purchase"
      ? marketValue - transactionPrice
      : transactionPrice - marketValue;

  let deemedGiftAmount = rawDiff;
  let nonRelatedDeduction = 0;

  if (!isRelatedParty) {
    // §35 ② 단서: 비특수관계인은 min(시가×30%, 3억) 공제
    nonRelatedDeduction = Math.min(
      Math.floor(marketValue * RELATED_RATE_THRESHOLD),
      ABSOLUTE_THRESHOLD,
    );
    deemedGiftAmount = Math.max(0, rawDiff - nonRelatedDeduction);
  }

  const breakdown: CalculationStep[] = [
    { label: "시가", amount: marketValue, lawRef: GIFT.BARGAIN_TRANSFER },
    { label: "거래가액", amount: transactionPrice },
    { label: "차액 (|시가 - 거래가|)", amount: rawDiff },
    {
      label: `과세 기준 충족 (${isRelatedParty ? "특수관계인" : "非특수관계인"})`,
      amount: 0,
      note: `30% 기준: ${rateThresholdMet ? "충족" : "미충족"}, 3억 기준: ${absoluteThresholdMet ? "충족" : "미충족"}`,
    },
    ...(nonRelatedDeduction > 0
      ? [
          {
            label: "비특수관계인 공제 — min(시가×30%, 3억) (§35 ②)",
            amount: -nonRelatedDeduction,
            lawRef: GIFT.BARGAIN_TRANSFER,
          },
        ]
      : []),
    {
      label: "증여의제 이익",
      amount: deemedGiftAmount,
      lawRef: GIFT.BARGAIN_TRANSFER,
      note: transactionType === "purchase" ? "저가 취득" : "고가 양도",
    },
  ];

  return {
    isSubjectToGiftTax: true,
    deemedGiftAmount: Math.max(0, deemedGiftAmount),
    priceDifference: diff,
    thresholdCheck: { rateThresholdMet, absoluteThresholdMet },
    breakdown,
    appliedLaws: [GIFT.BARGAIN_TRANSFER],
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
  };
}
