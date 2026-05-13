/**
 * 재개발/재건축 — 청산금 안분 (분양가 산정 + §166②1호/§166①2호 안분 산식)
 *
 * 법령 근거 (law.go.kr 확인 2026-05-13):
 * - ★ 시행령 §166②1호 (APT + 청산금 납부, 사례 44 핵심):
 *     인가후양도차익 = 양도가액 − 분양가 − 인가후 필요경비
 *       (단, 분양가 = 평가액 + 납부청산금)
 *     청산금납부분양도차익 = 인가후양도차익 × 납부청산금 / 분양가
 *     기존건물분양도차익  = 인가후양도차익 × 평가액 / 분양가 + 인가전양도차익
 *
 * - 시행령 §166①2호 (입주권 + 청산금 수령):
 *     가목: 양도가액 − (평가액 − 지급받은 청산금) − 필요경비
 *     나목: 인가전양도차익 × (평가액 − 지급받은 청산금) / 평가액
 *
 * - 시행령 §166②2호 (APT + 청산금 수령): §166①2호 산식 준용
 *
 * 본 PR 사례 44 (APT + 납부) 검증:
 *   분양가 = 219,218,500 + 92,781,500 = 312,000,000
 *   기존건물분 비율 = 219,218,500 / 312,000,000 = 0.70262...
 *   청산금분 비율   =  92,781,500 / 312,000,000 = 0.29737...
 *   인가후 양도차익 = 525,000,000 − 312,000,000 − 0 = 213,000,000
 *   기존건물분(인가후) = 213,000,000 × 0.70262 = 149,658,784
 *   청산금분           = 213,000,000 × 0.29737 = 63,341,216
 *   합계 = 213,000,000 (잔차 0)
 */

import { safeMultiplyThenDivide } from "./tax-utils";
import type { RedevelopmentInfo } from "./types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// 분양가 산정
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 분양가 계산 (§166②1호의 "평가액 + 납부청산금" / 수령 시 "평가액 − 지급받은 청산금").
 *
 * @returns 분양가 (원, 정수). subject="apt" 만 의미 있음.
 */
export function computeSalePriceTotal(
  rightsValue: number,
  settlementAmount: number,
  settlementDirection: "pay" | "receive",
): number {
  if (settlementDirection === "pay") {
    return rightsValue + settlementAmount;
  }
  // 수령: 평가액 − 지급받은 청산금
  return Math.max(0, rightsValue - settlementAmount);
}

// ──────────────────────────────────────────────────────────────────────────────
// §166②1호 안분 (APT + 청산금 납부) — 사례 44 핵심
// ──────────────────────────────────────────────────────────────────────────────

/** §166②1호 안분 결과 */
export interface AptPaySplit {
  /** 청산금납부분 양도차익 = 인가후양도차익 × 납부청산금 / 분양가 */
  settlementGain: number;
  /** 인가후 기존건물분 양도차익 = 인가후양도차익 × 평가액 / 분양가 */
  postApprovalExistingHouseGain: number;
  /** 분양가 (= 평가액 + 납부청산금) */
  salePriceTotal: number;
}

/**
 * §166②1호 — APT 양도 + 청산금 납부 인가후 양도차익 안분.
 *
 * 입력의 인가후양도차익을 권리가액/청산금 비율로 안분.
 * 1원 잔차는 청산금 분에 흡수 (기존건물분을 먼저 floor 후 잔차 = 청산금 분).
 *
 * @param postApprovalGain 인가후 양도차익 (양도가액 − 분양가 − 인가후 필요경비)
 * @param rightsValue 권리가액
 * @param settlementAmount 납부 청산금
 */
