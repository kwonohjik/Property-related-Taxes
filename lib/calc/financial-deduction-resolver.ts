/**
 * §22 금융재산상속공제 — 자산·채무 적격 여부 판정 (순수 함수)
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-05-21):
 *   - 상속세 및 증여세법 §22 (mst=276123, 시행 2026-01-02)
 *   - 상속세 및 증여세법 시행령 §19① (금융재산 정의, mst=283637)
 *   - 시행령 §19④ (금융채무 정의 — §10① 1호 입증 금융회사등 채무 한정)
 *
 * UI·suggest 헬퍼·결과 카드 등 모든 §22 적격 판정은 본 모듈을 단일 진실로 import.
 * (정책: single-source-engine-helper)
 */

import type {
  AssetCategory,
  DebtItem,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 카테고리별 §22 default 매핑 (상증령 §19①)
// ============================================================

/**
 * AssetCategory → §22 금융재산 default true 여부.
 * §19①에 열거된 예금·적금·신탁(금전)·보험금·공제금·주식·채권·수익증권·출자지분·어음 등.
 *
 * deposit(전세보증금 반환채권)은 §19① "금융회사등이 취급" 한정에서 제외 — 임대인(사인)에 대한
 * 채권으로 금융회사 취급 금융재산이 아니므로 default 미적용(false). 사용자가 명시 ON 한 경우만 포함.
 * (채무 측 §19④도 동일 — leaseDeposit는 §22 차감 항상 제외. inheritance-gift.types.ts:103)
 */
const CATEGORY_DEFAULT: Partial<Record<AssetCategory, boolean>> = {
  // 공제금(§19① 명시 열거)은 §8 보험금(생명·손해보험만)에 미해당 → deemedCategory=insurance 아닌
  // financial로 분류. financial default true이므로 §22 금융재산공제 자동 적용 (PR6).
  financial: true,        // 예금·적금·부금·채권·수익증권·공제금 등
  listed_stock: true,     // 상장주식 (§22② 최대주주 보유분 제외는 사용자 override)
  unlisted_stock: true,   // 비상장주식 (§22② 최대주주 보유분 제외는 사용자 override)
  // deposit(전세보증금 반환채권)·cash·real_estate_*·other → undefined → false (§19① 미열거)
};

// ============================================================
// EstateItem §22 적격 판정
// ============================================================

/**
 * §22 금융재산공제 대상 여부 판정.
 *
 * 우선순위:
 *   1. 사용자 명시값 (item.isFinancialAssetForDeduction)
 *   2. deemedCategory override (§8 보험금=true, §9 신탁=trustType 의존, §10 퇴직금=false)
 *   3. 카테고리 default (CATEGORY_DEFAULT)
 *
 * 안전 default 정책: 모호한 경우(특히 신탁 trustType 미입력) false 채택 —
 * 사용자가 명시적으로 포함을 체크할 때만 true.
 */
export function resolveFinancialEligibility(item: EstateItem): boolean {
  // 우선순위 1: 사용자 명시값
  if (item.isFinancialAssetForDeduction !== undefined) {
    return item.isFinancialAssetForDeduction;
  }
  // 우선순위 2: deemedCategory override
  if (item.deemedCategory === "insurance") {
    // §8 보험금 — §19① 보험금 명시 → default true
    return true;
  }
  if (item.deemedCategory === "trust") {
    // §9 신탁재산 — §19① "금전신탁만". cash_trust만 true, 그 외(undefined 포함) false
    return item.trustType === "cash_trust";
  }
  if (item.deemedCategory === "retirement") {
    // §10 퇴직금 — §19① 미열거 → default false
    return false;
  }
  // 우선순위 3: 카테고리 default
  return CATEGORY_DEFAULT[item.category] ?? false;
}

// ============================================================
// DebtItem §22 적격 판정
// ============================================================

/**
 * §22 순금융재산 산식의 차감 채무 여부 판정.
 *
 * 상증령 §19④ — financial 카테고리(§10① 1호 입증 금융회사등 채무) 외에는 강제 false.
 * 사적채무·공과금·장례비는 override 불가.
 *
 * 우선순위:
 *   1. category !== "financial" → false (강제)
 *   2. 사용자 명시값 (debt.isFinancialDebtForDeduction)
 *   3. financial 카테고리 default true
 */
export function resolveFinancialDebt(debt: DebtItem): boolean {
  if (debt.category !== "financial") return false;
  if (debt.isFinancialDebtForDeduction !== undefined) {
    return debt.isFinancialDebtForDeduction;
  }
  return true;
}

// ============================================================
// 표시용 default 배지 (UI "기본 적용"/"기본 제외")
// ============================================================

/**
 * 사용자 명시값이 없을 때(undefined) 카테고리·deemedCategory·trustType 조합에서 도출되는
 * default 값. UI 배지 "기본 적용"/"기본 제외" 표시용.
 *
 * resolveFinancialEligibility와 동일 로직이되 isFinancialAssetForDeduction 우선순위는 무시.
 */
export function getCategoryDefaultEligibility(
  item: Pick<EstateItem, "category" | "deemedCategory" | "trustType">,
): boolean {
  if (item.deemedCategory === "insurance") return true;
  if (item.deemedCategory === "trust") return item.trustType === "cash_trust";
  if (item.deemedCategory === "retirement") return false;
  return CATEGORY_DEFAULT[item.category] ?? false;
}

/**
 * DebtItem default 배지용 — financial만 default true.
 */
export function getCategoryDefaultDebt(debt: Pick<DebtItem, "category">): boolean {
  return debt.category === "financial";
}
