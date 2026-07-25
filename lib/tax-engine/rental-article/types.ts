/**
 * §167조의3①2호 장기임대주택 목별 판정 — 공용 타입.
 *
 * §155⑳ 거주주택특례(rental-housing-exception)와 다주택 중과 배제(multi-house-surcharge-count)가
 * 동일 조문을 참조하므로 판정 규칙을 단일 소스화(Phase 2). 본 파일은 목(article) 타입 정본.
 */

/** §167조의3①2호 가~자목 + 구 임대주택법. 다주택은 A~I를 가~자로 매핑(A가·B나·…·I자). */
export type SharedRentalArticle =
  | "가" | "나" | "다" | "라" | "마" | "바" | "사" | "아" | "자" | "구법";
