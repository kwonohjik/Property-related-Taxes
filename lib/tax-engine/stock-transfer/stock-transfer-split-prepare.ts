/**
 * split(분할·다건 lot) 모드 사전 계산 — lot 매칭 전 단계 일괄 (stock-transfer-tax.ts 800줄 정책 분리)
 *
 * 순서(⑤⑥ 미리보기 `stock-split-preview.ts` 와 같다 — single-source):
 *   ① ① ctx 빌드(영 §176의2④1호) → ② 의제취득일 전 매수 lot ②(영 §176의2④2호) → ③ 자본조정 희석(발생일 이전 보유 lot) → ④ allocateLots
 */

import { applyPreDeemedToLots } from "./stock-pre-deemed-acquisition";
import { buildPreDeemedLotClause1Context } from "./stock-pre-deemed-lot-clause1";
import { applyCapitalAdjustmentsToLots } from "./lot-capital-adjustments";
import { allocateLots } from "./lot-allocation";
import type { classifyStockTransfer } from "./stock-classification";
import type { LotMatchingDetail, StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";

export interface SplitPrepared {
  lotMatchingDetail: LotMatchingDetail;
  lotCapitalAdjustmentsDetail?: StockTransferResult["lotCapitalAdjustmentsDetail"];
  /** ② 가 적용된 매수 lot echo (`preDeemedLotsDetail.lots`) */
  preDeemedLotDetails: ReturnType<typeof applyPreDeemedToLots>["details"];
  warnings: string[];
  appliedRules: StockTransferResult["appliedRules"];
}

export function prepareSplitLots(
  input: StockTransferInput,
  classification: ReturnType<typeof classifyStockTransfer>,
  is94_4: boolean,
): SplitPrepared {
  const warnings: string[] = [];
  const appliedRules: StockTransferResult["appliedRules"] = [];
  let lotCapitalAdjustmentsDetail: StockTransferResult["lotCapitalAdjustmentsDetail"];

  const isMajorAndNonSME =
    !input.isSmallMediumEnterprise &&
    (classification.taxCategory === "listed_major" || classification.taxCategory === "unlisted_major");
  // 의제취득일 전 매수 lot — 영 §176의2④2호 ② (자본조정 희석보다 앞) + ① ctx(매도 lot 별 비교는 allocateLots)
  const clause1 = buildPreDeemedLotClause1Context(input, is94_4);
  const preDeemedLots = applyPreDeemedToLots(input.acquisitionLots!, input.marketType, is94_4, clause1.ctx !== undefined);
  warnings.push(...preDeemedLots.warnings, ...clause1.warnings, ...clause1.appliedRules);
  if (preDeemedLots.applied) appliedRules.push("의제취득일물가상승가산");
  else if (clause1.ctx) {
    warnings.push("① 비교를 골랐지만 의제취득일 전 매수 lot 이 없어 비교할 대상이 없습니다(소득세법 시행령 §176의2④).");
  }
  // [A-2] 자본조정 lot 전처리 — 발생일 이전 보유 lot만 희석 (allocateLots 직전)
  let effectiveLots = preDeemedLots.lots;
  if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
    const ca = applyCapitalAdjustmentsToLots(effectiveLots, input.capitalAdjustments);
    effectiveLots = ca.adjustedLots;
    lotCapitalAdjustmentsDetail = ca.perLotApplied;
    warnings.push(...ca.warnings);
    // 자본조정 규칙은 warnings로 전달 — 단일모드(pr2-detail.ts) 패턴 일치, appliedRules union 미변경
    for (const r of ca.appliedRules) if (!warnings.includes(r)) warnings.push(r);
  }
  const lotMatchingDetail = allocateLots(
    effectiveLots,
    input.transferLots!,
    input.costAllocationMethod!,
    isMajorAndNonSME,
    input.isSmallMediumEnterprise,
    input.specificMatchings,
    preDeemedLots.applied ? clause1.ctx : undefined,
  );
  if (input.costAllocationMethod === "specific") appliedRules.push("로트개별법");
  else if (input.costAllocationMethod === "fifo") appliedRules.push("로트선입선출");
  else if (input.costAllocationMethod === "moving_avg") appliedRules.push("로트이동평균");
  warnings.push(...lotMatchingDetail.warnings);

  return {
    lotMatchingDetail,
    lotCapitalAdjustmentsDetail,
    preDeemedLotDetails: preDeemedLots.details,
    warnings,
    appliedRules,
  };
}
