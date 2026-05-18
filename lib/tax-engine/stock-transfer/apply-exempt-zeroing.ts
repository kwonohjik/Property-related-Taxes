/**
 * applyExemptZeroing — 비과세 분기 zero-out 헬퍼 (sibling)
 *
 * STEP 1~12를 정상 통과한 결과 객체에 비과세 단서(§94①3 가목 1) 단서 / 나목 단서 /
 * 조특법 §14①7호 등) 적용 — 최종 납부세액·가산세·세액공제만 0으로 강제하고
 * 양도가액·취득가액·필요경비·양도소득금액·과세표준·계산세액·적용세율 등 중간 산식값은
 * 모두 echo하여 결과 카드·신고서·PDF에 "정보용으로 표시" 가능하게 한다.
 *
 * 사용처: stock-transfer-tax.ts STEP 12 직후 — classification.isExempt가 true일 때만 호출.
 * 800줄 정책 회피로 stock-transfer-tax.ts에서 분리.
 */

import type {
  StockTransferResult,
} from "./types/stock-transfer.types";
import type { classifyStockTransfer } from "./stock-classification";

export function applyExemptZeroing(
  result: StockTransferResult,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult {
  return {
    ...result,
    // 비과세 분기 명시
    isExempt: true,
    exemptReason: classification.exemptReason,
    // 최종 세액 분기만 0 강제
    finalTax: 0,
    localIncomeTax: 0,
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    // 중간 산식값(transferPrice·acquisitionPrice·transferIncome·basicDeduction·
    // taxBase·calculatedTax·appliedRate·valuationDetail·postListingDetail 등)은
    // result에 그대로 보존되어 echo
  };
}
