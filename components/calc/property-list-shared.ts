/**
 * property-list-shared — 종부세 주택 목록 테이블·모달 공용 상수/헬퍼
 *
 * 합산배제 유형 라벨, 고급 옵션 설정 배지를 단일 출처로 제공한다.
 * 테이블(PropertyListTableView)의 "옵션" 컬럼과 모달(PropertyCardEditor)의
 * 고급 옵션 접힘 헤더 "설정됨" 배지가 동일 술어를 쓰도록 한다 (dual-truth 회피).
 */

import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

// §8④ 1세대1주택자 의제 특례 유형
export type Section8Para4Type =
  | "none"
  | "appurtenant_land_only"
  | "temporary_two_house"
  | "inherited_house"
  | "regional_low_price";

// ============================================================
// 합산배제 유형 레이블
// ============================================================

export const EXCLUSION_TYPE_OPTIONS: [string, string][] = [
  ["none", "합산배제 미신청"],
  ["private_purchase_rental_long", "민간매입임대 장기일반 (시행령 §3①2호)"],
  ["private_purchase_rental_short", "민간매입임대 단기 구법"],
  ["private_construction_rental", "민간건설임대 (시행령 §3①1호)"],
  ["public_support_rental", "공공지원민간임대 (시행령 §3①3호)"],
  ["public_construction_rental", "공공건설임대 (시행령 §3①4호)"],
  ["public_purchase_rental", "공공매입임대 (시행령 §3①5호)"],
  ["private_short_term_rental_6y_construction", "민간건설 단기민간임대 6년 (시행령 §3①10호)"],
  ["private_short_term_rental_6y_purchase", "민간매입 단기민간임대 6년 (시행령 §3①11호)"],
  ["unsold_housing", "미분양주택 (시행령 §4①1호)"],
  ["daycare_housing", "가정어린이집용 (시행령 §4①2호)"],
  ["employee_housing", "사원용 주택 (시행령 §4①3호)"],
  ["developer_unsold", "주택건설사업자 미분양 (시행령 §4①4호)"],
  ["cultural_heritage", "문화재 (시행령 §4①5호)"],
  ["religious", "종교단체 (시행령 §4①6호)"],
  ["senior_welfare", "노인복지주택 (시행령 §4①7호)"],
];

const EXCLUSION_LABEL_MAP = new Map(EXCLUSION_TYPE_OPTIONS);

/** 합산배제 유형 전체 라벨 (조문 괄호 포함) */
export function exclusionTypeLabel(type: string): string {
  return EXCLUSION_LABEL_MAP.get(type) ?? type;
}

/** 합산배제 짧은 라벨 (테이블 표시용 — 끝의 조문 괄호 제거). 미신청은 "" */
export function exclusionTypeShortLabel(type: string | undefined): string {
  if (!type || type === "none") return "";
  return exclusionTypeLabel(type).replace(/\s*\(.*\)\s*$/, "");
}

// ============================================================
// 고급 옵션 설정 배지 (테이블 "옵션" 컬럼 · 모달 고급옵션 접힘 헤더 공용)
// ============================================================

/**
 * 주택에 설정된 고급 옵션 라벨 배열 (입력 순서 고정).
 * 합산배제는 테이블에서 별도 컬럼으로 표시하므로, 옵션 컬럼에서는 호출부가 필터링한다.
 */
export function advancedOptionBadges(property: PropertyEntry): string[] {
  const badges: string[] = [];
  if (property.appurtenantSplitEnabled) badges.push("소유자 분리");
  if (property.multiFamilyEnabled) badges.push("다가구");
  if (property.exclusionType && property.exclusionType !== "none") badges.push("합산배제");
  if ((property.section8para4Type ?? "none") !== "none") badges.push("§8④ 의제");
  return badges;
}
