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

  /**
   * 🔴 2026-08-25 정정(E1-03 — **세액 변경**): 종전에는 `postApprovalGain <= 0`도 조기 반환해
   *    **음수 인가후양도차익을 통째로 버렸다**. §166②1호는 clamp 없는 **대수적 합**이고,
   *    두 안분분을 더하면 분모가 약분돼 **합계 = 인가후 + 인가전**이 된다 — 즉 §166①1호(입주권)
   *    합계와 같아야 한다. clamp 때문에 음수분이 사라져 인가전 이익만 남았고, 같은 사실을
   *    자산 종류만 바꿔 태우면 다른 양도차익이 나왔다(실측 250,000,000 vs 100,000,000).
   *
   *    음수 차익의 최종 처리는 양도소득금액 단계(`total.taxableIncome`의 `Math.max(0, …)`)가
   *    이미 담당한다 — **분기 단계에서 자를 이유가 없다**.
   *
   * ⚠️ 남은 조기 반환은 **분모 0 방어**뿐이다(평가액·청산금이 모두 0).
   */
  if (salePriceTotal <= 0) {
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
   * 인가후 양도차익 — §166①2호 가목:
   *   양도가액 − (평가액 − 지급받은 청산금) − 인가후 필요경비
   *
   * law.go.kr §166①2호가목 원문 (2026-05-15 확인):
   *   "[양도가액-(기존건물과 그 부수토지의 평가액-지급받은 청산금)-법 제97조제1항제2호 및 제3호에 따른 필요경비]"
   */
  settlementGain: number;
  /**
   * 인가전양도차익 안분 (수령 비율 차감) — §166①2호 나목:
   *   [(인가전양도차익)] × [(평가액 − 지급받은 청산금) ÷ 평가액]
   *
   * law.go.kr §166①2호나목 원문 (2026-05-15 확인):
   *   "[(기존건물과 그 부수토지의 평가액-기존건물과 그 부수토지의 취득가액-필요경비)]
   *    ×[(평가액-지급받은 청산금)÷평가액]"
   */
  preApprovalGainAdjusted: number;
  /**
   * 인가전 분 안분 취득가액 = 종전 취득가액 × (평가액 − 청산금) / 평가액.
   * UI 결과 카드 표시용. settlementGain 계산에는 미사용 (가목 산식에서 직접 산정).
   */
  apportionedAcquisition: number;
}

/**
 * §166①2호 — 청산금 수령 안분.
 *
 * ★ 2026-05-15 법령 원문 재확인 후 가목 산식 정정:
 *   - 이전 구현: settlementGain = 청산금 수령액 − 안분취득가액  (잘못됨)
 *   - 정정 후:  settlementGain = 양도가액 − (평가액 − 수령청산금) − 인가후 필요경비  (가목)
 *
 * 사례 38 검증: 양도가 320M, 평가액 300M, 수령 50M → 320M − 250M = 70M (PDF 일치)
 *
 * @param preApprovalGain 인가전 양도차익 (나목 축소 전)
 * @param oldAcquisitionPrice 종전 부동산 취득가액 (실가 또는 환산) — 인가전 분 apportionedAcquisition 표시용
 * @param rightsValue 권리가액 (= 평가액)
 * @param settlementAmount 수령 청산금
 * @param transferPrice 실제 양도가액 (가목 계산에 필요)
 * @param postApprovalExpenses 인가후 필요경비 (가목 차감 항목, 기본 0)
 */
export function splitReceive(
  preApprovalGain: number,
  oldAcquisitionPrice: number,
  rightsValue: number,
  settlementAmount: number,
  transferPrice: number,
  postApprovalExpenses: number = 0,
): ReceiveSplit {
  if (rightsValue <= 0 || settlementAmount <= 0) {
    return {
      settlementGain: 0,
      preApprovalGainAdjusted: preApprovalGain,
      apportionedAcquisition: 0,
    };
  }

  // ★ §166①2호 가목: 인가후 양도차익 = 양도가액 − (평가액 − 지급받은 청산금) − 인가후 필요경비
  const salePriceTotal = Math.max(0, rightsValue - settlementAmount); // 분양가 방어 — 유지

  /**
   * 🔴 2026-08-27 정정(T1-05 — **세액 변경**): 종전에는 `Math.max(0, …)`으로 음수를 잘랐다.
   *    §166①2호는 「각 목의 금액을 **합한 가액**」이고 음수를 0으로 본다는 단서가 없다.
   *    §166②2호가 「제1항제2호에 따른 가액」이라고만 하므로 **완공APT 분기
   *    (`computeAptReceive`)와 쌍으로 같은 규칙을 쓴다** — 한쪽만 고치면 같은 사실이
   *    자산 종류에 따라 다른 양도차익을 낸다.
   *
   *    음수 처리는 하류 담당(단건 `transfer-tax.ts` 0 바닥 · 집계 `skipLossFloor`로 §102② 통산).
   *    선례: 1호(납부) `splitAptPay` — E1-03 `96ed87b4`(2026-08-25).
   */
  const settlementGain = transferPrice - salePriceTotal - postApprovalExpenses;

  // §166①2호 나목: 인가전 양도차익 × (평가액 − 청산금) / 평가액
  const remainingRatio = rightsValue - settlementAmount;
  const preApprovalGainAdjusted =
    remainingRatio > 0
      ? safeMultiplyThenDivide(preApprovalGain, remainingRatio, rightsValue)
      : 0;

  // 인가전 분 안분 취득가액: 표시 전용 — 가목 계산에는 불필요
  // = 종전 취득가액 × (평가액 − 청산금) / 평가액
  const apportionedAcquisition = safeMultiplyThenDivide(
    oldAcquisitionPrice,
    remainingRatio,
    rightsValue,
  );

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
