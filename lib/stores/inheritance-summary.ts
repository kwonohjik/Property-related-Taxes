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
  ExemptionCheckedItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { evaluateExemptions } from "@/lib/tax-engine/exemption-evaluator";
import { evaluatePresumedItem } from "@/lib/tax-engine/presumed-inheritance";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import {
  deriveCollateralDebts,
  sumCollateralDebt,
} from "@/lib/tax-engine/inheritance-collateral-debt";
import {
  FUNERAL_MIN,
  calcFuneralExpenseDeduction,
} from "@/lib/tax-engine/inheritance-gift-common";

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
  /** §9②2호: 봉안시설·자연장지 비용 — 빈 문자열이면 미입력(legacy fallback) */
  funeralBonganExpense?: string;
  funeralIncludesBongan: boolean;
  priorGifts: PriorGift[];
  /**
   * 비과세·과세가액 불산입 항목 목록 (상증법 §11·§12·§16·§17)
   * FormState.exemptionItems와 동일 타입 — spread({...form})로 런타임 전달됨.
   * 입력 중 과세가액 추정 시 evaluateExemptions에 직접 전달 (single-source).
   */
  exemptionItems?: ExemptionCheckedItem[];
  /**
   * 평가기준일 fallback — 상속개시일 또는 증여일 (YYYY-MM-DD)
   * 비상장 V2 evaluationDate 미입력 시 evaluateUnlistedStockV2에 주입.
   * mirror-pattern: useEffect 없이 순수 계산 시점에 주입.
   */
  valuationDate?: string;
}

export interface InheritanceSummary {
  /** ① 총상속재산 — 본래(estateItems+stockItems valuation 추정) + 추정상속재산 §15 가산 */
  totalEstate: number;
  /** ② 상속세 과세가액 = 총상속 + 사전증여 가산 − 채무·공과·장례 − 비과세·불산입 차감 */
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
  /**
   * 비과세·과세가액 불산입 추정액 (상증법 §11·§12·§16·§17)
   * result 도착 전: evaluateExemptions 추정값 / 도착 후: result.exemptAmount
   * 사이드바 "− 비과세·불산입" 행 표시용 (> 0일 때만 노출)
   */
  exemptEstimate: number;
}

// ────────────────────────────────────────────────────
// 헬퍼 — 자산 평가액 추정 (engine 호출 없이 입력값만으로)
// ────────────────────────────────────────────────────

/**
 * 자산 평가액 — 엔진 단일 소스(computeEffectiveValuation)에 위임.
 * 비상장 V1(unlistedStockData)·상장 §63 변형·deposit·similarSalesValue까지 엔진과 동일하게 반영.
 * dual-truth 제거 ([[feedback_ui_engine_dual_truth_avoidance]]). valuationDate는 V2 evaluationDate fallback용.
 */
function estimateAssetValue(item: EstateItem, valuationDate?: string): number {
  return computeEffectiveValuation(item, valuationDate);
}

