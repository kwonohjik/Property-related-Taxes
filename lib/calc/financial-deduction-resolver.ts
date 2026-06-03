/**
 * §22 금융재산상속공제 — 자산·채무 적격 여부 판정 (순수 함수)
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-05-21):
 *   - 상속세 및 증여세법 §22 (mst=276123, 시행 2026-01-02)
 *   - 상속세 및 증여세법 시행령 §19① (금융재산 정의, mst=283637)
 *   - 시행령 §19④ (금융채무 정의 — §10① 1호 입증 금융회사등 채무 한정)
 *
 * M-5 수정 (2026-06-04):
 *   isFinancialAssetEligible / isSection22MajorShareholderExcluded / FINANCIAL_CATEGORY_DEFAULT 를
 *   lib/tax-engine/inheritance-tax-financial-eligibility.ts 단일 헬퍼로 위임.
 *   (rows↔base dual-truth 해소 — unlisted_stock undefined·cash_trust 누락 수정)
 *
 * 외부 import 사이트(UI·suggest·결과 카드 등)는 이 파일을 계속 사용 (barrel 역할 유지).
 * 단일 진실 판정 함수는 엔진 헬퍼에 있으며, 이 파일이 re-export.
 */

import type {
  DebtItem,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  isFinancialAssetEligible,
  isSection22MajorShareholderExcluded,
  FINANCIAL_CATEGORY_DEFAULT,
} from "@/lib/tax-engine/inheritance-tax-financial-eligibility";

// ============================================================
// EstateItem §22 적격 판정 — 엔진 단일 헬퍼 위임
// ============================================================

// 외부 사이트가 참조하는 isSection22MajorShareholderExcluded 유지 (re-export)
export { isSection22MajorShareholderExcluded };

/**
 * §22 금융재산공제 대상 여부 판정.
 *
 * 우선순위 (lib/tax-engine/inheritance-tax-financial-eligibility.ts 단일 진실):
 *   0. §22② 법정 강제 배제 (isSection22MajorShareholderExcluded) — 사용자 명시보다 우선
 *   1. 사용자 명시값 (item.isFinancialAssetForDeduction)
 *   2. deemedCategory override (§8 보험금=true, §9 신탁=trustType 의존, §10 퇴직금=false)
 *   3. 카테고리 default (FINANCIAL_CATEGORY_DEFAULT)
 *
 * 안전 default 정책: 모호한 경우(특히 신탁 trustType 미입력) false 채택 —
 * 사용자가 명시적으로 포함을 체크할 때만 true.
 */
export function resolveFinancialEligibility(item: EstateItem): boolean {
  return isFinancialAssetEligible(item);
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
 * isFinancialAssetEligible과 동일 로직이되 isFinancialAssetForDeduction 우선순위는 무시.
 * (엔진 헬퍼 FINANCIAL_CATEGORY_DEFAULT 참조로 통일)
 */
export function getCategoryDefaultEligibility(
  item: Pick<EstateItem, "category" | "deemedCategory" | "trustType">,
): boolean {
  if (item.deemedCategory === "insurance") return true;
  if (item.deemedCategory === "trust") return item.trustType === "cash_trust";
  if (item.deemedCategory === "retirement") return false;
  return FINANCIAL_CATEGORY_DEFAULT[item.category] ?? false;
}

/**
 * DebtItem default 배지용 — financial만 default true.
 */
export function getCategoryDefaultDebt(debt: Pick<DebtItem, "category">): boolean {
  return debt.category === "financial";
}
