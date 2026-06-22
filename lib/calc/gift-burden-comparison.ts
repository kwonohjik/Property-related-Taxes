/**
 * gift-burden-comparison.ts — 부담부증여 세부담 비교 (단일 진실)
 *
 * 단순증여(채무 0 가정) 증여세 vs 부담부증여(증여세 + 양도소득세) 총 세부담을 비교한다.
 * UI(BurdenedGiftComparisonCard)는 이 함수를 import해 사용하고 자체 재계산하지 않는다
 * (feedback_ui_engine_dual_truth_avoidance).
 *
 * 설계: docs/02-design/features/burdened-gift-tax-burden-comparison.{engine,ui}.design.md
 */

import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

/** 부담부증여 세부담 비교 결과 */
export interface BurdenedGiftComparisonResult {
  /** 단순증여(채무 0) 시 증여세 결정세액 */
  simpleGiftTax: number;
  /** 부담부증여 시 증여세 결정세액 */
  burdenedGiftTax: number;
  /** 부담부증여 시 양도소득세 합계 (지방소득세 포함) */
  burdenedTransferTax: number;
  /** 부담부 총세부담 = burdenedGiftTax + burdenedTransferTax */
  burdenedTotal: number;
  /** 세부담 차이 = simpleGiftTax − burdenedTotal (음수 가능) */
  taxBurdenDiff: number;
}

/**
 * 단순증여 baseline 대비 부담부증여 총 세부담 비교.
 *
 * - simpleGiftTax: 동일 자산을 채무인수 없이 전부 무상증여로 가정한 증여세 결정세액
 * - burdenedTransferTax: 채무인수분 양도소득세 합계 (부동산 TransferTaxResult.totalTax
 *   + 주식 StockTransferResult.finalTax + StockTransferResult.localIncomeTax)
 *   (§88·§159)
 * - stockTransferTaxResults: 주식 부담부 양도소득세 결과 (추가, 기본값 [])
 */
export function computeBurdenedGiftComparison(
  simpleGiftResult: GiftTaxResult,
  giftResult: GiftTaxResult,
  transferTaxResults: TransferTaxResult[],
  stockTransferTaxResults: StockTransferResult[] = [],
): BurdenedGiftComparisonResult {
  const simpleGiftTax = simpleGiftResult.finalTax;
  const burdenedGiftTax = giftResult.finalTax;
  const reTransferTax = transferTaxResults.reduce(
    (sum, t) => sum + t.totalTax,
    0,
  );
  // StockTransferResult에는 totalTax 필드 없음 → finalTax + localIncomeTax
  const stockTransferTax = stockTransferTaxResults.reduce(
    (sum, r) => sum + r.finalTax + r.localIncomeTax,
    0,
  );
  const burdenedTransferTax = reTransferTax + stockTransferTax;
  const burdenedTotal = burdenedGiftTax + burdenedTransferTax;
  const taxBurdenDiff = simpleGiftTax - burdenedTotal; // 음수 가능 — 중립 표기
  return {
    simpleGiftTax,
    burdenedGiftTax,
    burdenedTransferTax,
    burdenedTotal,
    taxBurdenDiff,
  };
}