function parseAmountRaw(s: string): number {
  if (!s) return 0;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// ────────────────────────────────────────────────────
// 그룹별 합계 헬퍼 (상속재산 단계 접기 헤더 요약용)
// computeInheritanceSummary와 동일 valuation 로직 공유 — 드리프트 방지
// ────────────────────────────────────────────────────

/**
 * EstateItem 배열(상속재산 목록·주식/지분 목록 각각)의 평가액 합계.
 * 비상장주식 모드 strip(resolveActiveUnlistedValuation) 후 estimateAssetValue 합산.
 */
export function sumEstateItemsValuation(
  items: EstateItem[],
  valuationDate?: string,
): number {
  return items
    .map(resolveActiveUnlistedValuation)
    .reduce((s, it) => s + estimateAssetValue(it, valuationDate), 0);
}

/** 추정상속재산(§15) 항목 배열의 가산액 합계. */
export function sumPresumedItems(items: PresumedInheritanceItem[]): number {
  return items.reduce((s, it) => s + evaluatePresumedItem(it).addedAmount, 0);
}

// ────────────────────────────────────────────────────
// 메인 selector
// ────────────────────────────────────────────────────

export function computeInheritanceSummary(
  form: InheritanceSummaryFormInput,
  result: InheritanceTaxResult | null,
): InheritanceSummary {
  // ── ① 본래상속재산 추정 ──
  // 비상장주식 모드 strip — simple 모드인데 V2가 잔존해도 평가 제외 (PR-3)
  // (그룹별 헬퍼 sumEstateItemsValuation 재사용 — 접기 헤더 요약과 단일 출처)
  const estateValueRaw =
    sumEstateItemsValuation(form.estateItems, form.valuationDate) +
    sumEstateItemsValuation(form.stockItems, form.valuationDate);

  // ── 추정상속재산 §15 가산 ──
  const presumedAdded = sumPresumedItems(form.presumedItems);

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
    // 상증령 §9②: 식대 clamp[500만,1천만] + 봉안 min(실제,500만). 엔진과 동일 단일진실 헬퍼.
    funeralApplied = calcFuneralExpenseDeduction(funeralMeal, funeralBongan).deduction;
  } else {
    // legacy/simple 경로 — funeralBonganExpense 있으면 §9②분리, 없으면 boolean compat
    totalDebts = parseAmountRaw(form.debts);
    const funeralRaw = parseAmountRaw(form.funeralExpense);
    if (form.funeralBonganExpense !== undefined && form.funeralBonganExpense !== "") {
      // 신규 분리 경로: §9②1호 clamp[500만,1천만] + §9②2호 min(실제,500만)
      const mealApplied = Math.min(Math.max(funeralRaw, FUNERAL_MIN), 10_000_000);
      const bonganRaw = parseAmountRaw(form.funeralBonganExpense);
      const bonganApplied = Math.min(Math.max(bonganRaw, 0), 5_000_000);
      funeralApplied = mealApplied + bonganApplied;
    } else {
      // legacy boolean 경로
      const funeralMaxLimit = form.funeralIncludesBongan ? 15_000_000 : 10_000_000;
      funeralApplied = Math.max(Math.min(funeralRaw, funeralMaxLimit), FUNERAL_MIN);
    }
  }

  // ── B6: 파생 담보채무 합산 (§14 자동공제) — 사이드바 totalDebts 포함 (설계 §3-4) ──
  // estateItems에서 deductSecuredClaimAsDebt===true 항목을 파생. store 쓰기 없음(derive only).
  const collateralDebtTotal = sumCollateralDebt(
    deriveCollateralDebts(form.estateItems),
  );
  totalDebts += collateralDebtTotal;

  // ── 사전증여 가산 (전체) ──
  const priorGiftTotal = form.priorGifts.reduce(
    (s, g) => s + g.giftAmount,
    0,
  );

  // ── 총상속재산 (본래+간주+추정) ──
  // 입력 단계에서는 간주상속재산(deemedCategory)도 estateItems에 포함되어 valuation됨
  const totalEstate = estateValueRaw + presumedAdded;

  // ── 비과세·과세가액 불산입 추정 (single-source: evaluateExemptions 엔진 헬퍼 재사용) ──
  // result 도착 후: result.exemptAmount (엔진 정확값)
  // result 미도착: 입력된 exemptionItems로 evaluateExemptions 추정 (UI 자체 재구현 금지)
  const items = form.exemptionItems ?? [];
  const exemptEstimate =
    result?.exemptAmount ??
    (items.length > 0
      ? evaluateExemptions(items, totalEstate, "inheritance").totalExemptAmount
      : 0);

  // ── 상속세 과세가액 ──
  // result 도착 시 엔진값 우선, 미도착 시 입력값 추정 (비과세 차감 포함 — §250 엔진 정합)
  const taxableEstateValue =
    result?.taxableEstateValue ??
    Math.max(
      0,
      totalEstate - exemptEstimate - totalDebts - funeralApplied + priorGiftTotal,
    );

  // ── 과세표준·자진납부세액 — 엔진 결과 도착 시에만 ──
  const taxBase = result?.taxBase ?? null;
  // heirAllocationResult가 있으면 4명 합 (영리법인 finalTax=0)
  // 없으면 result.finalTax (총액 단위)
  let estimatedTax: number | null = null;
  if (result) {
    if (result.heirAllocationResult) {
      estimatedTax = Object.values(
        result.heirAllocationResult.perHeir,
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
    exemptEstimate,
  };
}