export function splitAptPay(
  postApprovalGain: number,
  rightsValue: number,
  settlementAmount: number,
): AptPaySplit {
  const salePriceTotal = rightsValue + settlementAmount;

  if (salePriceTotal <= 0 || postApprovalGain <= 0) {
    return {
      settlementGain: 0,
      postApprovalExistingHouseGain: 0,
      salePriceTotal,
    };
  }

  // 기존건물분 = floor(인가후 × 평가액 / 분양가)
  const existingGain = safeMultiplyThenDivide(postApprovalGain, rightsValue, salePriceTotal);

  // 청산금 분 = 인가후 − 기존건물분 (잔차 1원 흡수, 합산 일치 보장)
  const settlementGain = postApprovalGain - existingGain;

  return {
    settlementGain,
    postApprovalExistingHouseGain: existingGain,
    salePriceTotal,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// §166①2호 안분 (입주권 / APT 청산금 수령)
// ──────────────────────────────────────────────────────────────────────────────

/** §166①2호 안분 결과 (청산금 수령) */
export interface ReceiveSplit {
  /**
   * 청산금 수령분 양도차익 (= 청산금 수령액 − 안분 취득가액).
   * 안분 취득가액 = 종전 취득가액 × (settlementAmount / rightsValue)
   */
  settlementGain: number;
  /**
   * 인가전양도차익 안분 (수령 비율 차감) — §166①2호 나목:
   *   인가전양도차익 × (평가액 − 지급받은 청산금) / 평가액
   */
  preApprovalGainAdjusted: number;
  /** 안분 종전 취득가액 (settlement.apportionedAcquisition 매핑) */
  apportionedAcquisition: number;
}

/**
 * §166①2호 — 청산금 수령 안분.
 *
 * 청산금 수령분 양도차익은 청산금 수령액에서 안분 취득가액을 차감.
 * 안분 종전 취득가액 = 종전 취득가액 × (청산금 수령액 / 평가액)
 *
 * 인가전 양도차익은 (평가액 − 청산금) / 평가액 비율로 축소됨.
 *
 * @param preApprovalGain 인가전 양도차익 (수령 비율 적용 전)
 * @param oldAcquisitionPrice 종전 부동산 취득가액 (실가 또는 환산)
 * @param rightsValue 권리가액 (= 평가액)
 * @param settlementAmount 수령 청산금
 */
export function splitReceive(
  preApprovalGain: number,
  oldAcquisitionPrice: number,
  rightsValue: number,
  settlementAmount: number,
): ReceiveSplit {
  if (rightsValue <= 0 || settlementAmount <= 0) {
    return {
      settlementGain: 0,
      preApprovalGainAdjusted: preApprovalGain,
      apportionedAcquisition: 0,
    };
  }

  // 안분 취득가액 = 종전 취득가액 × (settlementAmount / rightsValue)
  const apportionedAcquisition = safeMultiplyThenDivide(
    oldAcquisitionPrice,
    settlementAmount,
    rightsValue,
  );

  // 청산금 수령분 양도차익 = 청산금 수령액 − 안분 취득가액
  const settlementGain = Math.max(0, settlementAmount - apportionedAcquisition);

  // 인가전 양도차익 축소: × (rightsValue − settlementAmount) / rightsValue
  const remainingRatio = rightsValue - settlementAmount;
  const preApprovalGainAdjusted =
    remainingRatio > 0
      ? safeMultiplyThenDivide(preApprovalGain, remainingRatio, rightsValue)
      : 0;

  return {
    settlementGain,
    preApprovalGainAdjusted,
    apportionedAcquisition,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 편의 함수 — RedevelopmentInfo 에서 분양가·안분 비율 추출 (UI 미리보기용)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * UI 미리보기용 분양가·안분 비율 (정수 연산 결과).
 * 실제 양도차익 안분은 splitAptPay/splitReceive 사용.
 */
export function computeSettlementPreview(
  info: RedevelopmentInfo,
): {
  salePriceTotal: number;
  existingRatio: number;
  settlementRatio: number;
} {
  const salePriceTotal = computeSalePriceTotal(
    info.rightsValue,
    info.settlementAmount,
    info.settlementDirection,
  );

  if (salePriceTotal <= 0) {
    return { salePriceTotal: 0, existingRatio: 0, settlementRatio: 0 };
  }

  if (info.settlementDirection === "pay") {
    return {
      salePriceTotal,
      existingRatio: info.rightsValue / salePriceTotal,
      settlementRatio: info.settlementAmount / salePriceTotal,
    };
  }

  // 수령: 비율 의미가 다름 (청산금이 양도가액의 일부)
  return {
    salePriceTotal,
    existingRatio: 1, // 인가전 분 비중
    settlementRatio: info.settlementAmount / Math.max(1, info.rightsValue),
  };
}
