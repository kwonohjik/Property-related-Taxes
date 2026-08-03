/**
 * stock-transfer-exempt-result — K-OTC 비과세 분기 result 조립 헬퍼.
 *
 * [GAP-B] stock-transfer-tax.ts 800줄 정책 분리.
 * buildExemptResult + calcTransferPriceSimple 두 함수를 본 파일로 추출.
 * orchestrator(stock-transfer-tax.ts)는 import하여 그대로 사용.
 */

import type {
  StockTransferInput,
  StockTransferResult,
  LotMatchingDetail,
} from "./types/stock-transfer.types";
import { classifyStockTransfer } from "./stock-classification";
import { buildAppliedThreshold } from "./stock-transfer-helpers";
import { allocateLots } from "./lot-allocation";
import { computeInformationalAcquisition } from "./exempt-informational-acquisition";
import { calcSecuritiesTransactionTax } from "./securities-transaction-tax";

/** 분할 모드 활성 여부 — 비과세 분기에서도 lot 검산용 echo가 필요 */
function isSplitMode(input: StockTransferInput): boolean {
  return !!(
    input.acquisitionLots &&
    input.acquisitionLots.length > 0 &&
    input.transferLots &&
    input.transferLots.length > 0 &&
    input.costAllocationMethod
  );
}

/**
 * 비과세 분기 단순 양도가 산출 — actual(per_share|total) | exchange.
 * 비과세더라도 사용자가 입력한 데이터로 정보용 echo 시 필요.
 */
export function calcTransferPriceSimple(input: StockTransferInput): number {
  if (input.transferPriceMode === "actual") {
    const actualMode = input.transferActualInputMode ?? "per_share";
    if (actualMode === "total") return input.transferTotalPrice ?? 0;
    return (input.perShareTransferPrice ?? 0) * input.shareCount;
  }
  return (
    (input.exchangePropertyValue ?? 0) +
    (input.exchangeDebtRelief ?? 0) +
    (input.exchangeCash ?? 0)
  );
}

/**
 * K-OTC 비과세 (§94①3 나목 단서 등) 결과 조립.
 * 실제 세액은 0이지만 사용자가 입력한 데이터로 취득가액·평가 상세를 정보용으로 echo.
 */
export function buildExemptResult(
  input: StockTransferInput,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult {
  // 비과세 분기에서도 split 모드면 lotMatchingDetail 검산용 echo
  let lotMatchingDetail: LotMatchingDetail | undefined;
  if (isSplitMode(input)) {
    lotMatchingDetail = allocateLots(
      input.acquisitionLots!,
      input.transferLots!,
      input.costAllocationMethod!,
      false, // 비과세 분기에서 단기 30% 게이트 무의미
      input.isSmallMediumEnterprise,
      input.specificMatchings,
    );
  }

  // 비과세더라도 사용자가 입력한 데이터로 취득가액·평가 상세를 정보용으로 계산해 echo (실 세액은 0 유지)
  const transferPrice = calcTransferPriceSimple(input);
  const info = computeInformationalAcquisition(input, transferPrice, lotMatchingDetail);

  return {
    taxCategory: classification.taxCategory,
    appliedSection94: classification.appliedSection94,
    section94_2Applied: classification.section94_2Applied,
    isExempt: true,
    exemptReason: classification.exemptReason,
    // §104⑤ 크로스 조정용 호별 echo — **비과세는 전부 0**이다(aggregate
    // `computeOtherAssetComparativeTax`가 `!r.isExempt`로 거르는 것과 같은 규약).
    clause1BucketTaxBase: 0,
    clause1BucketTax: 0,
    clause9TaxBase: 0,
    clause9Tax: 0,

    transferPrice,
    transferPriceBreakdown: undefined,

    acquisitionPrice: info.acquisitionPrice,
    acquisitionMode: input.acquisitionMode,
    usedEstimatedAcquisition: info.usedEstimatedAcquisition,
    estimatedBase: info.estimatedBase,
    estimatedDeduction: undefined,

    valuationDetail: info.valuationDetail,

    basicDeductionGroup: classification.basicDeductionGroup,

    expenses: 0,
    expenseMode: input.expenseMode,

    transferIncome: 0,
    basicDeduction: 0,
    taxBase: 0,

    appliedRate: 0,
    progressiveDeduction: undefined,
    calculatedTax: 0,

    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,

    finalTax: 0,
    localIncomeTax: 0,

    holdingPeriodMonths: 0,
    holdingPeriodDays: 0,
    isShortTermHolding: false,

    lthdStartDate: null,

    appliedThreshold: buildAppliedThreshold(input, classification),

    warnings: classification.warnings,
    appliedRules: classification.appliedRules,
    // Round 4 C-02: 비과세 분기에서도 echo (UI 결과 카드 게이트 일관성)
    acquiredBeforeListing: input.acquiredBeforeListing,
    // E5-ⓑ: K-OTC 비과세 조기 반환 경로에도 증권거래세 echo (설계 STX-11)
    // ⚠️ spread 없는 명시 매핑 — TS 미감지, grep 자가점검 필수
    securitiesTransactionTax: calcSecuritiesTransactionTax(input, transferPrice),
  };
}
