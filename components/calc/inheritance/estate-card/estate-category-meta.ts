/**
 * estate-category-meta — 자산 카테고리 라벨·아이콘·증여 노출 목록 (단일 출처)
 *
 * PropertyValuationForm·EstateItemEditor·EstateItemTableView 공유.
 * 테이블 전환 전에는 PropertyValuationForm 내부에 module-level로 있었으나,
 * 행(테이블)·모달(에디터) 양쪽에서 필요해 단일 출처로 추출.
 *
 * real_estate_apartment 키는 "주택"(아파트·공동·단독)을 의미 — 식별자(apartment)와
 * 표시명(주택)이 다른 것은 마이그레이션 회피 결정. real_estate_building 은 상업용·기타 건물.
 */

import type { SupportedCategory } from "@/lib/calc/deemed-category-policy";

export type { SupportedCategory };

export const CATEGORY_LABELS: Record<SupportedCategory, string> = {
  real_estate_land: "토지",
  real_estate_building: "상업용 건물",
  real_estate_apartment: "주택",
  cash: "현금",
  financial: "예금·펀드·채권·공제금",
  deposit: "전세보증금 반환채권",
  other: "기타 재산",
};

export const CATEGORY_ICONS: Record<SupportedCategory, string> = {
  real_estate_land: "🏔",
  real_estate_building: "🏢",
  real_estate_apartment: "🏠",
  cash: "💵",
  financial: "🏦",
  deposit: "🔑",
  other: "📦",
};

/** 증여세 폼에서 노출할 카테고리 (deposit 제외) */
export const GIFT_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "other",
];
