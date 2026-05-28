/**
 * chip-config — 자산 카드 헤더 칩 도출 헬퍼
 *
 * Plan: docs/01-plan/estate-item-card-compaction.plan.md (v4)
 * UI Design: docs/02-design/features/estate-item-card-compaction.ui.design.md (v4)
 *
 * 본 모듈은 데이터 도출만 담당 — UI 렌더는 EstateItemHeaderChips.tsx.
 * tone 정적 매핑은 Tailwind JIT purge 안전을 위해 Record로 고정
 * ([[feedback_tailwind_static_tone_mapping]]).
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  resolveFinancialEligibility,
  getCategoryDefaultEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import { resolveAssetToggleVisibility } from "@/lib/calc/asset-toggle-visibility";
import { computeEffectiveValuation } from "@/components/calc/PropertyValuationForm";

// ============================================================
// 타입
// ============================================================

export type ChipTone = "gray" | "violet" | "amber" | "emerald" | "sky" | "rose";

export type ChipKey =
  | "estimated-value"
  | "classification"
  | "section22"
  | "heir-allocation"
  | "farming"
  | "family-business"
  | "secured-claim-14";

export interface ChipState {
  key: ChipKey;
  label: string;
  tone: ChipTone;
  isExpandable: boolean;
  isToggle: boolean;
  /** 사용자 지정값(기본값과 다름) 표시용 violet 외곽 */
  isUserOverride?: boolean;
  /** hover tooltip */
  tooltip?: string;
}

// ============================================================
// tone 정적 클래스 매핑 (JIT purge 안전)
// ============================================================

export const CHIP_TONE_CLASSES: Record<ChipTone, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700",
  violet:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800",
  amber:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800",
  emerald:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800",
  sky: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800",
  rose: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800",
};

/** 인라인 펼침 패널 외곽 (border-l-4 강조) */
export const INLINE_PANEL_TONE_CLASSES: Record<ChipTone, string> = {
  gray: "border-l-4 border-gray-400 bg-gray-50/40 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700",
  violet:
    "border-l-4 border-violet-400 bg-violet-50/40 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800",
  amber:
    "border-l-4 border-amber-400 bg-amber-50/40 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
  emerald:
    "border-l-4 border-emerald-400 bg-emerald-50/40 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800",
  sky: "border-l-4 border-sky-400 bg-sky-50/40 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800",
  rose: "border-l-4 border-rose-400 bg-rose-50/40 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800",
};

// ============================================================
// 분류(deemedCategory) 라벨
// ============================================================

const DEEMED_LABELS: Record<"none" | "insurance" | "trust" | "retirement", string> = {
  none: "일반",
  insurance: "보험금 §8",
  trust: "신탁 §9",
  retirement: "퇴직금 §10",
};

// ============================================================
// 칩 도출
// ============================================================

export interface ResolveChipsParams {
  item: EstateItem;
  mode: "inheritance" | "gift";
  heirsCount: number;
}

/**
 * 자산 1개에 노출할 칩 목록을 좌→우 우선순위 순으로 반환.
 * Design §5.2 정렬 기준.
 */
