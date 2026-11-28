/**
 * 주식 평가 독립 도구 — 결과(resultData) 빌더.
 *
 * 세금 계산 없이 주식 가치 평가만 수행하는 /tools/stock-valuation 전용.
 * 평가 산식은 엔진 단일 진실(computeStockValuation) 재사용 — 재구현 금지(dual-truth 회피).
 *
 * 이력 저장 resultData 4필드: 평가대상회사·평가기준일·주식수·평가액 (사용자 확정).
 * "평가대상회사"·"주식수"는 category별 추출 분기(상장/비상장 V2/비상장 V1)가 상이.
 *
 * Plan: docs/00-pm/stock-valuation-tool.plan.md
 */

import {
  computeStockValuation,
  resolveUnlistedDisplayMode,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { stockSmeReasonLargeSizeError } from "@/lib/calc/inheritance-validate-unlisted";

export interface StockValuationToolItemResult {
  id: string;
  /** 평가대상회사 — 상장: companyName||name / 비상장 V2: corpName / 비상장 V1: name */
  companyName: string;
  /** 주식 수 — category별 보유주식 수 */
  shares: number;
  /** 평가액 (원, 정수) — computeStockValuation 단일 진실 */
  valuationAmount: number;
  category: "listed_stock" | "unlisted_stock";
}

export interface StockValuationToolResult {
  valuationDate: string;
  items: StockValuationToolItemResult[];
  totalValuationAmount: number;
  /**
   * 계산 전에 막은 종목 — 상속·증여 ⑧·⑫가 막는 입력 조합(U-04 「9호 + 일반기업」).
   * 이 종목은 items·합계에서 빠진다(조용히 다른 할증률로 평가하지 않는다).
   */
  errors: { id: string; message: string }[];
}

/** 평가대상회사명 추출 — category별 분기. */
export function extractCompanyName(item: EstateItem): string {
  if (item.category === "listed_stock") {
    return item.companyName?.trim() || item.name?.trim() || "상장법인";
  }
  // 비상장: 정식평가(V2) 우선 corpName, 그 외 name
  if (resolveUnlistedDisplayMode(item) === "formal" && item.unlistedStockValuationV2) {
    return item.unlistedStockValuationV2.corpName?.trim() || item.name?.trim() || "비상장법인";
  }
  return item.name?.trim() || "비상장법인";
}

/** 보유주식 수 추출 — category별 분기. */
export function extractShares(item: EstateItem): number {
  if (item.category === "listed_stock") {
    return item.listedStockShares ?? 0;
  }
  if (resolveUnlistedDisplayMode(item) === "formal" && item.unlistedStockValuationV2) {
    return item.unlistedStockValuationV2.ownedShares ?? 0;
  }
  return item.unlistedStockData?.ownedShares ?? 0;
}

/**
 * 주식 목록 → 평가 결과 빌더.
 * 평가액 0(미입력·계산불가) 종목은 결과에서 제외(요약·합계 정합).
 */
export function buildStockValuationResult(
  stockItems: EstateItem[],
  valuationDate: string,
): StockValuationToolResult {
  const items: StockValuationToolItemResult[] = [];
  const errors: StockValuationToolResult["errors"] = [];
  let total = 0;
  for (const item of stockItems) {
    if (item.category !== "listed_stock" && item.category !== "unlisted_stock") continue;
    // 비상장은 정식평가(V2)로 평가될 때만 V2 칸을 읽는다 — computeStockValuation과 같은 모드 판정
    const blocked =
      item.category === "listed_stock" || resolveUnlistedDisplayMode(item) === "formal"
        ? stockSmeReasonLargeSizeError(item)
        : null;
    if (blocked) {
      errors.push({ id: item.id, message: blocked });
      continue;
    }
    const valuationAmount = computeStockValuation(item, valuationDate || undefined);
    if (valuationAmount <= 0) continue;
    items.push({
      id: item.id,
      companyName: extractCompanyName(item),
      shares: extractShares(item),
      valuationAmount,
      category: item.category,
    });
    total += valuationAmount;
  }
  return { valuationDate, items, totalValuationAmount: total, errors };
}
