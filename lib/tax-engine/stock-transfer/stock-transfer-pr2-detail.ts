/**
 * stock-transfer-pr2-detail.ts — PR-2 잔여 detail 산정 헬퍼
 *
 * 800줄 정책에 따라 stock-transfer-tax.ts에서 분리.
 * STEP 3.5 (매매사례가액 detail) + STEP 3.7 (자본조정 detail).
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { evaluateMarketSample } from "./stock-valuation-market-sample";
import { adjustShareCountAndCost } from "./stock-capital-adjustments";

export interface Pr2DetailResult {
  marketSampleDetail?: StockTransferResult["marketSampleDetail"];
  capitalAdjustmentsDetail?: StockTransferResult["capitalAdjustmentsDetail"];
  warningsDelta: string[];
}

/**
 * R-1' 매매사례가액 + R-2 자본조정 detail 일괄 산정.
 *
 * acquisitionPrice는 호출 시점 totalAcquisitionPrice (불변).
 * 양도차익 계산에는 acquisitionPrice 그대로 사용 — capital_adjustments는 표시 단가만 영향.
 */
export function buildPr2Detail(
  input: StockTransferInput,
  shareCount: number,
  acquisitionPrice: number,
  acquisitionMode: StockTransferInput["acquisitionMode"],
): Pr2DetailResult {
  const warningsDelta: string[] = [];
  let marketSampleDetail: StockTransferResult["marketSampleDetail"];
  let capitalAdjustmentsDetail: StockTransferResult["capitalAdjustmentsDetail"];

  // STEP 3.5: 매매사례가액 detail
  if (
    acquisitionMode === "sale_case" ||
    (input.transferMarketSamplePrice !== undefined && input.transferMarketSamplePrice > 0)
  ) {
    const msResult = evaluateMarketSample({
      shareCount,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      acquisitionMarketSamplePrice: input.acquisitionMarketSamplePrice,
      acquisitionMarketSampleDate: input.acquisitionMarketSampleDate,
      acquisitionMarketSampleCounterparty: input.acquisitionMarketSampleCounterparty,
      transferMarketSamplePrice: input.transferMarketSamplePrice,
      transferMarketSampleDate: input.transferMarketSampleDate,
      transferMarketSampleCounterparty: input.transferMarketSampleCounterparty,
    });
    if (msResult.acquisitionApplied || msResult.transferApplied) {
      marketSampleDetail = {
        acquisitionApplied: msResult.acquisitionApplied,
        transferApplied: msResult.transferApplied,
        acquisitionPerShare: msResult.acquisitionPerShare,
        transferPerShare: msResult.transferPerShare,
        acquisitionDeltaDays: msResult.acquisitionDeltaDays,
        transferDeltaDays: msResult.transferDeltaDays,
        acquisitionOverThreeMonths: msResult.acquisitionOverThreeMonths,
        transferOverThreeMonths: msResult.transferOverThreeMonths,
        warnings: msResult.warnings,
      };
      warningsDelta.push(...msResult.warnings);
      for (const rule of msResult.appliedRules) {
        if (!warningsDelta.includes(rule)) warningsDelta.push(rule);
      }
    }
  }

  // STEP 3.7: 자본조정 detail
  if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
    const caResult = adjustShareCountAndCost(
      shareCount,
      acquisitionPrice,
      input.capitalAdjustments,
    );
    capitalAdjustmentsDetail = {
      baseShareCount: caResult.baseShareCount,
      adjustedShareCount: caResult.adjustedShareCount,
      baseTotalCost: caResult.baseTotalCost,
      adjustedPerShareCost: caResult.adjustedPerShareCost,
      applied: caResult.applied,
      warnings: caResult.warnings,
    };
    warningsDelta.push(...caResult.warnings);
    for (const rule of caResult.appliedRules) {
      if (!warningsDelta.includes(rule)) warningsDelta.push(rule);
    }
    if (caResult.adjustedShareCount !== shareCount) {
      warningsDelta.push(
        `자본조정 환산 후 주식수(${caResult.adjustedShareCount}) ≠ 입력 양도 주식수(${shareCount}) — 입력 확인 권장.`,
      );
    }
  }

  return { marketSampleDetail, capitalAdjustmentsDetail, warningsDelta };
}
