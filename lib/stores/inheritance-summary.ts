/**
 * computeInheritanceSummary — 상속세 마법사 사이드바 합계 selector (지점 ⑥)
 *
 * 양도세 computeTransferSummary 패턴을 따르는 순수 함수.
 *
 * 사용 패턴 (무한 루프 방지):
 *   const summary = useMemo(() => computeInheritanceSummary(form, result), [form, result]);
 *
 * CLAUDE.md 정책:
 *   - 0원·null 항목 표시 제외 (입력 가능한 값만 노출)
 *   - 결과 도착 전(result === null)은 입력값으로 추정 표시
 *   - 결과 도착 후는 엔진 산정값 사용
 */

import type {
  EstateItem,
  InheritanceTaxResult,
  PresumedInheritanceItem,
  DebtItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { evaluatePresumedItem } from "@/lib/tax-engine/presumed-inheritance";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";

// ────────────────────────────────────────────────────
// 입력 — InheritanceTaxForm.shared 의 FormState 부분 집합
// ────────────────────────────────────────────────────

export interface InheritanceSummaryFormInput {
  estateItems: EstateItem[];
  stockItems: EstateItem[];
  presumedItems: PresumedInheritanceItem[];
  /**
   * 방안 C 3-state — undefined: OFF 모드(legacy) / []: ON 빈 / [...]: ON 데이터
   */
  debtItems: DebtItem[] | undefined;
  /** legacy 합산 채무 (debtItems undefined 또는 빈 배열일 때 사용) */
  debts: string;
  funeralExpense: string;
  funeralIncludesBongan: boolean;
  priorGifts: PriorGift[];
}

export interface InheritanceSummary {
  /** ① 총상속재산 — 본래(estateItems+stockItems valuation 추정) + 추정상속재산 §15 가산 */
  totalEstate: number;
  /** ② 상속세 과세가액 = 총상속 + 사전증여 가산 − 채무·공과·장례 차감 */
  taxableEstateValue: number;
  /** ③ 과세표준 (result 도착 전: null) */
  taxBase: number | null;
  /** ④ 자진납부세액 (result 도착 전: null) */
  estimatedTax: number | null;
  // ─── 보조 메타 (사이드바 fine-print용) ───
  presumedAdded: number; // §15 가산 합계
  totalDebts: number; // 채무·공과 합계 (장례 한도 적용 전)
  funeralApplied: number; // 장례 한도 적용 후 금액
  priorGiftTotal: number; // 사전증여 가산가액 (전체)
}

// ────────────────────────────────────────────────────
// 헬퍼 — 자산 평가액 추정 (engine 호출 없이 입력값만으로)
// ────────────────────────────────────────────────────

function estimateAssetValue(item: EstateItem): number {
  // V2 비상장주식 평가 우선 (Phase 5-C) — 입력 완성도 충분 시 자동 산정
  if (item.category === "unlisted_stock" && item.unlistedStockValuationV2) {
    const v2 = item.unlistedStockValuationV2;
    if (v2.totalShares > 0 && v2.ownedShares > 0) {
      try {
        const result = evaluateUnlistedStockV2(v2);
        if (result.totalValuation > 0) return result.totalValuation;
      } catch {
        // 평가 실패 시 marketValue·standardPrice 등으로 fallback
      }
    }
  }
  // marketValue 우선 → standardPrice → appraisedValue → listed*Shares
  if (item.marketValue && item.marketValue > 0) return item.marketValue;
  if (item.standardPrice && item.standardPrice > 0) return item.standardPrice;
  if (item.appraisedValue && item.appraisedValue > 0) return item.appraisedValue;
  if (
    item.listedStockAvgPrice &&
    item.listedStockShares &&
    item.listedStockAvgPrice > 0 &&
    item.listedStockShares > 0
  ) {
    return Math.floor(item.listedStockAvgPrice * item.listedStockShares);
  }
  return 0;
}

function parseAmountRaw(s: string): number {
  if (!s) return 0;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// ────────────────────────────────────────────────────
// 메인 selector
// ────────────────────────────────────────────────────

export function computeInheritanceSummary(
  form: InheritanceSummaryFormInput,
  result: InheritanceTaxResult | null,
): InheritanceSummary {
  // ── ① 본래상속재산 추정 ──
  const allEstateItems = [...form.estateItems, ...form.stockItems];
  const estateValueRaw = allEstateItems.reduce(
    (s, it) => s + estimateAssetValue(it),
    0,
  );

  // ── 추정상속재산 §15 가산 ──
  const presumedAdded = form.presumedItems.reduce(
    (s, it) => s + evaluatePresumedItem(it).addedAmount,
    0,
  );

  // ── 채무·공과·장례 ──
  let totalDebts = 0;
  let funeralApplied = 0;
  if (form.debtItems && form.debtItems.length > 0) {
    // 신규 debtItems 경로 — 카테고리별 합산 + 장례 한도
    let funeralMeal = 0;
    let funeralBongan = 0;
    for (const di of form.debtItems) {
      if (di.category === "funeral") {
        if (di.isBongan) funeralBongan += di.amount;
        else funeralMeal += di.amount;
      } else {
        totalDebts += di.amount;
      }
    }
    funeralApplied =
      Math.min(funeralMeal, 10_000_000) + Math.min(funeralBongan, 5_000_000);
  } else {
    // legacy 경로
    totalDebts = parseAmountRaw(form.debts);
    const funeralRaw = parseAmountRaw(form.funeralExpense);
    funeralApplied = form.funeralIncludesBongan
      ? Math.min(funeralRaw, 15_000_000)
      : Math.min(funeralRaw, 10_000_000);
  }

  // ── 사전증여 가산 (전체) ──
  const priorGiftTotal = form.priorGifts.reduce(
    (s, g) => s + g.giftAmount,
    0,
  );

  // ── 총상속재산 (본래+간주+추정) ──
  // 입력 단계에서는 간주상속재산(deemedCategory)도 estateItems에 포함되어 valuation됨
  const totalEstate = estateValueRaw + presumedAdded;

  // ── 상속세 과세가액 ──
  // result 도착 시 엔진값 우선, 미도착 시 입력값 추정
  const taxableEstateValue =
    result?.taxableEstateValue ??
    Math.max(0, totalEstate - totalDebts - funeralApplied + priorGiftTotal);

  // ── 과세표준·자진납부세액 — 엔진 결과 도착 시에만 ──
  const taxBase = result?.taxBase ?? null;
  // heirAllocationResult가 있으면 4명 합 (영리법인 finalTax=0)
  // 없으면 result.finalTax (총액 단위)
  let estimatedTax: number | null = null;
  if (result) {
    if (result.heirAllocationResult) {
      estimatedTax = Array.from(
        result.heirAllocationResult.perHeir.values(),
      ).reduce((s, h) => s + h.finalTax, 0);
    } else {
      estimatedTax = result.finalTax;
    }
  }

  return {
    totalEstate,
    taxableEstateValue,
    taxBase,
    estimatedTax,
    presumedAdded,
    totalDebts,
    funeralApplied,
    priorGiftTotal,
  };
}
