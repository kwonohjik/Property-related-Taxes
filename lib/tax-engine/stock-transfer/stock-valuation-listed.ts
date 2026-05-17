/**
 * 주식 양도소득세 — 상장주식 평가 모듈
 *
 * §99①3: 상장주식 기준시가 = 평가기준일 이전 1개월 종가평균
 * 거래정지·관리종목: 시행령 §165③ → 비상장 보충 평가로 우회
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

export interface ListedValuationResult {
  /** 1주당 취득기준시가 (원) */
  perShareValue: number;
  /** 양도일 기준 취득가액 = perShareValue × shareCount */
  totalAcquisitionPrice: number;
  method: "monthly_avg_listed";
  appliedRule: string;
  tradingHaltFallback: boolean;
}

/**
 * 상장주식 환산취득가 — 1개월 종가평균 기준시가 방식
 *
 * 거래정지·관리종목(tradingHaltAtTransfer=true) 시 양도일 1개월 종가평균
 * 확인 불가 → 비상장 보충 평가로 fallback (호출자에서 분기 처리)
 */
export function calcListedValuation(input: StockTransferInput): ListedValuationResult {
  const { transferDatePriceAvg1Month, shareCount, tradingHaltAtTransfer } = input;

  if (tradingHaltAtTransfer) {
    // 거래정지 시 양도일 종가평균 무효 → 비상장 보충 평가 fallback 신호
    // 실제 평가는 stock-valuation-unlisted(PR-2)에서 수행
    // 여기서는 거래정지 플래그만 전달
    return {
      perShareValue: 0,
      totalAcquisitionPrice: 0,
      method: "monthly_avg_listed",
      appliedRule: STOCK.ENFORCEMENT_DECREE_165_3_TRADING_HALT,
      tradingHaltFallback: true,
    };
  }

  if (!transferDatePriceAvg1Month || transferDatePriceAvg1Month <= 0) {
    // 입력 누락 — validate에서 차단해야 하지만 방어 처리
    return {
      perShareValue: 0,
      totalAcquisitionPrice: 0,
      method: "monthly_avg_listed",
      appliedRule: STOCK.SECTION_99_1_3_LISTED_AVG,
      tradingHaltFallback: false,
    };
  }

  const perShareValue = Math.floor(transferDatePriceAvg1Month);
  const totalAcquisitionPrice = perShareValue * shareCount;

  return {
    perShareValue,
    totalAcquisitionPrice,
    method: "monthly_avg_listed",
    appliedRule: STOCK.SECTION_99_1_3_LISTED_AVG,
    tradingHaltFallback: false,
  };
}