export function resolveChips({ item, mode, heirsCount }: ResolveChipsParams): ChipState[] {
  const chips: ChipState[] = [];

  // 1. chip-estimated-value (항상)
  const value = computeEffectiveValuation(item);
  chips.push({
    key: "estimated-value",
    label: value > 0 ? `평가액 ${value.toLocaleString()}` : "평가액 미입력",
    tone: "gray",
    isExpandable: false,
    isToggle: false,
    tooltip: value > 0 ? "적용 평가액 (§60 시가 우선)" : "시가·감정가·기준시가 미입력",
  });

  // 증여세 모드 또는 상속세 외 분기에서는 분류 외 칩 미노출
  if (mode !== "inheritance") {
    return chips;
  }

  const visibility = resolveAssetToggleVisibility(item);

  // 2. chip-classification
  const deemed = item.deemedCategory ?? "none";
  chips.push({
    key: "classification",
    label: DEEMED_LABELS[deemed],
    tone: deemed === "none" ? "violet" : "amber",
    isExpandable: true,
    isToggle: false,
    tooltip: "간주상속재산 분류 (§8·§9·§10) — 클릭하여 변경",
  });

  // 3. chip-section22 (visibility !== hidden_permanent · cash 자동 제외)
  if (visibility.financialDeduction !== "hidden_permanent") {
    const eligible = resolveFinancialEligibility(item);
    const defaultEligible = getCategoryDefaultEligibility(item);
    const isUserOverride =
      item.isFinancialAssetForDeduction !== undefined &&
      item.isFinancialAssetForDeduction !== defaultEligible;
    chips.push({
      key: "section22",
      label: eligible ? "§22 ✓" : "§22 ✗",
      tone: eligible ? "emerald" : "gray",
      isExpandable: false,
      isToggle: true,
      isUserOverride,
      tooltip: "§22 금융재산공제 (상증령 §19①) — 클릭하여 ON→OFF→기본 순환",
    });
  }

  // 4. chip-heir-allocation
  if (heirsCount > 0) {
    const allocations = item.heirAllocations;
    if (allocations === undefined) {
      chips.push({
        key: "heir-allocation",
        label: "법정분할",
        tone: "gray",
        isExpandable: true,
        isToggle: false,
        tooltip: "민법 §1009 자동 안분 — 클릭하여 협의분할 입력",
      });
    } else if (allocations.length === 0) {
      chips.push({
        key: "heir-allocation",
        label: "협의분할 (미입력)",
        tone: "amber",
        isExpandable: true,
        isToggle: false,
        tooltip: "분배 대상이 없습니다 — 상속인을 선택하세요",
      });
    } else {
      chips.push({
        key: "heir-allocation",
        label: "협의분할 ✓",
        tone: "sky",
        isExpandable: true,
        isToggle: false,
        tooltip: "상속인·수유자별 직접 분배 (민법 §1013·§1073)",
      });
    }
  }

  // 5. chip-farming
  if (visibility.farming !== "hidden_permanent") {
    chips.push({
      key: "farming",
      label: item.farmingCategory ? "영농 §16⑤ ✓" : "영농 §16⑤",
      tone: "violet",
      isExpandable: true,
      isToggle: false,
      tooltip: "영농상속 자산 분류 (§16⑤) — 클릭하여 분류 선택",
    });
  }

  // 6. chip-family-business
  if (visibility.familyBusiness !== "hidden_permanent") {
    chips.push({
      key: "family-business",
      label: item.familyBusinessCategory ? "가업 §15⑤ ✓" : "가업 §15⑤",
      tone: "violet",
      isExpandable: true,
      isToggle: false,
      tooltip: "가업상속 자산 분류 (§15⑤) — 클릭하여 분류 선택",
    });
  }

  // 7. chip-secured-claim-14 (ON일 때만 노출)
  if (item.deductSecuredClaimAsDebt === true) {
    chips.push({
      key: "secured-claim-14",
      label: "§14 담보공제",
      tone: "amber",
      isExpandable: false,
      isToggle: true,
      tooltip: "저당채무 §14 자동공제 ON — 클릭하여 OFF",
    });
  }

  return chips;
}

// ============================================================
// countNonDefaultOptions — ⚙️ 버튼 배지용
// ============================================================

export function countNonDefaultOptions(
  item: EstateItem,
  mode: "inheritance" | "gift",
): number {
  if (mode !== "inheritance") return 0;
  let n = 0;
  if ((item.deemedCategory ?? "none") !== "none") n++;
  const defaultEligible = getCategoryDefaultEligibility(item);
  if (
    item.isFinancialAssetForDeduction !== undefined &&
    item.isFinancialAssetForDeduction !== defaultEligible
  ) n++;
  if (item.heirAllocations !== undefined) n++;
  if (item.farmingCategory !== undefined) n++;
  if (item.familyBusinessCategory !== undefined) n++;
  if (item.deductSecuredClaimAsDebt === true) n++;
  return n;
}

// ============================================================
// §22 칩 3-state 순환 (undef → true → false → undef)
// ============================================================

export function cycleSection22(
  current: boolean | undefined,
): boolean | undefined {
  if (current === undefined) return true;
  if (current === true) return false;
  return undefined;
}
