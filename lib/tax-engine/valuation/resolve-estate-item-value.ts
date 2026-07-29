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
  evaluateListedStock,
  calcUnlistedStockPerShareValue,
} from "@/lib/tax-engine/property-valuation-stock";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { applyCapitalIncreaseShareValuation } from "@/lib/tax-engine/property-valuation/dividend-difference-section-63-2-3";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 비상장주식 표시 모드 도출 — 단일 진실 헬퍼.
 * (J-1 이동: lib/calc/stock-valuation.ts → 엔진. EstateItem 필드 접근만이라 무손실.)
 *
 * 우선순위 (2026-05-31 보강 — V1 사용자 보호):
 *   1. `unlistedValuationMode` 명시 → 그대로 사용 (사용자 명시 선택 최우선)
 *   2. `unlistedStockData` 존재 → "simple" (V1 사용자 보호. V2 객체가 stale 잔류해도 V1 우선)
 *   3. `unlistedStockValuationV2` 단독 → "formal"
 *   4. 모두 없음 → "simple" (default)
 *
 * 보강 사유: 사용자 store에 `unlistedValuationMode` 필드가 명시 저장되지 않은 채
 * V2 객체만 stale 잔류한 케이스(사용자가 한 번 V2 켰다가 V1로 복귀)에서,
 * 종전 default "formal" → V2 라우팅 → V1 산식 무시되어 dual-truth 발생.
 * `unlistedStockData` 존재 시 simple 우선으로 V1 사용자 보호. V2 정식 사용자는
 * unlistedStockData를 사용하지 않으므로 영향 없음(또는 mode 명시로 1순위 hit).
 *
 * @param item EstateItem (category: "unlisted_stock" 상정)
 * @returns "simple" | "formal"
 */
export function resolveUnlistedDisplayMode(item: EstateItem): "simple" | "formal" {
  if (item.unlistedValuationMode) return item.unlistedValuationMode;
  if (item.unlistedStockData) return "simple";
  if (item.unlistedStockValuationV2) return "formal";
  return "simple";
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
 * @param valuationDate 평가기준일(상속개시일·증여일) — V2 evaluationDate 미입력 시 fallback 주입.
 *   미전달 시 주입 안 함(기존 호출 동작 불변).
 * @returns 평가액 (원, 정수). 계산 불가 시 0.
 */
export function computeStockValuation(item: EstateItem, valuationDate?: string): number {
  if (item.category === "listed_stock") {
    const avg = item.listedStockAvgPrice ?? 0;
    const shares = item.listedStockShares ?? 0;
    if (avg <= 0 || shares <= 0) return 0;
    // §63③ 할증 (LS-02·LS-10): evaluateListedStock 통합 산식 사용 — 사이드바·결과뷰 단일 source
    try {
      const r = evaluateListedStock(item, {});
      return r.valuatedAmount;
    } catch {
      // 산식 폴백 — §63②3호만 우선 (기존 동작 호환)
      if (item.isCapitalIncreaseUnlistedShare) {
        const { perShareValue } = applyCapitalIncreaseShareValuation(
          avg,
          item.listedStockDividendDifference ?? 0,
          item.dividendBaseDateSameAsListed ?? false,
        );
        return perShareValue * shares;
      }
      return evaluateListedStockValue(avg, shares);
    }
  }

  if (item.category === "unlisted_stock") {
    const activeMode = resolveUnlistedDisplayMode(item);

    if (activeMode === "formal" && item.unlistedStockValuationV2) {
      let v2 = item.unlistedStockValuationV2;
      // V2 evaluationDate 미입력 시 valuationDate(상속개시일·증여일) fallback 주입
      if (!v2.evaluationDate && valuationDate) {
        const vd = new Date(valuationDate);
        if (!isNaN(vd.getTime())) v2 = { ...v2, evaluationDate: vd };
      }
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
  // 매매사례가액(§49④ "시가로 본다") — 시가·감정가 미입력 시 시가로 인정 (H-38).
  // §49② 단서로 해당 재산 시가(market/appraised) 있으면 위에서 먼저 return되어 자연 후순위.
  if (typeof item.similarSalesValue === "number" && item.similarSalesValue > 0) {
    return item.similarSalesValue;
  }
  // 상업용 건물 부수토지 개별공시지가(§61①1호) — 보충평가로 귀결될 때만 합산(시가류 미입력).
  // 엔진 evaluateDetachedHouse 동일 게이트. 매매사례가(§49④) 존재 시는 시가이므로 제외.
  const supplementaryLandAddon =
    item.category === "real_estate_building" &&
    !(typeof item.similarSalesValue === "number" && item.similarSalesValue > 0)
      ? (item.appurtenantLandStandardPrice ?? 0)
      : 0;
  if (typeof item.standardPrice === "number" && item.standardPrice > 0) {
    return item.standardPrice + supplementaryLandAddon;
  }
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    return computeStockValuation(item);
  }
  return supplementaryLandAddon;
}

/**
 * 자산에 담보된 채권액 = max(0, 저당액 − 신용보증액) + 임대보증금 (원, 정수).
 *
 * 단일 진실(dual-truth 방지):
 *  - §66 1호·§63② 평가 하한 (property-valuation.ts applyCollateralFloor)
 *  - §15⑤1호 개인가업 담보채무 차감 (deductions/family-business.ts resolveFamilyBusinessAssetValue)
 */
export function computeSecuredClaim(item: EstateItem): number {
  const mortgageNet = Math.max(
    0,
    (item.mortgageAmount ?? 0) - (item.creditGuaranteeAmount ?? 0),
  );
  return mortgageNet + (item.leaseDeposit ?? 0);
}
