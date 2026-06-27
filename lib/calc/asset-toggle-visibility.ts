/**
 * 자산 카드 토글 자동 노출 정책 (영농·가업·§22·§10 퇴직금 라디오)
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-05-22):
 *   - 상속세 및 증여세법 §18의3 + 시행령 §16⑤ (영농상속재산 범위)
 *   - 상속세 및 증여세법 §18의2 + 시행령 §15⑤ (가업상속재산 범위)
 *   - 상속세 및 증여세법 §22 + 시행령 §19① (금융재산 정의)
 *
 * 계획서: docs/00-pm/asset-toggle-auto-visibility.plan.md
 * 계획서: docs/00-pm/deemed-category-toggle-visibility.plan.md (H2 드리프트 해소 2026-06-05)
 * 디자인: docs/02-design/features/asset-toggle-auto-visibility.ui.design.md
 *
 * 분기 우선순위 (위 → 아래):
 *   1. 매트릭스 §1-1~§1-4 적용
 *   2. 간주상속재산 deemed override (§8·§9·§10 정합 — H2 드리프트 해소 2026-06-05)
 *   3. 활성 상태 우선 (회귀 0 보장 — hidden_permanent도 무력화)
 *   4. 주식 §22 법령 override (hidden_permanent 최종 고정)
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
    // §19① 금융회사등 취급 한정 — 부동산 미열거, 해석례 없음 (정밀화 2026-06-05)
    financialDeduction: "hidden_permanent",
    deemedRetirementOption: "hidden",
  },
  real_estate_building: {
    farming: "default",
    familyBusiness: "default",
    // §19① 금융회사등 취급 한정 — 부동산 미열거, 해석례 없음 (정밀화 2026-06-05)
    financialDeduction: "hidden_permanent",
    deemedRetirementOption: "hidden",
  },
  real_estate_apartment: {
    farming: "hidden_permanent", // §16⑤ 농업용 건축물 미해당 (검증 정정)
    familyBusiness: "hidden_expandable", // §15⑤2호 나목 단서 (임직원 무상임대) 예외
    // §19① 금융회사등 취급 한정 — 부동산 미열거, 해석례 없음 (정밀화 2026-06-05)
    financialDeduction: "hidden_permanent",
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
  receivable: {
    farming: "hidden_permanent",
    familyBusiness: "hidden_permanent",
    financialDeduction: "hidden_expandable", // §19① 사인간 직접채권(대여금 등) 미열거 — deposit과 동일
    deemedRetirementOption: "hidden",
  },
  convertible_bond: {
    farming: "hidden_permanent",
    familyBusiness: "hidden_permanent",
    // §19①: 채권·유가증권은 금융재산이나 "금융회사등 취급" 요건 → 금융회사 보유분만 적격(상장 CB 등). 사인간 직접 보유분은 비적격 → 기본숨김+확장선택(KoreanLaw 검증 2026-06-27)
    financialDeduction: "hidden_expandable",
    deemedRetirementOption: "hidden",
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
  // 지상권 — 토지 위 권리, 영농·가업·금융공제·간주퇴직 모두 미대상
  superficies: {
    farming: "hidden_permanent",
    familyBusiness: "hidden_permanent",
    financialDeduction: "hidden_permanent",
    deemedRetirementOption: "hidden",
  },
  // 가상화폐(가상자산) — 영농·가업·§19① 금융재산공제(예금·채권 등 열거, 가상자산 미열거)·간주퇴직 모두 미대상
  crypto_asset: {
    farming: "hidden_permanent",
    familyBusiness: "hidden_permanent",
    financialDeduction: "hidden_permanent",
    deemedRetirementOption: "hidden",
  },
  other: {
    // §16⑤ 라·마목 어선·어업권·양식업권 — 현금성 노이즈 제거, 추가옵션·활성우선으로 접근 (정밀화 2026-06-05)
    farming: "hidden_expandable",
    // §15⑤ — 현금성 노이즈 제거, 추가옵션·활성우선으로 접근 (정밀화 2026-06-05)
    familyBusiness: "hidden_expandable",
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
 * 분기 우선순위 (순서 중요):
 *   1. 매트릭스 적용
 *   2. 간주상속재산 deemed override (§8 보험금·§9 신탁·§10 퇴직금 — 활성 우선 이전)
 *   3. 활성 상태 우선 (회귀 0 보장 — hidden_permanent도 default로 승격)
 *   4. 주식 §22 법령 override (항상 hidden_permanent — 활성 우선 이후 최종 고정)
 *
 * H2 드리프트 해소 (2026-06-05):
 *   기존 신탁 override가 trustType 무시하고 무조건 financialDeduction="default" 설정 →
 *   §19① 금전신탁만 §22 대상인데 비금전·부동산·증권신탁에도 오노출 (버그1).
 *   retirement에 financialDeduction override 부재 → financial base 선택 시 오노출 (버그2).
 *   보험금(§8) 금전수령권 → 영농·가업 자산 불가인데 base="other"일 때 추가옵션 잔존 (정밀화).
 */
