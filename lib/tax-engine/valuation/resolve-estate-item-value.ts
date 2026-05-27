/**
 * EstateItem 평가액 도출 — §60 평가 우선순위 단일 진실 (J-1)
 *
 * 상증법 §60②③: 시가 우선(매매·감정·수용·공매 포함), 시가 곤란 시 §61~§66 보충적평가(기준시가·§63 비상장 등).
 *   → resolveEstateItemValue 5단계: marketValue(시가) → appraisedValue(감정가) → standardPrice(기준시가)
 *     → 주식 computeStockValuation(상장 시세·비상장 §63) → 0.
 *
 * 이동 이력 (J-1, lib/calc/stock-valuation.ts → 여기):
 *   resolveUnlistedDisplayMode·computeStockValuation의 내부 의존이 전부 엔진(property-valuation-stock·
 *   unlisted-orchestrator)이라 무손실 이동. 순수 엔진 deductions(family-business)가 lib/calc import 역전 없이
 *   재사용하기 위함. lib/calc/stock-valuation.ts는 본 모듈 re-export로 import 사이트 보존.
 *
 * 단일 진실: lib/calc/inheritance-deduction-suggest.ts getValuatedAmount = resolveEstateItemValue 재사용.
 *
 * Plan:   docs/00-pm/inheritance-family-business-raw-valuation-unification-j1.plan.md
 * Design: docs/02-design/features/inheritance-family-business-raw-valuation-unification-j1.engine.design.md
 */

import {
  evaluateListedStockValue,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { applyCapitalIncreaseShareValuation } from "@/lib/tax-engine/property-valuation/dividend-difference-section-63-2-3";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 비상장주식 표시 모드 도출 — 단일 진실 헬퍼.
 * (J-1 이동: lib/calc/stock-valuation.ts → 엔진. EstateItem 필드 접근만이라 무손실.)
 *
 * @param item EstateItem (category: "unlisted_stock" 상정)
 * @returns "simple" | "formal"
 */
export function resolveUnlistedDisplayMode(item: EstateItem): "simple" | "formal" {
  return item.unlistedValuationMode ?? (item.unlistedStockValuationV2 ? "formal" : "simple");
}

/**
 * 주식 자산 효과 평가액 도출.
 *
 * - 상장: listedStockAvgPrice × listedStockShares (§63①1가)
 * - 비상장 formal(V2): evaluateUnlistedStockV2 → totalValuation (시행령 §54)
 * - 비상장 simple(V1): calcUnlistedStockPerShareValue × ownedShares (시행령 §54)
 * - 기타·에러: 0
 *
 * 정밀도: Math.floor는 엔진 내부에서 처리됨.
 *
 * @param item EstateItem (category: "listed_stock" | "unlisted_stock")
 * @returns 평가액 (원, 정수). 계산 불가 시 0.
 */
export function computeStockValuation(item: EstateItem): number {
  if (item.category === "listed_stock") {
    const avg = item.listedStockAvgPrice ?? 0;
    const shares = item.listedStockShares ?? 0;
    if (avg <= 0 || shares <= 0) return 0;
    // §63②3호 (PR-L3): 상장법인 증자 신주(미상장) — 가목 평가액 − 배당차액(§57③·§18②)
    if (item.isCapitalIncreaseUnlistedShare) {
      const { perShareValue } = applyCapitalIncreaseShareValuation(
        avg,
        item.listedStockDividendDifference ?? 0,
        item.dividendBaseDateSameAsListed ?? false,
      );
      return perShareValue * shares; // shares = 증자 신주(미상장) 보유 수
    }
    return evaluateListedStockValue(avg, shares); // §63①1호가목 (기존, 무변경)
  }

  if (item.category === "unlisted_stock") {
    const activeMode = resolveUnlistedDisplayMode(item);

    if (activeMode === "formal" && item.unlistedStockValuationV2) {
      const v2 = item.unlistedStockValuationV2;
      if (v2.totalShares > 0 && v2.ownedShares > 0) {
        try {
          const result = evaluateUnlistedStockV2(v2);
          return result.totalValuation > 0 ? result.totalValuation : 0;
        } catch {
          return 0;
        }
      }
    }

    if (item.unlistedStockData) {
      const d = item.unlistedStockData;
      if (d.totalShares > 0 && d.ownedShares > 0) {
        // 부동산과다보유법인(시행령 §54① 본문 괄호) 가중치 반전 반영. 미지정 시 false(일반 법인).
        const result = calcUnlistedStockPerShareValue(d, d.isRealEstateHeavy ?? false);
        return result.perShareFinalValue * d.ownedShares;
      }
    }
  }

  return 0;
}

/**
 * EstateItem 평가액 — §60 평가 우선순위 (시가 → 감정가 → 기준시가 → 주식 보충평가 → 0).
 *
 * lib/calc/inheritance-deduction-suggest.ts getValuatedAmount와 동치(단일 진실).
 * 사업무관자산 차감(§15⑤2호)은 미포함 — gross 평가액 반환(호출처가 별도 적용).
 *
 * @param item EstateItem
 * @returns 평가액 (원, 정수). 도출 불가 시 0.
 */
export function resolveEstateItemValue(item: EstateItem): number {
  if (typeof item.marketValue === "number" && item.marketValue > 0) {
    return item.marketValue;
  }
  if (typeof item.appraisedValue === "number" && item.appraisedValue > 0) {
    return item.appraisedValue;
  }
  if (typeof item.standardPrice === "number" && item.standardPrice > 0) {
    return item.standardPrice;
  }
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    return computeStockValuation(item);
  }
  return 0;
}
