/**
 * 주식 양도소득세 — 상장주식 환산 평가 모듈
 *
 * 산식 (시행령 §163⑨):
 *   환산취득가 = 실지양도가 × (취득시 기준시가 / 양도시 기준시가)
 *   취득시 기준시가 = 취득일 직전 1개월 종가평균 (모법 §99①3)
 *   양도시 기준시가 = 양도일 직전 1개월 종가평균 (모법 §99①3)
 *
 * 개산공제 (시행령 §163⑥4): 취득기준시가 총액 × 1%
 *
 * 거래정지·관리종목(tradingHaltAtTransfer=true): 시행령 §165③ → 비상장 보충 평가로 우회
 *   (호출자에서 분기 — 본 모듈은 일반 상장 환산 경로만 담당)
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { safeMultiply } from "@/lib/tax-engine/tax-utils";

export interface ListedValuationResult {
  /** 양도시 1주당 기준시가 (양도일 직전 1개월 종가평균) */
  perShareTransferStdPrice: number;
  /** 취득시 1주당 기준시가 (취득일 직전 1개월 종가평균) */
  perShareAcquisitionStdPrice: number;
  /** 환산비율 = 취득시 기준시가 / 양도시 기준시가 (소수, 표시 전용) */
  conversionRatio: number;
  /** 환산 후 1주당 취득가 (총액 ÷ 주식수, 표시 전용) */
  perShareAcquisitionPrice: number;
  /** 총액 환산취득가 (양도가 × 환산비율, floor 1회) */
  totalAcquisitionPrice: number;
  /** §163⑥4 개산공제 base — 취득기준시가 × shareCount */
  stdPriceTotalForEstimatedDeduction: number;
  method: "monthly_avg_listed";
  appliedRule: string;
  tradingHaltFallback: boolean;
}

/**
 * 상장주식 환산취득가 — 시행령 §163⑨ 직접 적용
 *
 * @param input — StockTransferInput (acquisitionDatePriceAvg1Month·transferDatePriceAvg1Month·shareCount 사용)
 * @param transferPrice — STEP 2에서 산정된 양도가액 총액 (원)
 */
export function calcListedValuation(
  input: StockTransferInput,
  transferPrice: number,
): ListedValuationResult {
  const { transferDatePriceAvg1Month, acquisitionDatePriceAvg1Month, shareCount, tradingHaltAtTransfer } = input;

  if (tradingHaltAtTransfer) {
    // 거래정지 시 양도일 종가평균 무효 → 비상장 보충 평가 fallback 신호
    return {
      perShareTransferStdPrice: 0,
      perShareAcquisitionStdPrice: 0,
      conversionRatio: 0,
      perShareAcquisitionPrice: 0,
      totalAcquisitionPrice: 0,
      stdPriceTotalForEstimatedDeduction: 0,
      method: "monthly_avg_listed",
      appliedRule: STOCK.ENFORCEMENT_DECREE_165_3_TRADING_HALT,
      tradingHaltFallback: true,
    };
  }

  const transferStd = transferDatePriceAvg1Month ?? 0;
  const acqStd = acquisitionDatePriceAvg1Month ?? 0;

  if (transferStd <= 0 || acqStd <= 0 || shareCount <= 0) {
    // 입력 누락 — validate에서 차단해야 하지만 방어 처리
    return {
      perShareTransferStdPrice: Math.floor(transferStd),
      perShareAcquisitionStdPrice: Math.floor(acqStd),
      conversionRatio: 0,
      perShareAcquisitionPrice: 0,
      totalAcquisitionPrice: 0,
      stdPriceTotalForEstimatedDeduction: 0,
      method: "monthly_avg_listed",
      appliedRule: STOCK.SECTION_99_1_3_LISTED_AVG,
      tradingHaltFallback: false,
    };
  }

  // 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가) — 총액 단위 floor 1회
  // safeMultiply: 양도가 5조+ 케이스 BigInt 안전망. 일반 범위에서는 일반 곱셈과 동일
  const totalAcquisitionPrice = Math.floor(
    safeMultiply(transferPrice, acqStd) / transferStd
  );
  const perShareAcquisitionPrice = Math.floor(totalAcquisitionPrice / shareCount);
  const conversionRatio = acqStd / transferStd;

  return {
    perShareTransferStdPrice: Math.floor(transferStd),
    perShareAcquisitionStdPrice: Math.floor(acqStd),
    conversionRatio,
    perShareAcquisitionPrice,
    totalAcquisitionPrice,
    // §163⑥4 base — 취득시 기준시가 총액 (1주당 × shareCount, 총액 단위 floor)
    stdPriceTotalForEstimatedDeduction: Math.floor(acqStd) * shareCount,
    method: "monthly_avg_listed",
    appliedRule: STOCK.SECTION_99_1_3_LISTED_AVG,
    tradingHaltFallback: false,
  };
}
