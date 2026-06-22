"use client";

/**
 * PropertyValuationForm 보조 — 예상 평가액 미리보기 컴포넌트 (800줄 정책 분리)
 *
 * §66·시행령 §63: 저당권 등이 설정된 재산 = MAX(평가액, 담보채권액). 차감이 아니라 하한.
 * 담보채무 자체는 §14 부채로 별도 공제 (Phase 2 자동반영 전까지 부채 명세 수동 입력).
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import { evaluateEstateItem, resolveValuationMethod } from "@/lib/tax-engine/property-valuation";
import type { EstateItem, ValuationMethod } from "@/lib/tax-engine/types/inheritance-gift.types";

const REAL_ESTATE_CATEGORIES = new Set([
  "real_estate_land",
  "real_estate_building",
  "real_estate_apartment",
]);

/** §66 담보채권 하한 발동 여부 — 엔진 breakdown 권위 판정(근사 비교 금지·dual-truth 회피). 부동산만 의미. */
function isCollateralRaised(item: EstateItem): boolean {
  if (!REAL_ESTATE_CATEGORIES.has(item.category)) return false;
  try {
    return evaluateEstateItem(item).breakdown.some(
      (b) => b.label.includes("담보채권액") && b.label.includes("하한"),
    );
  } catch {
    return false;
  }
}

// ============================================================
// 예상 평가액 미리보기 (자산 1건) — 엔진 단일 진실 위임(estate-valuation-single-source)
// ============================================================

export function EstimatedValuePreview({ item }: { item: EstateItem }) {
  // 평가액·평가방법 모두 엔진 단일 진실로 위임 (§61⑤ 임대료환산·미임대·§66 담보하한 반영)
  const net = computeEffectiveValuation(item);
  if (net === 0) return null;

  const method: ValuationMethod =
    item.category === "deposit" ? "market_value" : resolveValuationMethod(item);
  // §66·§63② — 담보채권액(저당+임대보증금). net은 이미 Max(평가, 담보채권) 반영(엔진).
  const securedClaim = (item.leaseDeposit ?? 0) + (item.mortgageAmount ?? 0);
  const isReal = item.category !== "deposit";
  const collateralRaised = isCollateralRaised(item);

  const methodLabel: Record<ValuationMethod, string> = {
    market_value: "시가",
    appraisal: "감정가",
    standard_price: "보충적 평가",
    similar_sales: "유사매매사례",
    acquisition_cost: "취득가액",
    book_value: "장부가액",
  };

  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs space-y-1">
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>적용 방법</span>
        <span className="font-medium text-indigo-600 dark:text-indigo-400">
          {methodLabel[method]}
        </span>
      </div>
      {collateralRaised && (
        <div className="flex justify-between text-gray-500 dark:text-gray-400">
          <span>§66 담보채권액 하한</span>
          <span>{formatKRW(securedClaim)}</span>
        </div>
      )}
      {isReal && securedClaim > 0 && !collateralRaised && (
        <div className="flex justify-between text-amber-600 dark:text-amber-400">
          <span>담보채무 {formatKRW(securedClaim)}</span>
          <span>부채 명세 별도 공제</span>
        </div>
      )}
      <div className="flex justify-between font-semibold border-t border-gray-200 dark:border-gray-700 pt-1">
        <span>예상 평가액</span>
        <span className="text-indigo-700 dark:text-indigo-300">{formatKRW(net)}</span>
      </div>
    </div>
  );
}

// ============================================================
// 총 예상 평가액 합산
// ============================================================

export function TotalEstimatedValue({ items }: { items: EstateItem[] }) {
  // 엔진 단일 진실 위임 — 자산별 computeEffectiveValuation 합산(임대료환산·미임대·담보하한 반영)
  const total = items.reduce((sum, item) => sum + computeEffectiveValuation(item), 0);

  if (total === 0 || items.length === 0) return null;

  return (
    <div className="rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 flex justify-between items-center">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
        재산 합계 (예상)
      </span>
      <span className="text-base font-bold text-indigo-800 dark:text-indigo-200">
        {formatKRW(total)}
      </span>
    </div>
  );
}
