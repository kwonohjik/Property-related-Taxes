/**
 * 주식 자산 평가액 도출 — 단일 진실 함수 (Phase 0 lib 이동)
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §0 D-0
 * 정책: single-source-engine-helper · mirror-pattern (useEffect → store 미러링 금지)
 *
 * 이동 이력: components/calc/StockValuationForm.tsx:34 → lib/calc/stock-valuation.ts
 * 이유: lib 레이어가 component를 import하는 역방향 의존 금지 원칙.
 *       lib/calc/inheritance-deduction-suggest.ts 및 결과뷰가 동일 함수를 사용하기 위함.
 *
 * 소비처:
 *   (a) components/calc/StockValuationForm.tsx — UI 표시용 평가액 (기존 소비처)
 *   (b) lib/calc/inheritance-deduction-suggest.ts — §22 순금융재산 제안 (신규)
 *   (c) 결과뷰 InheritanceTaxResultView — §22 합산 표시 (UI 시니어 후속 연동용 export 제공)
 *
 * NOTE: marketValue(시가 직접 입력)가 있으면 해당 값이 우선 (AN-2 보존).
 * 이 함수는 marketValue 등 명시 평가액이 없을 때의 fallback 도출 전용.
 */

import {
  evaluateListedStockValue,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 주식 자산 효과 평가액 도출.
 *
 * - 상장: listedStockAvgPrice × listedStockShares (§63①1가)
 * - 비상장 formal(V2): evaluateUnlistedStockV2 → totalValuation (시행령 §54)
 * - 비상장 simple(V1): calcUnlistedStockPerShareValue × ownedShares (시행령 §54)
 * - 기타·에러: 0
 *
 * 정밀도: Math.floor 처리는 evaluateListedStockValue 내부에서 이미 처리됨.
 * V2/V1 결과값도 엔진 내부에서 절사 처리됨.
 *
 * @param item EstateItem (category: "listed_stock" | "unlisted_stock")
 * @returns 평가액 (원, 정수). 계산 불가 시 0.
 */
export function computeStockValuation(item: EstateItem): number {
  if (item.category === "listed_stock") {
    const avg = item.listedStockAvgPrice ?? 0;
    const shares = item.listedStockShares ?? 0;
    if (avg > 0 && shares > 0) return evaluateListedStockValue(avg, shares);
    return 0;
  }

  if (item.category === "unlisted_stock") {
    // 모드 판정 — resolveActiveUnlistedValuation과 동일 로직 (레거시 fallback 포함)
    const activeMode: "simple" | "formal" =
      item.unlistedValuationMode ?? (item.unlistedStockValuationV2 ? "formal" : "simple");

    if (activeMode === "formal" && item.unlistedStockValuationV2) {
      const v2 = item.unlistedStockValuationV2;
      if (v2.totalShares > 0 && v2.ownedShares > 0) {
        try {
          const result = evaluateUnlistedStockV2(v2);
          return result.totalValuation > 0 ? result.totalValuation : 0;
        } catch {
          // 입력 불완전 시 0 반환 (에러 throw 금지 — suggest fallback 용도)
          return 0;
        }
      }
    }

    // simple 모드 또는 formal인데 V2 데이터 없을 때 → V1 fallback
    if (item.unlistedStockData) {
      const d = item.unlistedStockData;
      if (d.totalShares > 0 && d.ownedShares > 0) {
        // 1주당 가액 × 보유주식수 (부동산과다보유 분기는 isRealEstateHeavy로 판정)
        const result = calcUnlistedStockPerShareValue(d, false);
        return result.perShareFinalValue * d.ownedShares;
      }
    }
  }

  return 0;
}
