/**
 * 자산 카드 토글 자동 노출 정책 (영농·가업·§22·§10 퇴직금 라디오)
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-05-22):
 *   - 상속세 및 증여세법 §18의3 + 시행령 §16⑤ (영농상속재산 범위)
 *   - 상속세 및 증여세법 §18의2 + 시행령 §15⑤ (가업상속재산 범위)
 *   - 상속세 및 증여세법 §22 + 시행령 §19① (금융재산 정의)
 *
 * 계획서: docs/00-pm/asset-toggle-auto-visibility.plan.md
 * 디자인: docs/02-design/features/asset-toggle-auto-visibility.ui.design.md
 *
 * 분기 우선순위 (위 → 아래):
 *   1. 활성 상태 우선 (회귀 0 보장 — hidden_permanent도 무력화)
 *   2. 신탁(§9) override (모든 카테고리에서 §22 default 노출)
 *   3. 매트릭스 §1-1~§1-4 적용
 */

import { resolveFinancialEligibility } from "@/lib/calc/financial-deduction-resolver";
import type { AssetCategory, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 타입
// ============================================================

/** 토글 자체의 노출 상태 (영농·가업·§22 토글에 적용) */
export type ToggleVisibility = "default" | "hidden_expandable" | "hidden_permanent";

/** 라디오 옵션 단위 노출 — 2-state (§10 퇴직금 옵션 등) */
export type RadioOptionVisibility = "visible" | "hidden";

export interface AssetToggleVisibility {
  /** §18의3 영농상속 토글 */
  farming: ToggleVisibility;
  /** §18의2 가업상속 토글 */
  familyBusiness: ToggleVisibility;
  /** §22 금융재산공제 토글 */
  financialDeduction: ToggleVisibility;
  /** DeemedCategorySection §10 퇴직금 라디오 옵션 노출 (토글이 아니라 라디오 1개 옵션 단위) */
  deemedRetirementOption: RadioOptionVisibility;
}

// ============================================================
// 매트릭스 — 9 카테고리 × 4 dimension
// ============================================================

const MATRIX: Record<AssetCategory, AssetToggleVisibility> = {
  real_estate_land: {
    farming: "default",
    familyBusiness: "default",
    financialDeduction: "hidden_expandable",
    deemedRetirementOption: "hidden",
  },
  real_estate_building: {
    farming: "default",
    familyBusiness: "default",
    financialDeduction: "hidden_expandable",
    deemedRetirementOption: "hidden",
  },
  real_estate_apartment: {
    farming: "hidden_permanent", // §16⑤ 농업용 건축물 미해당 (검증 정정)
    familyBusiness: "hidden_expandable", // §15⑤2호 나목 단서 (임직원 무상임대) 예외
    financialDeduction: "hidden_expandable",
    deemedRetirementOption: "hidden",
  },
  cash: {
    farming: "hidden_permanent",
    familyBusiness: "hidden_permanent",
    financialDeduction: "hidden_permanent", // §19① 금융회사등 취급 한정 — 일반 현금 미열거
    deemedRetirementOption: "visible",
  },
  financial: {
    farming: "hidden_permanent", // §16⑤ 미열거 (검증 정정)
    familyBusiness: "hidden_permanent", // §15⑤ 미해당 — 예금·펀드·채권은 가업용 사업자산 아님 (사업무관자산, 사용자 결정 2026-05-29)
    financialDeduction: "default", // §19① 예금·적금·부금·채권·수익증권 등
    deemedRetirementOption: "visible",
  },
  deposit: {
    farming: "hidden_permanent",
    familyBusiness: "hidden_permanent",
    financialDeduction: "hidden_expandable", // §19① 사인간 직접채권 미열거 (검증 정정)
    deemedRetirementOption: "visible",
  },
  listed_stock: {
    farming: "default", // 영농법인 주식 (§16② 50%+ 보유 요건 안내 강화)
    familyBusiness: "default",
    financialDeduction: "default", // §19① 주식 명시
    deemedRetirementOption: "visible",
  },
  unlisted_stock: {
    farming: "default",
    familyBusiness: "default",
    financialDeduction: "default",
    deemedRetirementOption: "visible",
  },
  other: {
    farming: "default", // §16⑤ 라·마목 어선·어업권·양식업권
    familyBusiness: "default",
    financialDeduction: "hidden_expandable",
    deemedRetirementOption: "visible",
  },
};

// ============================================================
// resolver — 단일 진입점
// ============================================================

/**
 * 자산 항목의 4개 토글/옵션 노출 상태를 판정한다.
 *
 * 분기 우선순위:
 *   1. 활성 상태 우선 (회귀 0 보장 — hidden_permanent도 default로 승격)
 *   2. 신탁(§9) override (모든 카테고리에서 financialDeduction default 승격)
 *   3. 매트릭스 적용
 */
export function resolveAssetToggleVisibility(
  item: EstateItem,
): AssetToggleVisibility {
  const base: AssetToggleVisibility = { ...MATRIX[item.category] };

  // 우선순위 2: 신탁(§9) override — 모든 카테고리에서 §22 default 노출
  // 인터뷰 결정 2 "신탁 §22 항상 노출" + §19① 금전신탁 한정으로 trustType=cash_trust일 때만 default ON
  if (item.deemedCategory === "trust") {
    base.financialDeduction = "default";
  }

  // 우선순위 1: 활성 상태 우선 (가장 마지막에 적용해서 모든 분기 무력화)
  if (item.farmingCategory !== undefined) {
    base.farming = "default";
  }
  if (item.familyBusinessCategory !== undefined) {
    base.familyBusiness = "default";
  }
  if (resolveFinancialEligibility(item)) {
    base.financialDeduction = "default";
  }
  if (item.deemedCategory === "retirement") {
    base.deemedRetirementOption = "visible";
  }

  // 법령 override: 주식 §22 일반 토글 비노출.
  // 주식은 §19①상 §22 기본 대상(eligible=true)이나, 일반 포함/제외 토글(이미지32)은
  // 주식에서 혼동 유발 → 비노출. 배제 판단은 §22② 최대주주 전용 토글로만 수행.
  // resolveFinancialEligibility 자체(eligible 결과)는 변경하지 않음
  // — 결과뷰 금액·suggest 계산에 영향 없음.
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    base.financialDeduction = "hidden_permanent";
  }

  return base;
}

// ============================================================
// 펼침 카운트 — UI 헬퍼
// ============================================================

/**
 * 펼침 링크에 표시할 hidden_expandable 토글 개수.
 * 0이면 펼침 링크 자체 미노출 (예: cash·deposit 자산).
 */
export function countHiddenExpandable(
  visibility: AssetToggleVisibility,
): number {
  let count = 0;
  if (visibility.farming === "hidden_expandable") count += 1;
  if (visibility.familyBusiness === "hidden_expandable") count += 1;
  if (visibility.financialDeduction === "hidden_expandable") count += 1;
  return count;
}