export function resolveAssetToggleVisibility(
  item: EstateItem,
): AssetToggleVisibility {
  const base: AssetToggleVisibility = { ...MATRIX[item.category] };

  // 우선순위 2: 간주상속재산 deemed override (§8·§9·§10 정합 — 활성 우선 이전 적용)
  //   §19① "금융회사등이 취급하는 신탁재산(금전신탁재산에 한한다)·보험금·공제금"
  if (item.deemedCategory === "insurance") {
    // §8 보험금: 금전수령권 → 영농(§16⑤)·가업(§15⑤) 자산 불가. 금융공제는 활성 우선에서 처리.
    base.farming = "hidden_permanent";
    base.familyBusiness = "hidden_permanent";
  } else if (item.deemedCategory === "trust") {
    // §9 신탁: 금전신탁(cash_trust)만 §22 대상. 비금전·부동산·증권신탁·미선택 → 추가옵션.
    base.financialDeduction =
      item.trustType === "cash_trust" ? "default" : "hidden_expandable";
  } else if (item.deemedCategory === "retirement") {
    // §10 퇴직금: §19① 미열거 → §22 금융재산공제 완전 미대상. hidden_permanent 강제.
    base.financialDeduction = "hidden_permanent";
    base.deemedRetirementOption = "visible";
  }

  // 우선순위 3: 활성 상태 우선 (deemed 분기 후 — 명시 override·활성 토글 보호)
  //   DC-4: trust+real_estate + isFinancialAssetForDeduction=true 명시 → financialDeduction default 승격
  //   DC-5: insurance + farmingCategory 설정 → farming default 승격
  if (item.farmingCategory !== undefined) {
    base.farming = "default";
  }
  if (item.familyBusinessCategory !== undefined) {
    base.familyBusiness = "default";
  }
  if (resolveFinancialEligibility(item)) {
    base.financialDeduction = "default";
  }
  // retirement deemedRetirementOption은 deemed 분기에서 이미 처리됨.
  // 하단 블록은 non-retirement deemed 자산이 retirement base를 가지는 edge 케이스 보호.
  if (item.deemedCategory === "retirement") {
    base.deemedRetirementOption = "visible";
  }

  // 우선순위 4: 주식 §22 법령 override — 활성 우선 이후 최종 고정.
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

// ============================================================
// §74 지정문화유산 등 징수유예 토글 노출 (상증법 §74)
//   resolveAssetToggleVisibility(4-dimension)와 독립 — §74 대상은 실물 재산(부동산·기타)
//   한정이므로 자산 category 기반 별도 판정. ToggleVisibility 타입만 재사용(회귀 0).
// ============================================================

/** §74 대상은 부동산·기타재산 한정. 주식·금융·현금은 미대상(hidden_permanent). */
const CULTURAL_HERITAGE_VISIBILITY: Record<AssetCategory, ToggleVisibility> = {
  real_estate_land: "default",        // 토지 (한옥·보호구역 토지)
  real_estate_building: "default",    // 건물 (지정문화유산 건축물)
  real_estate_apartment: "hidden_expandable", // 아파트 문화유산 드묾 — 확장 노출
  cash: "hidden_permanent",
  financial: "hidden_permanent",
  deposit: "hidden_permanent",
  listed_stock: "hidden_permanent",
  unlisted_stock: "hidden_permanent",
  superficies: "hidden_permanent",     // 지상권 — §74 문화유산 미대상
  receivable: "hidden_permanent",      // 채권 — §74 문화유산 미대상
  convertible_bond: "hidden_permanent", // 전환사채등 — §74 문화유산 미대상
  crypto_asset: "hidden_permanent",     // 가상화폐(가상자산) — §74 문화유산 미대상
  other: "hidden_expandable",          // 동산(서화·골동품 등) — 확장 노출
};

/**
 * §74 지정문화유산 토글 노출 판정 (자산 category 기반).
 * 활성 우선: 이미 culturalHeritageType 선택 시 항상 default(회귀 0).
 */
export function resolveCulturalHeritageVisibility(
  item: EstateItem,
): ToggleVisibility {
  if (item.culturalHeritageType !== undefined) return "default";
  return CULTURAL_HERITAGE_VISIBILITY[item.category];
}
